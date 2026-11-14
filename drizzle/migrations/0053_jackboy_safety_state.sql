-- Jackboy safety state: Mothership records the latest verified Jackboy safety reading
-- (global pause / Kill Switch, CODE Emergency Stop) and fails closed on it. Additive.
-- A verified "clear" reading only permits admission when fresh; it never starts anything.
-- Any non-clear, unknown or stale state halts OMNI autonomy windows and CODE jobs.

CREATE TABLE public.jackboy_safety_state (
  id smallint PRIMARY KEY CHECK (id = 1),
  state text NOT NULL DEFAULT 'unknown' CHECK (state IN ('clear', 'engaged', 'paused', 'unknown')),
  paused boolean,
  code_stop boolean,
  code_enabled boolean,
  cancellation text CHECK (cancellation IS NULL OR char_length(cancellation) <= 40),
  observed_at timestamptz,
  expires_at timestamptz,
  source text NOT NULL DEFAULT 'none' CHECK (source IN ('none', 'poll', 'event', 'failure', 'stale')),
  reason text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 120),
  proof_digest text CHECK (proof_digest IS NULL OR proof_digest ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.jackboy_safety_state TO authenticated;
GRANT ALL ON public.jackboy_safety_state TO service_role;
ALTER TABLE public.jackboy_safety_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Verified MFA owner reads Jackboy safety state"
  ON public.jackboy_safety_state FOR SELECT TO authenticated
  USING (public.is_razul_owner());
INSERT INTO public.jackboy_safety_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.jackboy_safety_nonces (
  nonce text PRIMARY KEY CHECK (nonce ~ '^[a-f0-9]{32}$'),
  seen_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.jackboy_safety_nonces FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.jackboy_safety_nonces TO service_role;
ALTER TABLE public.jackboy_safety_nonces ENABLE ROW LEVEL SECURITY;

-- Fail closed: true only for a fresh, signed poll reading with no pause and no CODE stop.
CREATE OR REPLACE FUNCTION public.jackboy_safety_clear()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.jackboy_safety_state
     WHERE id = 1 AND state = 'clear' AND source = 'poll'
       AND paused = false AND code_stop = false
       AND expires_at > now()
       AND observed_at > now() - interval '3 minutes'
       AND observed_at <= now() + interval '1 minute'
  );
$$;
REVOKE ALL ON FUNCTION public.jackboy_safety_clear() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jackboy_safety_clear() TO authenticated, service_role;

-- Step 10 in effect: all ten steps approved and Step 7's window still open.
CREATE OR REPLACE FUNCTION public.activation_autonomy_authorized()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (SELECT count(*) FROM public.activation_approvals
           WHERE step BETWEEN 1 AND 10 AND status = 'approved') = 10
     AND EXISTS (SELECT 1 FROM public.activation_approvals
                  WHERE step = 7 AND status = 'approved' AND approval_expires_at > now());
$$;
REVOKE ALL ON FUNCTION public.activation_autonomy_authorized() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activation_autonomy_authorized() TO authenticated, service_role;

-- Halt everything autonomous: windows end, active CODE jobs stop, queued CODE jobs are held.
-- Manual workspace sessions and terminal commands are not touched.
CREATE OR REPLACE FUNCTION public.jackboy_safety_halt()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.omni_code_halt('jackboy_safety', NULL);
  PERFORM public.omni_autonomy_end_all('jackboy_safety', NULL);
  UPDATE public.omni_code_jobs SET status = 'paused', lease_expires_at = NULL
   WHERE status IN ('queued', 'retry_wait');
END $$;
REVOKE ALL ON FUNCTION public.jackboy_safety_halt() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.jackboy_safety_on_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.state <> 'clear' THEN PERFORM public.jackboy_safety_halt(); END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.jackboy_safety_on_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER jackboy_safety_on_change AFTER UPDATE ON public.jackboy_safety_state
  FOR EACH ROW EXECUTE FUNCTION public.jackboy_safety_on_change();

-- Service-only recorder. 'poll' = verified signed read; 'event' = verified signed stop notice
-- (can only report a stop or pause, never clear); 'failure'/'stale' = unknown (halts).
CREATE OR REPLACE FUNCTION public.jackboy_safety_record(
  _source text, _paused boolean, _code_stop boolean, _code_enabled boolean, _cancellation text,
  _observed_at timestamptz, _expires_at timestamptz, _proof_digest text, _nonce text, _reason text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _state text;
  _cur public.jackboy_safety_state;
BEGIN
  IF _source IS NULL OR _source NOT IN ('poll', 'event', 'failure', 'stale') THEN
    RAISE EXCEPTION 'Unknown safety source' USING ERRCODE = '22023';
  END IF;
  IF _source IN ('poll', 'event') THEN
    IF _observed_at IS NULL OR _observed_at > now() + interval '1 minute'
       OR _observed_at < now() - interval '5 minutes' THEN
      RAISE EXCEPTION 'Safety observation time is out of range' USING ERRCODE = '22023';
    END IF;
    IF _proof_digest IS NULL OR _proof_digest !~ '^[a-f0-9]{64}$' THEN
      RAISE EXCEPTION 'Safety reading needs its verified proof digest' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF _source = 'event' THEN
    IF _nonce IS NULL OR _nonce !~ '^[a-f0-9]{32}$' THEN
      RAISE EXCEPTION 'Safety notice needs a nonce' USING ERRCODE = '22023';
    END IF;
    DELETE FROM public.jackboy_safety_nonces WHERE seen_at < now() - interval '1 day';
    INSERT INTO public.jackboy_safety_nonces (nonce) VALUES (_nonce);
  END IF;

  _state := CASE
    WHEN _source IN ('failure', 'stale') THEN 'unknown'
    WHEN _paused IS NULL OR _code_stop IS NULL THEN 'unknown'
    WHEN _code_stop THEN 'engaged'
    WHEN _paused THEN 'paused'
    ELSE 'clear'
  END;
  IF _source = 'event' AND _state NOT IN ('engaged', 'paused') THEN
    RAISE EXCEPTION 'A safety notice can only report a stop or pause' USING ERRCODE = '22023';
  END IF;
  IF _state = 'clear' AND (_expires_at IS NULL OR _expires_at <= now()
     OR _expires_at > _observed_at + interval '3 minutes') THEN
    RAISE EXCEPTION 'A clear reading needs a short, future expiry' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _cur FROM public.jackboy_safety_state WHERE id = 1 FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.jackboy_safety_state (id) VALUES (1) RETURNING * INTO _cur;
  END IF;
  -- An older clear reading never overrides a newer recorded observation; stops always apply.
  IF _state = 'clear' AND _cur.observed_at IS NOT NULL AND _observed_at < _cur.observed_at THEN
    RETURN 'ignored_older';
  END IF;

  IF _source IN ('failure', 'stale') THEN
    UPDATE public.jackboy_safety_state
       SET state = 'unknown', source = _source, reason = left(COALESCE(_reason, ''), 120),
           recorded_at = now()
     WHERE id = 1;
  ELSE
    UPDATE public.jackboy_safety_state
       SET state = _state, paused = _paused, code_stop = _code_stop, code_enabled = _code_enabled,
           cancellation = left(_cancellation, 40), observed_at = _observed_at,
           expires_at = _expires_at, source = _source, reason = left(COALESCE(_reason, ''), 120),
           proof_digest = _proof_digest, recorded_at = now()
     WHERE id = 1;
  END IF;

  IF _cur.state IS DISTINCT FROM _state OR _source = 'event' THEN
    INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
      VALUES (NULL, 'jackboy_safety_' || _state, 'jackboy_safety', _source);
  END IF;
  RETURN _state;
END $$;
REVOKE ALL ON FUNCTION public.jackboy_safety_record(text, boolean, boolean, boolean, text, timestamptz, timestamptz, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jackboy_safety_record(text, boolean, boolean, boolean, text, timestamptz, timestamptz, text, text, text)
  TO service_role;

-- Freshness enforcement (scheduled): a clear reading that has expired becomes unknown and halts;
-- a non-clear state re-runs the idempotent halt.
CREATE OR REPLACE FUNCTION public.jackboy_safety_enforce_freshness()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _state text;
BEGIN
  SELECT state INTO _state FROM public.jackboy_safety_state WHERE id = 1;
  IF _state = 'clear' AND NOT public.jackboy_safety_clear() THEN
    RETURN public.jackboy_safety_record('stale', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
      'Verified reading expired');
  END IF;
  IF _state IS DISTINCT FROM 'clear' THEN PERFORM public.jackboy_safety_halt(); END IF;
  RETURN COALESCE(_state, 'unknown');
END $$;
REVOKE ALL ON FUNCTION public.jackboy_safety_enforce_freshness() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jackboy_safety_enforce_freshness() TO service_role;

-- Autonomy windows: additionally require fresh clear Jackboy safety and Step 10 in effect.
CREATE OR REPLACE FUNCTION public.omni_autonomy_window_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _stop boolean;
  _enabled boolean;
  _status text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.ended_at IS NOT NULL AND NEW.ended_at IS NULL THEN
      RAISE EXCEPTION 'An ended autonomy window cannot be reopened.';
    END IF;
    IF NEW.expires_at > OLD.expires_at OR NEW.started_at <> OLD.started_at
       OR NEW.agent_id <> OLD.agent_id OR NEW.owner_id <> OLD.owner_id THEN
      RAISE EXCEPTION 'An autonomy window cannot be extended or reassigned.';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.agent_id = 'jackboy' THEN
    RAISE EXCEPTION 'Jackboy CODE keeps its own controls; Mothership never grants it autonomy.';
  END IF;
  IF NEW.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'A new autonomy window must start open.';
  END IF;
  IF (NEW.expires_at - NEW.started_at) NOT IN (interval '15 minutes', interval '30 minutes', interval '60 minutes') THEN
    RAISE EXCEPTION 'Autonomy windows are 15, 30 or 60 minutes.';
  END IF;
  SELECT emergency_stop INTO _stop FROM public.omni_terminal_controls WHERE id = 1;
  IF _stop IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Emergency Stop is engaged or unreadable.';
  END IF;
  SELECT terminal_enabled INTO _enabled FROM public.omni_workspace_settings WHERE id = 1;
  IF _enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'The terminal kill switch is off.';
  END IF;
  SELECT status INTO _status FROM public.omni_agents WHERE id = NEW.agent_id;
  IF _status IS DISTINCT FROM 'enrolled' THEN
    RAISE EXCEPTION 'This agent is not enrolled.';
  END IF;
  IF NOT public.jackboy_safety_clear() THEN
    RAISE EXCEPTION 'Jackboy CODE Emergency Stop is engaged, Jackboy is paused, or its safety state is not freshly verified.';
  END IF;
  IF NOT public.activation_autonomy_authorized() THEN
    RAISE EXCEPTION 'Activation Step 10 (autonomy authorization) is not in effect.';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.omni_autonomy_window_guard() FROM PUBLIC, anon, authenticated;

-- CODE always-on: same additional requirements.
CREATE OR REPLACE FUNCTION public.omni_code_service_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _stop boolean; _enabled boolean;
BEGIN
  IF NEW.always_on THEN
    IF NEW.always_on_until IS NULL OR NEW.always_on_until <= now() OR NEW.always_on_until > now() + interval '24 hours' THEN
      RAISE EXCEPTION 'CODE always-on needs an end time within 24 hours.';
    END IF;
    SELECT emergency_stop INTO _stop FROM public.omni_terminal_controls WHERE id = 1;
    IF _stop IS DISTINCT FROM false THEN RAISE EXCEPTION 'Emergency Stop is engaged or unreadable.'; END IF;
    SELECT terminal_enabled INTO _enabled FROM public.omni_workspace_settings WHERE id = 1;
    IF _enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'The terminal kill switch is off.'; END IF;
    IF NOT public.jackboy_safety_clear() THEN
      RAISE EXCEPTION 'Jackboy CODE Emergency Stop is engaged, Jackboy is paused, or its safety state is not freshly verified.';
    END IF;
    IF NOT public.activation_autonomy_authorized() THEN
      RAISE EXCEPTION 'Activation Step 10 (autonomy authorization) is not in effect.';
    END IF;
  END IF;
  NEW.changed_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.omni_code_service_guard() FROM PUBLIC, anon, authenticated;

-- CODE leasing: same additional requirements.
CREATE OR REPLACE FUNCTION public.omni_code_job_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _svc public.omni_code_service%ROWTYPE; _stop boolean; _enabled boolean; _status text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IN ('succeeded','failed','stopped','cancelled') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'A finished CODE job cannot be restarted.';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.status NOT IN ('queued','awaiting_approval') THEN
    RAISE EXCEPTION 'New CODE jobs start queued.';
  END IF;
  IF NEW.kind IN ('file_apply','file_undo') THEN NEW.destructive := true; END IF;
  IF NEW.status IN ('leased','running') AND (TG_OP = 'INSERT' OR OLD.status NOT IN ('leased','running')) THEN
    SELECT * INTO _svc FROM public.omni_code_service WHERE id = 1;
    IF NOT FOUND OR NOT _svc.always_on OR _svc.always_on_until IS NULL OR _svc.always_on_until <= now() THEN
      RAISE EXCEPTION 'CODE always-on is off or expired.';
    END IF;
    SELECT emergency_stop INTO _stop FROM public.omni_terminal_controls WHERE id = 1;
    IF _stop IS DISTINCT FROM false THEN RAISE EXCEPTION 'Emergency Stop is engaged or unreadable.'; END IF;
    SELECT terminal_enabled INTO _enabled FROM public.omni_workspace_settings WHERE id = 1;
    IF _enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'The terminal kill switch is off.'; END IF;
    SELECT status INTO _status FROM public.omni_agents WHERE id = NEW.agent_id;
    IF _status IS DISTINCT FROM 'enrolled' THEN RAISE EXCEPTION 'This agent is not enrolled.'; END IF;
    IF NEW.kind IN ('file_apply','file_undo') AND NEW.approved_at IS NULL THEN
      RAISE EXCEPTION 'This job changes files and needs owner approval first.';
    END IF;
    IF NEW.not_before IS NOT NULL AND NEW.not_before > now() THEN RAISE EXCEPTION 'Retry back-off has not elapsed.'; END IF;
    IF NOT public.jackboy_safety_clear() THEN
      RAISE EXCEPTION 'Jackboy CODE Emergency Stop is engaged, Jackboy is paused, or its safety state is not freshly verified.';
    END IF;
    IF NOT public.activation_autonomy_authorized() THEN
      RAISE EXCEPTION 'Activation Step 10 (autonomy authorization) is not in effect.';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.omni_code_job_guard() FROM PUBLIC, anon, authenticated;
