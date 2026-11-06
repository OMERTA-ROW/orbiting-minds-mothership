-- Owner-only Activation Approvals checklist. Records decisions only; never flips switches, sets secrets, deploys or runs tests.
CREATE TABLE public.activation_approvals (
  step smallint PRIMARY KEY CHECK (step BETWEEN 1 AND 10),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'failed')),
  approver_id uuid,
  decided_at timestamptz,
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 280),
  approval_expires_at timestamptz,
  spend_confirmations jsonb,
  revision integer NOT NULL DEFAULT 0
);

GRANT SELECT ON public.activation_approvals TO authenticated;
GRANT ALL ON public.activation_approvals TO service_role;
ALTER TABLE public.activation_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Verified MFA owner reads activation approvals"
  ON public.activation_approvals FOR SELECT TO authenticated
  USING (public.is_razul_owner());

-- Fresh second factor: the session must carry a TOTP verification within _max_age_seconds.
CREATE OR REPLACE FUNCTION public.assert_fresh_mfa(_max_age_seconds integer DEFAULT 900)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _amr jsonb := auth.jwt()->'amr';
BEGIN
  IF _amr IS NULL OR jsonb_typeof(_amr) <> 'array' OR NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(_amr) e
    WHERE jsonb_typeof(e) = 'object'
      AND e->>'method' = 'totp'
      AND (e->>'timestamp') ~ '^[0-9]{1,12}$'
      AND to_timestamp((e->>'timestamp')::bigint) >= now() - make_interval(secs => _max_age_seconds)
      AND to_timestamp((e->>'timestamp')::bigint) <= now() + interval '60 seconds'
  ) THEN
    RAISE EXCEPTION 'Fresh two-factor verification required' USING ERRCODE = '42501';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.activation_approval_decide(
  _step integer,
  _action text,
  _note text,
  _expires_at timestamptz,
  _cap_confirmed boolean,
  _daily_confirmed boolean
)
RETURNS SETOF public.activation_approvals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _row public.activation_approvals;
  _blocking integer;
  _clean text := COALESCE(btrim(_note), '');
  _later record;
BEGIN
  PERFORM public.assert_razul_owner();
  PERFORM public.assert_fresh_mfa(900);
  IF _step IS NULL OR _step < 1 OR _step > 10 THEN
    RAISE EXCEPTION 'Unknown step' USING ERRCODE = '22023';
  END IF;
  IF _action IS NULL OR _action NOT IN ('approve', 'fail', 'revoke') THEN
    RAISE EXCEPTION 'Unknown action' USING ERRCODE = '22023';
  END IF;
  IF length(_clean) > 280 THEN
    RAISE EXCEPTION 'Note must be 280 characters or fewer' USING ERRCODE = '22023';
  END IF;
  IF _clean ~ '(sk-[A-Za-z0-9_-]{8,}|eyJ[A-Za-z0-9_-]{10,}|omni_[0-9a-f]{4,8}_[A-Za-z0-9_-]{8,}|[A-Fa-f0-9]{32,}|[A-Za-z0-9+/_=-]{40,})' THEN
    RAISE EXCEPTION 'Note looks like a key or token; remove it' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.activation_approvals (step)
  SELECT g FROM generate_series(1, 10) g
  ON CONFLICT (step) DO NOTHING;
  PERFORM 1 FROM public.activation_approvals ORDER BY step FOR UPDATE;
  SELECT * INTO _row FROM public.activation_approvals WHERE step = _step;

  IF _action = 'revoke' THEN
    IF _row.status = 'pending' THEN
      RAISE EXCEPTION 'Step is already pending' USING ERRCODE = '22023';
    END IF;
  ELSE
    SELECT min(step) INTO _blocking FROM public.activation_approvals
    WHERE step < _step
      AND (status <> 'approved' OR (step = 7 AND (approval_expires_at IS NULL OR approval_expires_at <= now())));
    IF _blocking IS NOT NULL THEN
      RAISE EXCEPTION 'Step % must be approved first', _blocking USING ERRCODE = '22023';
    END IF;
    IF _action = 'approve' THEN
      IF _row.status = 'approved' THEN
        RAISE EXCEPTION 'Step is already approved' USING ERRCODE = '22023';
      END IF;
      IF _step = 7 AND (_expires_at IS NULL OR _expires_at <= now() OR _expires_at > now() + interval '24 hours') THEN
        RAISE EXCEPTION 'Approval expiry must be in the future and at most 24 hours ahead' USING ERRCODE = '22023';
      END IF;
      IF _step = 10 AND (_cap_confirmed IS DISTINCT FROM true OR _daily_confirmed IS DISTINCT FROM true) THEN
        RAISE EXCEPTION 'Confirm the $10 OpenAI cap and the $5 daily limit' USING ERRCODE = '22023';
      END IF;
    ELSIF _row.status = 'failed' THEN
      RAISE EXCEPTION 'Step is already marked failed' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Revoking or failing a step invalidates every later decision.
  IF _action IN ('revoke', 'fail') THEN
    FOR _later IN
      SELECT step FROM public.activation_approvals
      WHERE step > _step AND status <> 'pending' ORDER BY step
    LOOP
      UPDATE public.activation_approvals
      SET status = 'pending', approver_id = auth.uid(), decided_at = now(), note = '',
          approval_expires_at = NULL, spend_confirmations = NULL, revision = revision + 1
      WHERE step = _later.step;
      INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
      VALUES (auth.uid(), 'revoke_cascade', 'activation_approval', _later.step::text);
    END LOOP;
  END IF;

  UPDATE public.activation_approvals
  SET status = CASE _action WHEN 'approve' THEN 'approved' WHEN 'fail' THEN 'failed' ELSE 'pending' END,
      approver_id = auth.uid(),
      decided_at = now(),
      note = _clean,
      approval_expires_at = CASE WHEN _action = 'approve' AND _step = 7 THEN _expires_at ELSE NULL END,
      spend_confirmations = CASE WHEN _action = 'approve' AND _step = 10
        THEN jsonb_build_object('openai_cap_usd', 10, 'daily_limit_usd', 5, 'confirmed_at', now())
        ELSE NULL END,
      revision = revision + 1
  WHERE step = _step;
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (auth.uid(), _action, 'activation_approval', _step::text);

  RETURN QUERY SELECT * FROM public.activation_approvals ORDER BY step;
END $$;

REVOKE ALL ON FUNCTION public.assert_fresh_mfa(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_fresh_mfa(integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.activation_approval_decide(integer, text, text, timestamptz, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activation_approval_decide(integer, text, text, timestamptz, boolean, boolean) TO authenticated, service_role;
