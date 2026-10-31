CREATE TABLE public.omni_agent_runs (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  project_id uuid NOT NULL,
  model text NOT NULL,
  message text NOT NULL CHECK (length(btrim(message)) BETWEEN 3 AND 2000),
  consent boolean NOT NULL CHECK (consent),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','cancelled','paused','failed','denied','refused')),
  result text NOT NULL DEFAULT '' CHECK (length(result) <= 40000),
  error_message text CHECK (length(error_message) <= 1500),
  error_status integer,
  input_tokens integer CHECK (input_tokens >= 0),
  output_tokens integer CHECK (output_tokens >= 0),
  total_tokens integer CHECK (total_tokens >= 0),
  gateway_run_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  FOREIGN KEY (project_id,owner_id) REFERENCES public.beta_projects(id,owner_id) ON DELETE CASCADE
);
GRANT SELECT ON public.omni_agent_runs TO authenticated;
GRANT ALL ON public.omni_agent_runs TO service_role;
ALTER TABLE public.omni_agent_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_runs_owner_read ON public.omni_agent_runs FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));
CREATE INDEX omni_agent_runs_owner_project ON public.omni_agent_runs(owner_id,project_id,created_at DESC);

CREATE FUNCTION public.start_omni_agent_run(_id uuid, _project uuid, _message text, _consent boolean)
RETURNS public.omni_agent_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.omni_agent_runs; u auth.users%ROWTYPE; a public.beta_access;
BEGIN
  SELECT * INTO u FROM auth.users WHERE id = auth.uid();
  IF u.id IS NULL OR u.email_confirmed_at IS NULL THEN RAISE EXCEPTION 'Confirmed account required'; END IF;
  IF public.caller_role() IS NULL THEN RAISE EXCEPTION 'Private membership required'; END IF;
  SELECT * INTO a FROM public.beta_access WHERE user_id = u.id FOR SHARE;
  IF a.user_id IS NULL OR a.ai_approved IS DISTINCT FROM true OR a.paused IS DISTINCT FROM false THEN RAISE EXCEPTION 'AI approval and unpaused account required'; END IF;
  IF _consent IS DISTINCT FROM true THEN RAISE EXCEPTION 'Explicit AI and saved-text consent required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.beta_projects WHERE id=_project AND owner_id=u.id) THEN RAISE EXCEPTION 'Owned project required'; END IF;
  INSERT INTO public.omni_agent_runs(id,owner_id,project_id,model,message,consent)
    VALUES(_id,u.id,_project,'openai/gpt-6-astra',_message,true) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO r FROM public.omni_agent_runs WHERE id=_id;
  IF r.owner_id IS DISTINCT FROM u.id OR r.project_id IS DISTINCT FROM _project OR r.message IS DISTINCT FROM _message
    THEN RAISE EXCEPTION 'Request identity conflict'; END IF;
  RETURN r;
END $$;
CREATE FUNCTION public.cancel_omni_agent_run(_id uuid) RETURNS public.omni_agent_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.omni_agent_runs;
BEGIN
  SELECT * INTO r FROM public.omni_agent_runs WHERE id=_id AND owner_id=auth.uid() FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Owned run required'; END IF;
  IF r.status IN ('queued','running') THEN
    UPDATE public.omni_agent_runs SET status='cancelled',finished_at=now() WHERE id=_id RETURNING * INTO r;
  END IF;
  RETURN r;
END $$;
CREATE FUNCTION public.list_omni_agent_runs(_project uuid) RETURNS SETOF public.omni_agent_runs
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF public.caller_role() IS NULL THEN RAISE EXCEPTION 'Private membership required'; END IF;
  RETURN QUERY SELECT * FROM public.omni_agent_runs WHERE owner_id=auth.uid() AND project_id=_project ORDER BY created_at DESC LIMIT 20;
END $$;
REVOKE ALL ON FUNCTION public.start_omni_agent_run,public.cancel_omni_agent_run,public.list_omni_agent_runs FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_omni_agent_run,public.cancel_omni_agent_run,public.list_omni_agent_runs TO authenticated;
COMMENT ON TABLE public.omni_agent_runs IS 'Private explicit single-turn text inference; no tools, daemon, automatic retries or autonomous background runner. Running after interruption means outcome unknown, never auto-resumed.';