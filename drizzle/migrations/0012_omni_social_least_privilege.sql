REVOKE ALL ON public.omni_social_drafts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.omni_social_drafts TO authenticated;
GRANT ALL ON public.omni_social_drafts TO service_role;
COMMENT ON TABLE public.omni_social_drafts IS 'Owner-only planning. Direct writes revoked including inherited default grants; mutation only through owner-validated revision-bound RPC. No scheduled jobs, provider connections, posts or receipts.';