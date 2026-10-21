CREATE TABLE public.forge_creator_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL, project_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('canon','release')), revision integer NOT NULL DEFAULT 1,
 content jsonb NOT NULL CHECK(octet_length(content::text)<=24000), sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 asset_id uuid, canon_id uuid, state text NOT NULL DEFAULT 'DRAFT' CHECK(state IN ('DRAFT','REVIEWED','BUNDLE_PREPARED','REVOKED')),
 reviewed_at timestamptz, prepared_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,owner_id), UNIQUE(project_id,owner_id,kind,revision),
 FOREIGN KEY(project_id,owner_id) REFERENCES public.beta_projects(id,owner_id) ON DELETE CASCADE,
 FOREIGN KEY(asset_id,owner_id) REFERENCES public.studio_assets(id,owner_id),
 FOREIGN KEY(canon_id,owner_id) REFERENCES public.forge_creator_versions(id,owner_id)
);
REVOKE ALL ON public.forge_creator_versions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.forge_creator_versions TO authenticated;
GRANT ALL ON public.forge_creator_versions TO service_role;
ALTER TABLE public.forge_creator_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY creator_owner_read ON public.forge_creator_versions FOR SELECT TO authenticated USING(owner_id=(SELECT auth.uid()));
CREATE FUNCTION public.guard_creator_version() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.owner_id::text,9));
 IF NOT EXISTS(SELECT 1 FROM public.beta_access WHERE user_id=NEW.owner_id AND studio_approved AND NOT paused) THEN RAISE EXCEPTION 'Media approval and unpaused account required'; END IF;
 IF (SELECT count(*) FROM public.forge_creator_versions WHERE owner_id=NEW.owner_id)>=60 THEN RAISE EXCEPTION 'Sixty creator versions per account'; END IF;
 IF NEW.state<>'DRAFT' OR NEW.reviewed_at IS NOT NULL OR NEW.prepared_at IS NOT NULL THEN RAISE EXCEPTION 'New versions must start as drafts'; END IF;
 IF NEW.kind='canon' AND (NEW.asset_id IS NOT NULL OR NEW.canon_id IS NOT NULL) THEN RAISE EXCEPTION 'Canon cannot carry media or another canon'; END IF;
 IF NEW.asset_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.studio_assets WHERE id=NEW.asset_id AND owner_id=NEW.owner_id AND project_id=NEW.project_id AND rights_consent AND privacy_consent AND sha256 IS NOT NULL) THEN RAISE EXCEPTION 'Hashed owner-project media required'; END IF;
 IF NEW.canon_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.forge_creator_versions WHERE id=NEW.canon_id AND owner_id=NEW.owner_id AND project_id=NEW.project_id AND kind='canon') THEN RAISE EXCEPTION 'Owner-project canon required'; END IF;
 NEW.revision:=COALESCE((SELECT max(revision) FROM public.forge_creator_versions WHERE owner_id=NEW.owner_id AND project_id=NEW.project_id AND kind=NEW.kind),0)+1;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_creator_version() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER creator_guard BEFORE INSERT ON public.forge_creator_versions FOR EACH ROW EXECUTE FUNCTION public.guard_creator_version();
CREATE TRIGGER creator_audit AFTER INSERT OR UPDATE OR DELETE ON public.forge_creator_versions FOR EACH ROW EXECUTE FUNCTION public.record_beta_change();
CREATE FUNCTION public.forge_release_transition(_id uuid,_sha256 text,_action text,_rights boolean DEFAULT false,_privacy boolean DEFAULT false,_approve boolean DEFAULT false,_owned_site boolean DEFAULT false) RETURNS public.forge_creator_versions LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.forge_creator_versions; a public.beta_access;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 SELECT * INTO a FROM public.beta_access WHERE user_id=auth.uid() FOR SHARE;
 SELECT * INTO v FROM public.forge_creator_versions WHERE id=_id AND owner_id=auth.uid() AND kind='release' FOR UPDATE;
 IF NOT FOUND OR v.sha256<>_sha256 THEN RAISE EXCEPTION 'Owned exact release required'; END IF;
 IF _action='revoke' THEN
  IF v.state<>'REVOKED' THEN UPDATE public.forge_creator_versions SET state='REVOKED' WHERE id=v.id RETURNING * INTO v; END IF;
  RETURN v;
 END IF;
 IF NOT COALESCE(a.studio_approved,false) OR COALESCE(a.paused,true) THEN RAISE EXCEPTION 'Media approval and unpaused account required'; END IF;
 IF NOT (_rights AND _privacy AND _approve) THEN RAISE EXCEPTION 'Explicit rights privacy and export approval required'; END IF;
 IF v.state='REVOKED' THEN RAISE EXCEPTION 'Revoked release requires new draft'; END IF;
 IF v.content->>'channel'='rss' AND NOT _owned_site THEN RAISE EXCEPTION 'Owned site declaration required'; END IF;
 IF _action='review' THEN
  IF v.state='DRAFT' THEN UPDATE public.forge_creator_versions SET state='REVIEWED',reviewed_at=now() WHERE id=v.id RETURNING * INTO v; END IF;
 ELSIF _action='prepare' THEN
  IF v.state NOT IN ('REVIEWED','BUNDLE_PREPARED') THEN RAISE EXCEPTION 'Review exact draft before preparing'; END IF;
  IF v.state='REVIEWED' THEN UPDATE public.forge_creator_versions SET state='BUNDLE_PREPARED',prepared_at=now() WHERE id=v.id RETURNING * INTO v; END IF;
 ELSE RAISE EXCEPTION 'Unsupported release action'; END IF;
 RETURN v;
END; $$;
REVOKE ALL ON FUNCTION public.forge_release_transition(uuid,text,text,boolean,boolean,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.forge_release_transition(uuid,text,text,boolean,boolean,boolean,boolean) TO authenticated,service_role;
COMMENT ON TABLE public.forge_creator_versions IS 'Private immutable canon and release drafts. Review and repeat-safe bundle preparation are local export intentions, not platform delivery, verified hosting, rights proof, schedules or autopublish. Revocation cannot recall downloaded files.';
COMMENT ON FUNCTION public.forge_release_transition(uuid,text,text,boolean,boolean,boolean,boolean) IS 'Authenticated owner-scoped row-locked export review/revoke/prepare; no external API, platform receipt or public publishing.';