CREATE TABLE public.ai_gateway_state (
  feature text PRIMARY KEY,
  blocked_status integer NOT NULL,
  message text NOT NULL,
  blocked_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ai_gateway_state TO service_role;
REVOKE ALL ON public.ai_gateway_state FROM anon, authenticated;
ALTER TABLE public.ai_gateway_state ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.ai_gateway_state IS 'Service-only circuit breaker for AI access and workspace blocks. No creator concepts or generated pathways are stored.';