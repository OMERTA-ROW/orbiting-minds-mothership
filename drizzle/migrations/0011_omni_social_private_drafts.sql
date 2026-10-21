CREATE TABLE public.omni_social_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL DEFAULT auth.uid(), project_id uuid NOT NULL,
 content jsonb NOT NULL CHECK (jsonb_typeof(content)='object' AND octet_length(content::text)<=12000),
 state text NOT NULL DEFAULT 'DRAFT' CHECK (state IN ('DRAFT','REVIEWED','STOPPED')),
 revision integer NOT NULL DEFAULT 1 CHECK (revision>0), reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (project_id,owner_id) REFERENCES public.beta_projects(id,owner_id) ON DELETE CASCADE
);
GRANT SELECT ON public.omni_social_drafts TO authenticated;
GRANT ALL ON public.omni_social_drafts TO service_role;
REVOKE ALL ON public.omni_social_drafts FROM PUBLIC,anon;
ALTER TABLE public.omni_social_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY social_owner_read ON public.omni_social_drafts FOR SELECT TO authenticated USING(owner_id=(SELECT auth.uid()));
CREATE INDEX omni_social_owner_idx ON public.omni_social_drafts(owner_id,updated_at DESC);
CREATE TRIGGER omni_social_audit AFTER INSERT OR UPDATE OR DELETE ON public.omni_social_drafts FOR EACH ROW EXECUTE FUNCTION public.record_beta_change();
CREATE FUNCTION public.omni_social_transition(_action text,_project uuid DEFAULT NULL,_id uuid DEFAULT NULL,_revision integer DEFAULT NULL,_content jsonb DEFAULT NULL,_approve boolean DEFAULT false) RETURNS public.omni_social_drafts LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.omni_social_drafts; k text; date_value timestamptz;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,11));
 IF _action NOT IN ('save','review','stop','stop_all') THEN RAISE EXCEPTION 'Unsupported draft action'; END IF;
 IF _action='stop_all' THEN
  UPDATE public.omni_social_drafts SET state='STOPPED',reviewed_at=NULL,revision=revision+1,updated_at=now() WHERE owner_id=auth.uid() AND state<>'STOPPED';
  RETURN NULL;
 END IF;
 IF _id IS NOT NULL THEN
  SELECT * INTO v FROM public.omni_social_drafts WHERE id=_id AND owner_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR v.revision IS DISTINCT FROM _revision THEN RAISE EXCEPTION 'Owned current draft required; reload'; END IF;
 END IF;
 IF _action='stop' THEN
  IF v.id IS NULL THEN RAISE EXCEPTION 'Saved draft required'; END IF;
  UPDATE public.omni_social_drafts SET state='STOPPED',reviewed_at=NULL,revision=revision+1,updated_at=now() WHERE id=v.id RETURNING * INTO v; RETURN v;
 END IF;
 IF EXISTS(SELECT 1 FROM public.beta_access WHERE user_id=auth.uid() AND paused) THEN RAISE EXCEPTION 'Account paused; only stopping allowed'; END IF;
 IF _action='review' THEN
  IF v.id IS NULL OR v.state<>'DRAFT' OR NOT _approve THEN RAISE EXCEPTION 'Exact draft and explicit review approval required'; END IF;
  IF v.content->>'rights' IS DISTINCT FROM 'true' OR v.content->>'privacy' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Rights and privacy review required'; END IF;
  UPDATE public.omni_social_drafts SET state='REVIEWED',reviewed_at=now(),revision=revision+1,updated_at=now() WHERE id=v.id RETURNING * INTO v; RETURN v;
 END IF;
 IF NOT _approve OR _content IS NULL OR jsonb_typeof(_content)<>'object' OR octet_length(_content::text)>12000 THEN RAISE EXCEPTION 'Consented bounded draft required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.beta_projects WHERE id=_project AND owner_id=auth.uid()) THEN RAISE EXCEPTION 'Owned project required'; END IF;
 IF v.id IS NOT NULL AND v.project_id<>_project THEN RAISE EXCEPTION 'Draft project cannot change'; END IF;
 FOR k IN SELECT jsonb_object_keys(_content) LOOP
  IF k NOT IN ('platform','accountLabel','title','body','altText','hashtags','license','targetDate','timezone','rights','privacy') THEN RAISE EXCEPTION 'Unsupported draft field'; END IF;
 END LOOP;
 IF _content->>'platform' IS NULL OR _content->>'platform' NOT IN ('youtube','instagram','facebook','tiktok','linkedin','x','pinterest') THEN RAISE EXCEPTION 'Supported planning platform required'; END IF;
 IF length(btrim(COALESCE(_content->>'accountLabel',''))) NOT BETWEEN 2 AND 100 OR length(btrim(COALESCE(_content->>'title',''))) NOT BETWEEN 2 AND 100 OR length(btrim(COALESCE(_content->>'body',''))) NOT BETWEEN 1 AND 3000 OR length(btrim(COALESCE(_content->>'license',''))) NOT BETWEEN 2 AND 500 THEN RAISE EXCEPTION 'Draft fields invalid'; END IF;
 IF length(COALESCE(_content->>'altText',''))>500 OR length(COALESCE(_content->>'hashtags',''))>300 OR length(COALESCE(_content->>'timezone','')) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Metadata invalid'; END IF;
 IF _content->>'rights' IS DISTINCT FROM 'true' OR _content->>'privacy' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Explicit rights and privacy consent required'; END IF;
 IF COALESCE(_content->>'targetDate','')<>'' THEN date_value:=(_content->>'targetDate')::timestamptz; END IF;
 IF _content::text ~* 'cyber[ _-]*link|-----BEGIN .*PRIVATE KEY|sk-[a-z0-9_-]{12,}' THEN RAISE EXCEPTION 'Excluded or sensitive content'; END IF;
 IF v.id IS NULL THEN
  IF (SELECT count(*) FROM public.omni_social_drafts WHERE owner_id=auth.uid())>=60 THEN RAISE EXCEPTION 'Draft storage full'; END IF;
  INSERT INTO public.omni_social_drafts(owner_id,project_id,content) VALUES(auth.uid(),_project,_content) RETURNING * INTO v;
 ELSE
  UPDATE public.omni_social_drafts SET content=_content,state='DRAFT',reviewed_at=NULL,revision=revision+1,updated_at=now() WHERE id=v.id RETURNING * INTO v;
 END IF;
 RETURN v;
END; $$;
REVOKE ALL ON FUNCTION public.omni_social_transition(text,uuid,uuid,integer,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.omni_social_transition(text,uuid,uuid,integer,jsonb,boolean) TO authenticated,service_role;
COMMENT ON TABLE public.omni_social_drafts IS 'Owner-only social planning and human review. Account labels and dates are declarations; no provider connection, jobs, posts or receipts. Stopping withdraws stored plans only.';
COMMENT ON FUNCTION public.omni_social_transition(text,uuid,uuid,integer,jsonb,boolean) IS 'Owner-scoped row-locked draft save/review/stop with optimistic revision. Never calls a provider, grants scopes, publishes or controls external systems.';