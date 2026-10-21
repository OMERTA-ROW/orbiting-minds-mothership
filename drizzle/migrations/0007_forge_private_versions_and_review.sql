CREATE TABLE public.forge_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL, project_id uuid NOT NULL,
 kind text NOT NULL CHECK (kind IN ('radio','web')), revision integer NOT NULL CHECK(revision BETWEEN 1 AND 100),
 source_id uuid, output_id uuid, content jsonb NOT NULL CHECK (octet_length(content::text)<=24000),
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'), evidence jsonb NOT NULL CHECK(octet_length(evidence::text)<=16000),
 processor text NOT NULL, cost_status text NOT NULL DEFAULT 'UNKNOWN' CHECK(cost_status='UNKNOWN'), actual_cost numeric CHECK(actual_cost IS NULL),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,owner_id), UNIQUE(id,owner_id,sha256), UNIQUE(project_id,owner_id,kind,revision),
 FOREIGN KEY(project_id,owner_id) REFERENCES public.beta_projects(id,owner_id) ON DELETE CASCADE,
 FOREIGN KEY(source_id,owner_id) REFERENCES public.studio_assets(id,owner_id) ON DELETE SET NULL (source_id),
 FOREIGN KEY(output_id,owner_id) REFERENCES public.studio_assets(id,owner_id) ON DELETE SET NULL (output_id),
 CHECK ((kind='radio' AND source_id IS NOT NULL AND output_id IS NOT NULL) OR kind='web')
);
REVOKE ALL ON public.forge_versions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.forge_versions TO authenticated;
GRANT ALL ON public.forge_versions TO service_role;
ALTER TABLE public.forge_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY forge_owner_read ON public.forge_versions FOR SELECT TO authenticated USING(owner_id=(SELECT auth.uid()));
CREATE TABLE public.forge_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL DEFAULT auth.uid(), version_id uuid NOT NULL,
 sha256 text NOT NULL, rights_consent boolean NOT NULL CHECK(rights_consent), privacy_consent boolean NOT NULL CHECK(privacy_consent),
 export_approved boolean NOT NULL CHECK(export_approved), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(version_id,owner_id),
 FOREIGN KEY(version_id,owner_id,sha256) REFERENCES public.forge_versions(id,owner_id,sha256) ON DELETE CASCADE
);
REVOKE ALL ON public.forge_reviews FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,DELETE ON public.forge_reviews TO authenticated;
GRANT ALL ON public.forge_reviews TO service_role;
ALTER TABLE public.forge_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY forge_review_owner_read ON public.forge_reviews FOR SELECT TO authenticated USING(owner_id=(SELECT auth.uid()));
CREATE POLICY forge_review_owner_insert ON public.forge_reviews FOR INSERT TO authenticated WITH CHECK(owner_id=(SELECT auth.uid()) AND EXISTS(SELECT 1 FROM public.beta_access a WHERE a.user_id=(SELECT auth.uid()) AND a.studio_approved AND NOT a.paused));
CREATE POLICY forge_review_owner_delete ON public.forge_reviews FOR DELETE TO authenticated USING(owner_id=(SELECT auth.uid()));
CREATE FUNCTION public.guard_forge_version() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.owner_id::text,7));
 IF NOT EXISTS(SELECT 1 FROM public.beta_access a WHERE a.user_id=NEW.owner_id AND a.studio_approved AND NOT a.paused) THEN RAISE EXCEPTION 'Media approval required and account must not be paused'; END IF;
 IF (SELECT count(*) FROM public.forge_versions WHERE owner_id=NEW.owner_id)>=40 THEN RAISE EXCEPTION 'Forty Forge versions per account'; END IF;
 IF NEW.kind='radio' AND NOT EXISTS(SELECT 1 FROM public.studio_assets s JOIN public.studio_assets o ON o.source_id=s.id WHERE s.id=NEW.source_id AND o.id=NEW.output_id AND s.owner_id=NEW.owner_id AND o.owner_id=NEW.owner_id AND s.project_id=NEW.project_id AND o.project_id=NEW.project_id AND s.role='original' AND o.role='enhanced') THEN RAISE EXCEPTION 'Owner-project radio lineage required'; END IF;
 NEW.revision:=COALESCE((SELECT max(revision) FROM public.forge_versions WHERE owner_id=NEW.owner_id AND project_id=NEW.project_id AND kind=NEW.kind),0)+1;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_forge_version() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER forge_version_guard BEFORE INSERT ON public.forge_versions FOR EACH ROW EXECUTE FUNCTION public.guard_forge_version();
CREATE TRIGGER forge_version_audit AFTER INSERT OR DELETE ON public.forge_versions FOR EACH ROW EXECUTE FUNCTION public.record_beta_change();
CREATE TRIGGER forge_review_audit AFTER INSERT OR DELETE ON public.forge_reviews FOR EACH ROW EXECUTE FUNCTION public.record_beta_change();
COMMENT ON TABLE public.forge_versions IS 'Private server-derived immutable radio/web versions, not queue jobs, cryptographic signatures, independent QA, rights proof or external deployment. Costs unknown. Linked media must be retained while version exists.';
COMMENT ON TABLE public.forge_reviews IS 'Owner review tied to exact version SHA-256, never independent review or publication authority.';