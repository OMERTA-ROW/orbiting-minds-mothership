-- Owner authenticator recovery: single-use codes stored as hashes only, consumed by the server, append-only audit. Never stores codes or authenticator secrets.
CREATE TABLE public.owner_mfa_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  code_hash text NOT NULL UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz
);
CREATE INDEX owner_mfa_recovery_codes_user_idx ON public.owner_mfa_recovery_codes (user_id);
GRANT ALL ON public.owner_mfa_recovery_codes TO service_role;
REVOKE ALL ON public.owner_mfa_recovery_codes FROM anon, authenticated;
ALTER TABLE public.owner_mfa_recovery_codes ENABLE ROW LEVEL SECURITY;
-- No policies: browser roles can never read code hashes.

CREATE TABLE public.owner_mfa_recovery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event text NOT NULL CHECK (event IN ('codes_created', 'recovery_refused', 'recovery_locked', 'recovery_completed', 'recovery_failed')),
  detail text NOT NULL DEFAULT '' CHECK (length(detail) <= 200),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX owner_mfa_recovery_events_user_idx ON public.owner_mfa_recovery_events (user_id, created_at DESC);
GRANT SELECT ON public.owner_mfa_recovery_events TO authenticated;
GRANT SELECT, INSERT ON public.owner_mfa_recovery_events TO service_role;
REVOKE ALL ON public.owner_mfa_recovery_events FROM anon;
ALTER TABLE public.owner_mfa_recovery_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own authenticator recovery events"
  ON public.owner_mfa_recovery_events FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND public.is_razul_owner());

CREATE OR REPLACE FUNCTION public.owner_mfa_events_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  RAISE EXCEPTION 'Authenticator recovery events are append-only' USING ERRCODE = '42501';
END $$;
CREATE TRIGGER owner_mfa_recovery_events_append_only
  BEFORE UPDATE OR DELETE ON public.owner_mfa_recovery_events
  FOR EACH ROW EXECUTE FUNCTION public.owner_mfa_events_append_only();

-- Owner replaces their recovery codes. Needs aal2 plus a TOTP check from the last 15 minutes.
CREATE OR REPLACE FUNCTION public.owner_mfa_set_recovery_codes(_hashes text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _uid uuid := auth.uid();
  _batch uuid := gen_random_uuid();
BEGIN
  PERFORM public.assert_razul_owner();
  PERFORM public.assert_fresh_mfa(900);
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
  DELETE FROM public.owner_mfa_recovery_codes WHERE user_id = _uid;
  INSERT INTO public.owner_mfa_recovery_codes (user_id, batch_id, code_hash)
    SELECT _uid, _batch, h FROM unnest(_hashes) h;
  INSERT INTO public.owner_mfa_recovery_events (user_id, event, detail)
    VALUES (_uid, 'codes_created', '10 new codes; all earlier codes stopped working');
  RETURN 10;
END $$;
REVOKE ALL ON FUNCTION public.owner_mfa_set_recovery_codes(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_mfa_set_recovery_codes(text[]) TO authenticated;

-- Counts only (never hashes). Non-owners always see zero.
CREATE OR REPLACE FUNCTION public.owner_mfa_recovery_status()
RETURNS TABLE (remaining integer, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT (count(*) FILTER (WHERE c.used_at IS NULL))::integer, max(c.created_at)
  FROM public.owner_mfa_recovery_codes c
  WHERE auth.uid() IS NOT NULL
    AND c.user_id = auth.uid()
    AND public.has_role(auth.uid(), 'owner');
$$;
REVOKE ALL ON FUNCTION public.owner_mfa_recovery_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_mfa_recovery_status() TO authenticated;

-- Server only: consume one code for a verified owner, with a 5-wrong-codes-per-hour lock.
CREATE OR REPLACE FUNCTION public.owner_mfa_consume_recovery_code(_user uuid, _hash text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _id uuid;
  _fails integer;
BEGIN
  IF _user IS NULL THEN RETURN 'not_owner'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('owner-mfa:' || _user::text, 0));
  IF NOT public.has_role(_user, 'owner')
     OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _user AND u.email_confirmed_at IS NOT NULL) THEN
    RETURN 'not_owner';
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
REVOKE ALL ON FUNCTION public.owner_mfa_consume_recovery_code(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_mfa_consume_recovery_code(uuid, text) TO service_role;

-- Server only: record the outcome; a failed authenticator removal restores the code.
CREATE OR REPLACE FUNCTION public.owner_mfa_finish_recovery(_user uuid, _hash text, _removed integer, _ok boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF _ok THEN
    INSERT INTO public.owner_mfa_recovery_events (user_id, event, detail)
      VALUES (_user, 'recovery_completed', format('%s authenticator(s) removed; other sign-ins ended', GREATEST(COALESCE(_removed, 0), 0)));
  ELSE
    UPDATE public.owner_mfa_recovery_codes SET used_at = NULL
      WHERE user_id = _user AND code_hash = _hash AND used_at IS NOT NULL;
    INSERT INTO public.owner_mfa_recovery_events (user_id, event, detail)
      VALUES (_user, 'recovery_failed', 'Authenticator removal did not complete; the code still works');
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.owner_mfa_finish_recovery(uuid, text, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_mfa_finish_recovery(uuid, text, integer, boolean) TO service_role;