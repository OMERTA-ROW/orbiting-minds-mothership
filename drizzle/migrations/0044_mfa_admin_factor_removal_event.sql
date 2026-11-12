-- Allow recording a project-administrator authenticator removal (after independent identity check) in the
-- append-only per-account authenticator history. Additive: every existing event value stays valid.
ALTER TABLE public.owner_mfa_recovery_events DROP CONSTRAINT IF EXISTS owner_mfa_recovery_events_event_check;
ALTER TABLE public.owner_mfa_recovery_events ADD CONSTRAINT owner_mfa_recovery_events_event_check
  CHECK (event IN ('codes_created', 'recovery_refused', 'recovery_locked', 'recovery_completed', 'recovery_failed', 'mfa_disabled', 'mfa_disable_failed', 'admin_factor_removed', 'admin_factor_removal_failed'));