-- Recovery history is append-only for every role; browsers may only read it (owner, aal2, own rows).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.owner_mfa_recovery_events FROM authenticated, anon, PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.owner_mfa_recovery_events FROM service_role;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.owner_mfa_recovery_codes FROM service_role;
REVOKE ALL ON FUNCTION public.owner_mfa_events_append_only() FROM PUBLIC, anon, authenticated;