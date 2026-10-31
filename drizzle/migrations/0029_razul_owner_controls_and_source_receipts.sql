-- Preserve existing records and public-feed access; private infrastructure and control RPCs require the single verified MFA owner.
CREATE OR REPLACE FUNCTION public.is_razul_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL
    AND COALESCE(public.has_role(auth.uid(), 'owner'), false)
    AND COALESCE(auth.jwt()->>'aal', '') = 'aal2'
    AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL)
$$;
REVOKE ALL ON FUNCTION public.is_razul_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_razul_owner() TO authenticated;

CREATE OR REPLACE FUNCTION public.assert_razul_owner()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF public.is_razul_owner() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Verified Razul owner with strong MFA required' USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_razul_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_razul_owner() TO authenticated;

-- Replace the known NULL-unsafe owner/admin guard in all existing Razul controls, preserving their bodies/signatures/data.
DO $block$
DECLARE r record; definition text;
BEGIN
  FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('razul_pause','razul_resume','razul_configure','razul_enroll_sentinel','razul_revoke_sentinel','razul_dispatch_scout','razul_upsert_passport')
  LOOP
    definition := pg_get_functiondef(r.oid);
    IF position('if public.caller_role() not in (''owner'', ''admin'') then' in lower(definition)) = 0 THEN
      RAISE EXCEPTION 'Unexpected Razul control definition';
    END IF;
    definition := regexp_replace(definition, 'if public\.caller_role\(\) not in \(''owner'', ''admin''\) then', 'if public.is_razul_owner() IS DISTINCT FROM true then', 'i');
    definition := replace(definition, 'Only the owner or an admin', 'Only the verified MFA owner');
    EXECUTE definition;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.oid::regprocedure);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.oid::regprocedure);
  END LOOP;
END $block$;

-- Existing broader reader policies cannot override these restrictive infrastructure gates.
DO $block$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['razul_sentinels','razul_sentinel_events','razul_dispatch_queue','razul_project_passports','razul_job_state','razul_runs','razul_agent_feeds','razul_agent_feedback','razul_alert_events','razul_query_cache','razul_query_log'] LOOP
    EXECUTE format('CREATE POLICY "Razul private owner boundary" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.is_razul_owner()) WITH CHECK (public.is_razul_owner())', t);
    EXECUTE format('CREATE POLICY "Razul owner reads" ON public.%I FOR SELECT TO authenticated USING (public.is_razul_owner())', t);
  END LOOP;
END $block$;
CREATE POLICY "Private Sentinel findings boundary" ON public.razul_findings AS RESTRICTIVE FOR SELECT TO authenticated
 USING (source_id NOT LIKE 'sentinel:%' OR public.is_razul_owner());
CREATE POLICY "Razul owner reads findings" ON public.razul_findings FOR SELECT TO authenticated USING (public.is_razul_owner());
CREATE POLICY "Private Sentinel source boundary" ON public.razul_sources AS RESTRICTIVE FOR SELECT TO authenticated
 USING (kind <> 'sentinel' OR public.is_razul_owner());
CREATE POLICY "Razul owner reads sources" ON public.razul_sources FOR SELECT TO authenticated USING (public.is_razul_owner());

CREATE TABLE public.razul_source_checks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_id text NOT NULL REFERENCES public.razul_sources(id) ON DELETE CASCADE,
 run_id uuid NOT NULL REFERENCES public.razul_runs(id) ON DELETE CASCADE,
 checked_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL CHECK (status IN ('completed','failed')),
 fetched integer NOT NULL DEFAULT 0 CHECK (fetched >= 0),
 inserted integer NOT NULL DEFAULT 0 CHECK (inserted >= 0),
 error_code text CHECK (error_code IN ('fetch-failed','processing-failed','receipt-failed')),
 UNIQUE(source_id, run_id)
);
GRANT SELECT ON public.razul_source_checks TO authenticated;
GRANT ALL ON public.razul_source_checks TO service_role;
ALTER TABLE public.razul_source_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads source receipts" ON public.razul_source_checks FOR SELECT TO authenticated USING (public.is_razul_owner());
CREATE INDEX razul_source_checks_recent ON public.razul_source_checks(source_id, checked_at DESC);

CREATE TABLE public.razul_control_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id uuid,
 action text NOT NULL,
 record_type text NOT NULL,
 record_id text NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.razul_control_audit TO authenticated;
GRANT ALL ON public.razul_control_audit TO service_role;
ALTER TABLE public.razul_control_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads control audit" ON public.razul_control_audit FOR SELECT TO authenticated USING (public.is_razul_owner());

CREATE OR REPLACE FUNCTION public.record_razul_control_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
 INSERT INTO public.razul_control_audit(actor_id,action,record_type,record_id)
 VALUES(auth.uid(), TG_OP, TG_TABLE_NAME, COALESCE(to_jsonb(NEW)->>'id',to_jsonb(NEW)->>'agent','singleton'));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.record_razul_control_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER razul_state_control_audit AFTER UPDATE ON public.razul_job_state FOR EACH ROW
 WHEN (NEW.paused_reason IS DISTINCT FROM OLD.paused_reason OR NEW.retention_days IS DISTINCT FROM OLD.retention_days OR NEW.alert_threshold IS DISTINCT FROM OLD.alert_threshold OR NEW.coverage IS DISTINCT FROM OLD.coverage OR NEW.blocked_sources IS DISTINCT FROM OLD.blocked_sources)
 EXECUTE FUNCTION public.record_razul_control_change();
CREATE TRIGGER razul_feed_control_audit AFTER INSERT OR UPDATE ON public.razul_agent_feeds FOR EACH ROW EXECUTE FUNCTION public.record_razul_control_change();
CREATE TRIGGER razul_sentinel_control_audit AFTER UPDATE ON public.razul_sentinels FOR EACH ROW WHEN (NEW.status IS DISTINCT FROM OLD.status) EXECUTE FUNCTION public.record_razul_control_change();
CREATE TRIGGER razul_passport_control_audit AFTER INSERT OR UPDATE ON public.razul_project_passports FOR EACH ROW EXECUTE FUNCTION public.record_razul_control_change();

CREATE OR REPLACE FUNCTION public.razul_set_subscription(_agent text, _categories text[], _floor integer, _enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 PERFORM public.assert_razul_owner();
 IF _agent IS NULL OR _agent NOT IN ('jackboy','jax','omni','sabrina','guardian','hercules') OR _floor IS NULL OR _floor < 0 OR _floor > 100 OR _enabled IS NULL OR _categories IS NULL OR cardinality(_categories) > 22
 THEN RAISE EXCEPTION 'Invalid subscription'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(_categories) c WHERE c IS NULL OR length(c) > 40 OR NOT EXISTS(SELECT 1 FROM public.razul_sources s WHERE s.category=c AND s.kind <> 'sentinel')) THEN RAISE EXCEPTION 'Category must come from approved public sources'; END IF;
 UPDATE public.razul_agent_feeds SET categories=_categories,min_relevance=_floor,alerts_enabled=_enabled,updated_at=now() WHERE agent=_agent;
 IF NOT FOUND THEN RAISE EXCEPTION 'Existing subscribed agent required'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.razul_set_subscription(text,text[],integer,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.razul_set_subscription(text,text[],integer,boolean) TO authenticated;