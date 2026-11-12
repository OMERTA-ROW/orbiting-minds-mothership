-- Two-step sign-in (provider TOTP) for every account: hash-only recovery codes, rate-limited
-- regeneration, recovery and disable records. Reuses the existing hash-only tables; the
-- owner_* functions stay in place for compatibility.
COMMENT ON TABLE public.owner_mfa_recovery_codes IS 'Per-account authenticator recovery code hashes (any signed-in account since account_two_step_signin). Never plaintext.';
COMMENT ON TABLE public.owner_mfa_recovery_events IS 'Append-only per-account authenticator history (any signed-in account since account_two_step_signin).';

ALTER TABLE public.owner_mfa_recovery_events DROP CONSTRAINT IF EXISTS owner_mfa_recovery_events_event_check;
ALTER TABLE public.owner_mfa_recovery_events ADD CONSTRAINT owner_mfa_recovery_events_event_check
  CHECK (event IN ('codes_created', 'recovery_refused', 'recovery_locked', 'recovery_completed', 'recovery_failed', 'mfa_disabled', 'mfa_disable_failed'));

CREATE POLICY "Account reads own authenticator events"
  ON public.owner_mfa_recovery_events FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Step-up: this session is aal2 AND an authenticator code was entered in the last 15 minutes.
CREATE OR REPLACE FUNCTION public.account_mfa_assert_step_up()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501';
  END IF;
  IF coalesce(auth.jwt()->>'aal', '') <> 'aal2' THEN
    RAISE EXCEPTION 'Fresh two-factor verification required' USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_fresh_mfa(900);
END $$;
REVOKE ALL ON FUNCTION public.account_mfa_assert_step_up() FROM PUBLIC, anon, authenticated;

-- Any signed-in account replaces its own codes: step-up required, at most 5 replacements per hour.
CREATE OR REPLACE FUNCTION public.account_mfa_set_recovery_codes(_hashes text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _uid uuid := auth.uid();
  _batch uuid := gen_random_uuid();
  _recent integer;
BEGIN
  PERFORM public.account_mfa_assert_step_up();
  IF _hashes IS NULL OR cardinality(_hashes) <> 10 THEN
    RAISE EXCEPTION 'Exactly 10 recovery codes are required' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(_hashes) h WHERE h IS NULL OR h !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'Recovery code fingerprints are malformed' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT h) FROM unnest(_hashes) h) <> 10 THEN
    RAISE EXCEPTION 'Recovery codes must be distinct' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('owner-mfa:' || _uid::text, 0));
  SELECT count(*) INTO _recent FROM public.owner_mfa_recovery_events
    WHERE user_id = _uid AND event = 'codes_created' AND created_at > now() - interval '1 hour';
  IF _recent >= 5 THEN
    RAISE EXCEPTION 'Recovery codes replaced too often; wait an hour' USING ERRCODE = '54000';
  END IF;
  DELETE FROM public.owner_mfa_recovery_codes WHERE user_id = _uid;
  INSERT INTO public.owner_mfa_recovery_codes (user_id, batch_id, code_hash)
    SELECT _uid, _batch, h FROM unnest(_hashes) h;
  INSERT INTO public.owner_mfa_recovery_events (user_id, event, detail)
    VALUES (_uid, 'codes_created', '10 new codes; all earlier codes stopped working');
  RETURN 10;
END $$;
REVOKE ALL ON FUNCTION public.account_mfa_set_recovery_codes(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_mfa_set_recovery_codes(text[]) TO authenticated;

-- Counts only, own account only. Never returns hashes.
CREATE OR REPLACE FUNCTION public.account_mfa_recovery_status()
RETURNS TABLE (remaining integer, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT (count(*) FILTER (WHERE c.used_at IS NULL))::integer, max(c.created_at)
  FROM public.owner_mfa_recovery_codes c
  WHERE auth.uid() IS NOT NULL AND c.user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.account_mfa_recovery_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_mfa_recovery_status() TO authenticated;

-- Server only: consume one code for an account with a confirmed email; 5 wrong codes per hour locks.
CREATE OR REPLACE FUNCTION public.account_mfa_consume_recovery_code(_user uuid, _hash text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _id uuid;
  _fails integer;
BEGIN
  IF _user IS NULL THEN RETURN 'unverified'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('owner-mfa:' || _user::text, 0));
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _user AND u.email_confirmed_at IS NOT NULL) THEN
    RETURN 'unverified';
  END IF;
  SELECT count(*) INTO _fails FROM public.owner_mfa_recovery_events
    WHERE user_id = _user AND event = 'recovery_refused' AND created_at > now() - interval '1 hour';
  IF _fails >= 5 THEN
    INSERT INTO public.owner_mfa_recovery_events (user_id, event, detail)
      VALUES (_user, 'recovery_locked', 'Five wrong codes within an hour');
    RETURN 'locked';
  END IF;
  IF _hash IS NOT NULL AND _hash ~ '^[0-9a-f]{64}$' THEN
    UPDATE public.owner_mfa_recovery_codes SET used_at = now()
      WHERE user_id = _user AND code_hash = _hash AND used_at IS NULL
      RETURNING id INTO _id;
  END IF;
  IF _id IS NULL THEN
    INSERT INTO public.owner_mfa_recovery_events (user_id, event, detail)
      VALUES (_user, 'recovery_refused', 'Code not recognised or already used');
    RETURN 'invalid';
  END IF;
  RETURN 'accepted';
END $$;
REVOKE ALL ON FUNCTION public.account_mfa_consume_recovery_code(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_mfa_consume_recovery_code(uuid, text) TO service_role;

-- Server only: record turning two-step sign-in off. Success deletes the account's recovery codes.
CREATE OR REPLACE FUNCTION public.account_mfa_record_disabled(_user uuid, _removed integer, _ok boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF _user IS NULL THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('owner-mfa:' || _user::text, 0));
  IF _ok THEN
    DELETE FROM public.owner_mfa_recovery_codes WHERE user_id = _user;
    INSERT INTO public.owner_mfa_recovery_events (user_id, event, detail)
      VALUES (_user, 'mfa_disabled', format('%s authenticator(s) removed; recovery codes deleted', GREATEST(COALESCE(_removed, 0), 0)));
  ELSE
    INSERT INTO public.owner_mfa_recovery_events (user_id, event, detail)
      VALUES (_user, 'mfa_disable_failed', 'Authenticator removal did not complete; two-step sign-in may still be on');
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.account_mfa_record_disabled(uuid, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_mfa_record_disabled(uuid, integer, boolean) TO service_role;

COMMENT ON FUNCTION public.owner_mfa_set_recovery_codes(text[]) IS 'DEPRECATED: replaced by account_mfa_set_recovery_codes';
COMMENT ON FUNCTION public.owner_mfa_recovery_status() IS 'DEPRECATED: replaced by account_mfa_recovery_status';
COMMENT ON FUNCTION public.owner_mfa_consume_recovery_code(uuid, text) IS 'DEPRECATED: replaced by account_mfa_consume_recovery_code';