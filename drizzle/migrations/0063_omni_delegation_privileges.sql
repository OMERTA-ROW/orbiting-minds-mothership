-- OMNI owner delegation: narrow table privileges. The hosted database grants new public tables to
-- anon/authenticated by default; RLS already blocks rows, and this removes the privileges too so
-- the owner can read only the listed metadata columns (never token_hash) and nobody but the
-- service role can touch sign-in codes. No data or behaviour change for server functions.
REVOKE ALL ON public.omni_delegation_codes FROM anon, authenticated;
REVOKE ALL ON public.omni_delegations FROM anon, authenticated;
GRANT SELECT (id, owner_id, client_id, audience, scopes, token_prefix, issued_at, expires_at,
              revoked_at, revoked_reason, last_used_at) ON public.omni_delegations TO authenticated;