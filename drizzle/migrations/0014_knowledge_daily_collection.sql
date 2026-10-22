CREATE TABLE public.knowledge_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  trigger text NOT NULL DEFAULT 'schedule',
  status text NOT NULL DEFAULT 'running',
  fetched integer NOT NULL DEFAULT 0,
  inserted integer NOT NULL DEFAULT 0,
  duplicates integer NOT NULL DEFAULT 0,
  source_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  brief_status text NOT NULL DEFAULT 'not_started',
  brief_message text
);
CREATE TABLE public.knowledge_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL,
  source_name text NOT NULL,
  title text NOT NULL,
  url text NOT NULL UNIQUE,
  summary text NOT NULL DEFAULT '',
  categories text[] NOT NULL DEFAULT '{}',
  published_at timestamptz,
  collected_at timestamptz NOT NULL DEFAULT now(),
  run_id uuid
);
CREATE INDEX knowledge_items_collected_idx ON public.knowledge_items (collected_at DESC);
CREATE TABLE public.knowledge_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_date date NOT NULL UNIQUE,
  model text NOT NULL,
  overview text NOT NULL,
  entries jsonb NOT NULL DEFAULT '[]'::jsonb,
  item_count integer NOT NULL DEFAULT 0,
  run_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.knowledge_job_state (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  lease_until timestamptz,
  paused_reason text,
  paused_status integer,
  paused_at timestamptz
);
INSERT INTO public.knowledge_job_state (id) VALUES (1) ON CONFLICT DO NOTHING;

GRANT SELECT ON public.knowledge_runs, public.knowledge_items, public.knowledge_briefs, public.knowledge_job_state TO authenticated;
GRANT ALL ON public.knowledge_runs, public.knowledge_items, public.knowledge_briefs, public.knowledge_job_state TO service_role;
ALTER TABLE public.knowledge_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_job_state ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.is_knowledge_reader() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.beta_access WHERE user_id = (SELECT auth.uid()) AND ai_approved AND NOT paused)
$$;
REVOKE ALL ON FUNCTION public.is_knowledge_reader() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_knowledge_reader() TO authenticated;

CREATE POLICY knowledge_runs_read ON public.knowledge_runs FOR SELECT TO authenticated USING (public.is_knowledge_reader());
CREATE POLICY knowledge_items_read ON public.knowledge_items FOR SELECT TO authenticated USING (public.is_knowledge_reader());
CREATE POLICY knowledge_briefs_read ON public.knowledge_briefs FOR SELECT TO authenticated USING (public.is_knowledge_reader());
CREATE POLICY knowledge_state_read ON public.knowledge_job_state FOR SELECT TO authenticated USING (public.is_knowledge_reader());

CREATE FUNCTION public.claim_knowledge_lease(_minutes integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE ok boolean;
BEGIN
  UPDATE public.knowledge_job_state SET lease_until = now() + make_interval(mins => _minutes)
   WHERE id = 1 AND (lease_until IS NULL OR lease_until < now())
  RETURNING true INTO ok;
  RETURN coalesce(ok, false);
END $$;
REVOKE ALL ON FUNCTION public.claim_knowledge_lease(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_knowledge_lease(integer) TO service_role;
COMMENT ON TABLE public.knowledge_items IS 'Public technology feed entries collected by the scheduled server job; written by service role only.';