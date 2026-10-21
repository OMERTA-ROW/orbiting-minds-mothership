REVOKE ALL ON public.beta_projects, public.beta_agent_profiles, public.beta_access, public.beta_audit FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beta_projects, public.beta_agent_profiles TO authenticated;
GRANT SELECT ON public.beta_access, public.beta_audit TO authenticated;
GRANT UPDATE (paused) ON public.beta_access TO authenticated;
GRANT ALL ON public.beta_projects, public.beta_agent_profiles, public.beta_access, public.beta_audit TO service_role;
COMMENT ON TABLE public.beta_access IS 'Default-deny AI approval. Explicit revoke removes inherited whole-table grants; authenticated users may read own access and update paused only.';