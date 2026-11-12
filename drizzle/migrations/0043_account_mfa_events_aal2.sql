-- Keep the earlier rule: security history is readable only by its own account at aal2.
ALTER POLICY "Account reads own authenticator events" ON public.owner_mfa_recovery_events
  USING (user_id = (SELECT auth.uid()) AND coalesce((SELECT auth.jwt()->>'aal'), '') = 'aal2');