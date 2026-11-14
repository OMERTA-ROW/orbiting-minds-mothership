-- 0055: Real Step 9/10 activation and Jackboy omni.permit/v1 integration (Mothership side). Additive.
-- Activating never starts work. Execution additionally needs every stop released, a fresh signed
-- Jackboy safety reading that allows autonomy, and an active Jackboy permit per job. Any stop,
-- lapse, revocation or approval change halts autonomous work; the manual terminal is refused only
-- while a verified Jackboy reading says manual diagnostics are not allowed (Kill Switch on).

-- 1. Jackboy omni.safety/v1 fields.
ALTER TABLE public.jackboy_safety_state
  ADD COLUMN autonomous_allowed boolean,
  ADD COLUMN manual_allowed boolean,
  ADD COLUMN blocked_by text CHECK (blocked_by IS NULL OR blocked_by ~ '^[a-z0-9_]{1,40}$'),
  ADD COLUMN authorization_expires_at timestamptz,
  ADD COLUMN active_permits integer CHECK (active_permits IS NULL OR active_permits BETWEEN 0 AND 1000);

-- 2. Permits OMNI holds from Jackboy (mirror; Jackboy stays the authority).
CREATE TABLE public.jackboy_permits (
  job_id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('autonomous', 'code')),
  digest text NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
  permit_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released', 'lapsed', 'revoked')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  renewals integer NOT NULL DEFAULT 0 CHECK (renewals >= 0),
  per_call_usd numeric(6,2) NOT NULL CHECK (per_call_usd > 0 AND per_call_usd <= 0.50),
  per_task_usd numeric(6,2) NOT NULL CHECK (per_task_usd > 0 AND per_task_usd <= 1),
  daily_usd numeric(6,2) NOT NULL CHECK (daily_usd > 0 AND daily_usd <= 5),
  signature_digest text NOT NULL CHECK (signature_digest ~ '^[a-f0-9]{64}$'),
  closed_at timestamptz,
  closed_reason text CHECK (closed_reason IS NULL OR char_length(closed_reason) <= 60),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.jackboy_permits TO authenticated;
GRANT ALL ON public.jackboy_permits TO service_role;
ALTER TABLE public.jackboy_permits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Verified MFA owner reads Jackboy permits"
  ON public.jackboy_permits FOR SELECT TO authenticated
  USING (public.is_razul_owner());

-- 3. Step 9/10 activations (configuration state, bound to the approvals they were made under).
CREATE TABLE public.activation_activations (
  kind text PRIMARY KEY CHECK (kind IN ('live_link', 'autonomy')),
  status text NOT NULL DEFAULT 'inactive'
    CHECK (status IN ('inactive', 'activating', 'active', 'failed', 'revoked')),
  attempt_id uuid,
  step_revision integer,
  step7_revision integer,
  window_ends_at timestamptz,
  actor_id uuid,
  started_at timestamptz,
  activated_at timestamptz,
  reason text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 200),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(evidence) = 'object' AND pg_column_size(evidence) <= 4096),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.activation_activations TO authenticated;
GRANT ALL ON public.activation_activations TO service_role;
ALTER TABLE public.activation_activations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Verified MFA owner reads activations"
  ON public.activation_activations FOR SELECT TO authenticated
  USING (public.is_razul_owner());
INSERT INTO public.activation_activations (kind) VALUES ('live_link'), ('autonomy')
  ON CONFLICT (kind) DO NOTHING;

-- Effective = active, made under the current Step 9/10 and Step 7 revisions, all earlier steps
-- approved and Step 7's window still open. Autonomy also needs the live link in effect.
CREATE OR REPLACE FUNCTION public.activation_effective(_kind text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _last integer := CASE _kind WHEN 'live_link' THEN 9 WHEN 'autonomy' THEN 10 END;
  _ok boolean;
BEGIN
  IF _last IS NULL THEN RETURN false; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.activation_activations a
      JOIN public.activation_approvals s ON s.step = _last
      JOIN public.activation_approvals s7 ON s7.step = 7
     WHERE a.kind = _kind AND a.status = 'active'
       AND s.status = 'approved' AND s.revision = a.step_revision
       AND s7.status = 'approved' AND s7.revision = a.step7_revision
       AND s7.approval_expires_at > now() AND a.window_ends_at > now()
  ) AND (SELECT count(*) FROM public.activation_approvals
          WHERE step BETWEEN 1 AND _last AND status = 'approved') = _last
  INTO _ok;
  IF _ok AND _kind = 'autonomy' THEN _ok := public.activation_effective('live_link'); END IF;
  RETURN COALESCE(_ok, false);
END $$;
REVOKE ALL ON FUNCTION public.activation_effective(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activation_effective(text) TO authenticated, service_role;

-- Step 10 in effect now also requires the recorded autonomy activation.
CREATE OR REPLACE FUNCTION public.activation_autonomy_authorized()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.activation_effective('autonomy');
$$;

-- First unmet prerequisite (nonsecret reason code), or NULL.
CREATE OR REPLACE FUNCTION public.activation_prereq_blocker(_kind text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _last integer := CASE _kind WHEN 'live_link' THEN 9 WHEN 'autonomy' THEN 10 END;
  _blocking integer;
  _s7 public.activation_approvals;
  _c public.activation_approval_checks;
  _stop boolean;
  _caps jsonb;
BEGIN
  IF _last IS NULL THEN RETURN 'unknown_activation'; END IF;
  IF (SELECT count(*) FROM public.activation_approvals WHERE step BETWEEN 1 AND _last) <> _last THEN
    RETURN 'steps_missing';
  END IF;
  SELECT min(step) INTO _blocking FROM public.activation_approvals
   WHERE step BETWEEN 1 AND _last AND status <> 'approved';
  IF _blocking IS NOT NULL THEN RETURN 'step' || _blocking || '_not_approved'; END IF;
  SELECT * INTO _s7 FROM public.activation_approvals WHERE step = 7;
  IF _s7.approval_expires_at IS NULL OR _s7.approval_expires_at <= now()
     OR _s7.approval_expires_at > now() + interval '24 hours' THEN
    RETURN 'step7_window_closed';
  END IF;
  SELECT * INTO _c FROM public.activation_approval_checks WHERE step = 8;
  IF NOT FOUND OR _c.status <> 'passed' OR _c.evidence_version <> 2
     OR _c.deployment_mode IS DISTINCT FROM 'runner_only'
     OR _c.checked_at < _s7.decided_at OR _c.checked_at <= now() - interval '24 hours'
     OR _c.checked_at > now() + interval '1 minute' THEN
    RETURN 'step8_proof_not_fresh';
  END IF;
  SELECT emergency_stop INTO _stop FROM public.omni_terminal_controls WHERE id = 1;
  IF _stop IS DISTINCT FROM false THEN RETURN 'mothership_stop_engaged'; END IF;
  IF _kind = 'autonomy' THEN
    IF NOT public.activation_effective('live_link') THEN RETURN 'live_link_not_active'; END IF;
    SELECT spend_confirmations INTO _caps FROM public.activation_approvals WHERE step = 10;
    IF _caps IS NULL OR _caps->>'openai_cap_usd' IS DISTINCT FROM '10'
       OR _caps->>'daily_limit_usd' IS DISTINCT FROM '5' THEN
      RETURN 'caps_not_confirmed';
    END IF;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.activation_prereq_blocker(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activation_prereq_blocker(text) TO service_role;

-- Owner + fresh MFA: start one activation attempt (idempotent; one attempt at a time).
CREATE OR REPLACE FUNCTION public.activation_activation_begin(_kind text, _attempt uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _row public.activation_activations;
  _blocker text;
  _last integer := CASE _kind WHEN 'live_link' THEN 9 WHEN 'autonomy' THEN 10 END;
  _rev integer;
  _s7 public.activation_approvals;
BEGIN
  PERFORM public.assert_razul_owner();
  PERFORM public.assert_fresh_mfa(900);
  IF _last IS NULL OR _attempt IS NULL THEN
    RAISE EXCEPTION 'Unknown activation' USING ERRCODE = '22023';
  END IF;
  -- Serialize with approval decisions so revisions cannot change under this attempt.
  PERFORM 1 FROM public.activation_approvals ORDER BY step FOR SHARE;
  INSERT INTO public.activation_activations (kind) VALUES (_kind) ON CONFLICT (kind) DO NOTHING;
  SELECT * INTO _row FROM public.activation_activations WHERE kind = _kind FOR UPDATE;
  IF public.activation_effective(_kind) THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'activatedAt', _row.activated_at);
  END IF;
  IF _row.status = 'activating' AND _row.started_at > now() - interval '90 seconds' THEN
    IF _row.attempt_id = _attempt THEN
      RETURN jsonb_build_object('ok', true, 'duplicate', false, 'resumed', true);
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'busy');
  END IF;
  _blocker := public.activation_prereq_blocker(_kind);
  IF _blocker IS NOT NULL THEN
    INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
      VALUES (auth.uid(), 'activation_refused_' || _blocker, 'activation', _kind);
    RETURN jsonb_build_object('ok', false, 'reason', _blocker);
  END IF;
  SELECT revision INTO _rev FROM public.activation_approvals WHERE step = _last;
  SELECT * INTO _s7 FROM public.activation_approvals WHERE step = 7;
  UPDATE public.activation_activations
     SET status = 'activating', attempt_id = _attempt, step_revision = _rev,
         step7_revision = _s7.revision, window_ends_at = _s7.approval_expires_at,
         actor_id = auth.uid(), started_at = now(), activated_at = NULL, reason = '',
         evidence = '{}'::jsonb, updated_at = now()
   WHERE kind = _kind;
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
    VALUES (auth.uid(), 'activation_begin', 'activation', _kind);
  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'resumed', false);
END $$;
REVOKE ALL ON FUNCTION public.activation_activation_begin(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activation_activation_begin(text, uuid) TO authenticated;

-- Halts all OMNI autonomous work locally (windows, CODE, agent jobs) and revokes held permits.
CREATE OR REPLACE FUNCTION public.jackboy_safety_halt()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p record;
BEGIN
  FOR _p IN SELECT job_id, kind FROM public.jackboy_permits WHERE status = 'active' FOR UPDATE LOOP
    UPDATE public.jackboy_permits SET status = 'revoked', closed_at = now(),
           closed_reason = 'omni_halt', updated_at = now()
     WHERE job_id = _p.job_id;
  END LOOP;
  PERFORM public.omni_code_halt('jackboy_safety', NULL);
  PERFORM public.omni_autonomy_end_all('jackboy_safety', NULL);
  UPDATE public.omni_code_jobs SET status = 'paused', lease_expires_at = NULL
   WHERE status IN ('queued', 'retry_wait');
  UPDATE public.omni_agent_jobs SET status = 'stopped', ended_at = now()
   WHERE origin = 'agent' AND status IN ('queued', 'running');
END $$;
REVOKE ALL ON FUNCTION public.jackboy_safety_halt() FROM PUBLIC, anon, authenticated;

-- Service only: finish an attempt after the server verified (or failed) the signed exchange.
CREATE OR REPLACE FUNCTION public.activation_activation_finish(
  _kind text, _attempt uuid, _ok boolean, _reason text, _evidence jsonb
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _row public.activation_activations;
  _last integer := CASE _kind WHEN 'live_link' THEN 9 WHEN 'autonomy' THEN 10 END;
  _blocker text;
  _success boolean := COALESCE(_ok, false);
  _why text := left(COALESCE(_reason, ''), 200);
BEGIN
  IF _last IS NULL OR _attempt IS NULL THEN
    RAISE EXCEPTION 'Unknown activation' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.activation_approvals ORDER BY step FOR SHARE;
  SELECT * INTO _row FROM public.activation_activations WHERE kind = _kind FOR UPDATE;
  IF NOT FOUND OR _row.status <> 'activating' OR _row.attempt_id IS DISTINCT FROM _attempt THEN
    RETURN 'superseded';
  END IF;
  IF _row.started_at <= now() - interval '90 seconds' THEN
    _success := false;
    _why := 'attempt_expired';
  END IF;
  IF _success THEN
    _blocker := public.activation_prereq_blocker(_kind);
    IF _blocker IS NULL AND (
         (SELECT revision FROM public.activation_approvals WHERE step = _last) IS DISTINCT FROM _row.step_revision
      OR (SELECT revision FROM public.activation_approvals WHERE step = 7) IS DISTINCT FROM _row.step7_revision)
    THEN _blocker := 'approvals_changed'; END IF;
    IF _blocker IS NOT NULL THEN _success := false; _why := _blocker; END IF;
  END IF;
  UPDATE public.activation_activations
     SET status = CASE WHEN _success THEN 'active' ELSE 'failed' END,
         activated_at = CASE WHEN _success THEN now() END,
         reason = _why, evidence = COALESCE(_evidence, '{}'::jsonb), updated_at = now()
   WHERE kind = _kind;
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
    VALUES (_row.actor_id, CASE WHEN _success THEN 'activation_active' ELSE 'activation_failed' END,
            'activation', _kind);
  IF NOT _success AND _kind = 'live_link' THEN
    UPDATE public.activation_activations SET status = 'revoked', reason = 'live_link_not_active',
           updated_at = now()
     WHERE kind = 'autonomy' AND status IN ('active', 'activating');
    PERFORM public.jackboy_safety_halt();
  END IF;
  RETURN CASE WHEN _success THEN 'active' ELSE 'failed' END;
END $$;
REVOKE ALL ON FUNCTION public.activation_activation_finish(text, uuid, boolean, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activation_activation_finish(text, uuid, boolean, text, jsonb)
  TO service_role;

-- Owner: deactivate (makes things safer, so no fresh code needed). Live link also ends autonomy.
CREATE OR REPLACE FUNCTION public.activation_activation_revoke(_kind text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_razul_owner();
  IF _kind IS NULL OR _kind NOT IN ('live_link', 'autonomy') THEN
    RAISE EXCEPTION 'Unknown activation' USING ERRCODE = '22023';
  END IF;
  UPDATE public.activation_activations SET status = 'revoked', reason = 'owner_revoked',
         updated_at = now()
   WHERE (kind = _kind OR (_kind = 'live_link' AND kind = 'autonomy'))
     AND status IN ('active', 'activating');
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
    VALUES (auth.uid(), 'activation_revoked', 'activation', _kind);
  PERFORM public.jackboy_safety_halt();
  RETURN 'revoked';
END $$;
REVOKE ALL ON FUNCTION public.activation_activation_revoke(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activation_activation_revoke(text) TO authenticated;

-- Any decision on Steps 1–9 ends the live-link activation; any decision on Steps 1–10 ends the
-- autonomy activation. Re-activating needs the owner again.
CREATE OR REPLACE FUNCTION public.activation_approvals_after_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _n integer;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status AND NEW.revision IS NOT DISTINCT FROM OLD.revision THEN
    RETURN NEW;
  END IF;
  UPDATE public.activation_activations
     SET status = 'revoked', reason = 'step' || NEW.step || '_changed', updated_at = now()
   WHERE status IN ('active', 'activating') AND (kind = 'autonomy' OR NEW.step <= 9);
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n > 0 THEN
    INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
      VALUES (auth.uid(), 'activation_revoked_by_step' || NEW.step, 'activation', 'approvals');
    PERFORM public.jackboy_safety_halt();
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.activation_approvals_after_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER activation_approvals_after_change AFTER UPDATE ON public.activation_approvals
  FOR EACH ROW EXECUTE FUNCTION public.activation_approvals_after_change();

-- 4. Safety recorder with the omni.safety/v1 fields. 'poll' = verified signed snapshot;
-- 'event' = verified signed stop notice (stop/pause only); 'failure'/'stale' = unknown.
CREATE OR REPLACE FUNCTION public.jackboy_safety_record_v2(
  _source text, _paused boolean, _code_stop boolean, _code_enabled boolean,
  _autonomous_allowed boolean, _manual_allowed boolean, _blocked_by text,
  _authorization_expires_at timestamptz, _active_permits integer, _cancellation text,
  _observed_at timestamptz, _expires_at timestamptz, _proof_digest text, _nonce text, _reason text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _state text;
  _cur public.jackboy_safety_state;
BEGIN
  IF _source IS NULL OR _source NOT IN ('poll', 'event', 'failure', 'stale') THEN
    RAISE EXCEPTION 'Unknown safety source' USING ERRCODE = '22023';
  END IF;
  IF _blocked_by IS NOT NULL AND _blocked_by !~ '^[a-z0-9_]{1,40}$' THEN
    RAISE EXCEPTION 'Invalid blocking reason' USING ERRCODE = '22023';
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
    -- Keep the last verified switch values (so a known Kill Switch stays known), drop permission.
    UPDATE public.jackboy_safety_state
       SET state = 'unknown', source = _source, reason = left(COALESCE(_reason, ''), 120),
           autonomous_allowed = NULL, recorded_at = now()
     WHERE id = 1;
  ELSE
    UPDATE public.jackboy_safety_state
       SET state = _state, paused = _paused, code_stop = _code_stop, code_enabled = _code_enabled,
           autonomous_allowed = CASE WHEN _source = 'event' THEN false ELSE _autonomous_allowed END,
           manual_allowed = CASE WHEN _paused THEN false
                                 WHEN _source = 'event' THEN _cur.manual_allowed
                                 ELSE _manual_allowed END,
           blocked_by = CASE WHEN _source = 'event' THEN NULL ELSE _blocked_by END,
           authorization_expires_at = CASE WHEN _source = 'event' THEN _cur.authorization_expires_at
                                           ELSE _authorization_expires_at END,
           active_permits = CASE WHEN _source = 'event' THEN _cur.active_permits ELSE _active_permits END,
           cancellation = left(_cancellation, 40), observed_at = _observed_at,
           expires_at = _expires_at, source = _source, reason = left(COALESCE(_reason, ''), 120),
           proof_digest = _proof_digest, recorded_at = now()
     WHERE id = 1;
  END IF;

  IF _cur.state IS DISTINCT FROM _state OR _source = 'event'
     OR (_source = 'poll' AND _cur.autonomous_allowed IS DISTINCT FROM _autonomous_allowed) THEN
    INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
      VALUES (NULL, 'jackboy_safety_' || _state, 'jackboy_safety', _source);
  END IF;
  RETURN _state;
END $$;
REVOKE ALL ON FUNCTION public.jackboy_safety_record_v2(text, boolean, boolean, boolean, boolean, boolean, text, timestamptz, integer, text, timestamptz, timestamptz, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jackboy_safety_record_v2(text, boolean, boolean, boolean, boolean, boolean, text, timestamptz, integer, text, timestamptz, timestamptz, text, text, text)
  TO service_role;

-- The earlier recorder (stop notices, freshness) now delegates; it never grants autonomy.
CREATE OR REPLACE FUNCTION public.jackboy_safety_record(
  _source text, _paused boolean, _code_stop boolean, _code_enabled boolean, _cancellation text,
  _observed_at timestamptz, _expires_at timestamptz, _proof_digest text, _nonce text, _reason text
) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.jackboy_safety_record_v2(_source, _paused, _code_stop, _code_enabled, NULL, NULL,
    NULL, NULL, NULL, _cancellation, _observed_at, _expires_at, _proof_digest, _nonce, _reason);
$$;

-- "Clear" now means: fresh signed snapshot, no stop, and Jackboy itself allows OMNI autonomy.
CREATE OR REPLACE FUNCTION public.jackboy_safety_clear()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.jackboy_safety_state
     WHERE id = 1 AND state = 'clear' AND source = 'poll'
       AND paused = false AND code_stop = false AND autonomous_allowed = true
       AND expires_at > now()
       AND observed_at > now() - interval '3 minutes'
       AND observed_at <= now() + interval '1 minute'
  );
$$;

-- Halt on any non-clear state and whenever Jackboy stops allowing autonomy.
CREATE OR REPLACE FUNCTION public.jackboy_safety_on_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.state <> 'clear' OR NEW.autonomous_allowed IS DISTINCT FROM true THEN
    PERFORM public.jackboy_safety_halt();
  END IF;
  RETURN NEW;
END $$;

-- Manual terminal: refused only while the last verified Jackboy reading says the Kill Switch is
-- on / manual diagnostics are not allowed. Unknown does not block (it has its own gates).
CREATE OR REPLACE FUNCTION public.jackboy_manual_blocked()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE((SELECT paused IS TRUE OR manual_allowed IS FALSE
                     FROM public.jackboy_safety_state WHERE id = 1), false);
$$;
REVOKE ALL ON FUNCTION public.jackboy_manual_blocked() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jackboy_manual_blocked() TO authenticated, service_role;

-- 5. Permits.
CREATE OR REPLACE FUNCTION public.jackboy_permit_active(_job uuid, _kind text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.jackboy_permits
                  WHERE job_id = _job AND kind = _kind AND status = 'active' AND expires_at > now());
$$;
REVOKE ALL ON FUNCTION public.jackboy_permit_active(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jackboy_permit_active(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.jackboy_permit_stop_job(_job uuid, _kind text, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _kind = 'code' THEN
    UPDATE public.omni_code_jobs SET status = 'stopped', lease_expires_at = NULL, ended_at = now(),
           error = left(_reason, 200)
     WHERE id = _job AND status IN ('queued', 'leased', 'running', 'awaiting_approval', 'retry_wait', 'paused');
  ELSE
    UPDATE public.omni_agent_jobs SET status = 'stopped', ended_at = now()
     WHERE id = _job AND status IN ('queued', 'running');
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.jackboy_permit_stop_job(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- Service only: record a Jackboy permit the server verified (signature, caps, expiry).
CREATE OR REPLACE FUNCTION public.jackboy_permit_record(
  _job uuid, _kind text, _digest text, _permit_id uuid, _expires_at timestamptz, _renewals integer,
  _per_call numeric, _per_task numeric, _daily numeric, _signature_digest text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _cur public.jackboy_permits;
  _stop boolean;
  _state text;
BEGIN
  IF _job IS NULL OR _kind IS NULL OR _kind NOT IN ('autonomous', 'code') OR _permit_id IS NULL
     OR _digest IS NULL OR _digest !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid permit' USING ERRCODE = '22023';
  END IF;
  IF _expires_at IS NULL OR _expires_at <= now() OR _expires_at > now() + interval '65 seconds' THEN
    RAISE EXCEPTION 'Permit expiry out of range' USING ERRCODE = '22023';
  END IF;
  SELECT emergency_stop INTO _stop FROM public.omni_terminal_controls WHERE id = 1;
  IF _stop IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Emergency Stop is engaged or unreadable.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.activation_autonomy_authorized() THEN
    RAISE EXCEPTION 'Activation Step 10 is not in effect.' USING ERRCODE = '42501';
  END IF;
  SELECT state INTO _state FROM public.jackboy_safety_state WHERE id = 1;
  SELECT * INTO _cur FROM public.jackboy_permits WHERE job_id = _job FOR UPDATE;
  IF NOT FOUND THEN
    -- A new job needs a fresh clear reading; Jackboy allows one active job at a time.
    IF NOT public.jackboy_safety_clear() THEN
      RAISE EXCEPTION 'Jackboy safety is not freshly verified clear.' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.jackboy_permits WHERE status = 'active' AND expires_at > now()) THEN
      RAISE EXCEPTION 'Another OMNI job already holds a permit.' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.jackboy_permits (job_id, kind, digest, permit_id, expires_at, renewals,
        per_call_usd, per_task_usd, daily_usd, signature_digest)
      VALUES (_job, _kind, _digest, _permit_id, _expires_at, COALESCE(_renewals, 0),
        _per_call, _per_task, _daily, _signature_digest);
    INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
      VALUES (NULL, 'permit_issued', 'jackboy_permit', _job::text);
    RETURN 'issued';
  END IF;
  -- Renewal: never resumes a closed or lapsed permit, never changes scope.
  IF _cur.status <> 'active' OR _cur.expires_at <= now() THEN
    RAISE EXCEPTION 'This permit is closed; the job must stop and start again as a new job.' USING ERRCODE = '42501';
  END IF;
  IF _cur.kind <> _kind OR _cur.digest <> _digest OR _cur.permit_id <> _permit_id THEN
    RAISE EXCEPTION 'Permit scope changed.' USING ERRCODE = '42501';
  END IF;
  IF _state IN ('engaged', 'paused') THEN
    RAISE EXCEPTION 'A Jackboy stop is recorded.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.jackboy_permits SET expires_at = _expires_at, renewals = COALESCE(_renewals, renewals + 1),
         per_call_usd = _per_call, per_task_usd = _per_task, daily_usd = _daily,
         signature_digest = _signature_digest, updated_at = now()
   WHERE job_id = _job;
  RETURN 'renewed';
END $$;
REVOKE ALL ON FUNCTION public.jackboy_permit_record(uuid, text, text, uuid, timestamptz, integer, numeric, numeric, numeric, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jackboy_permit_record(uuid, text, text, uuid, timestamptz, integer, numeric, numeric, numeric, text)
  TO service_role;

-- Service only: close a permit. Lapsed/revoked stops the job immediately (never resumed).
CREATE OR REPLACE FUNCTION public.jackboy_permit_close(_job uuid, _status text, _reason text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _cur public.jackboy_permits;
BEGIN
  IF _status IS NULL OR _status NOT IN ('released', 'lapsed', 'revoked') THEN
    RAISE EXCEPTION 'Invalid permit status' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _cur FROM public.jackboy_permits WHERE job_id = _job FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF _cur.status = 'active' THEN
    UPDATE public.jackboy_permits SET status = _status, closed_at = now(),
           closed_reason = left(COALESCE(_reason, _status), 60), updated_at = now()
     WHERE job_id = _job;
    INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
      VALUES (NULL, 'permit_' || _status, 'jackboy_permit', _job::text);
  END IF;
  IF _status <> 'released' OR _cur.status <> 'active' THEN
    PERFORM public.jackboy_permit_stop_job(_job, _cur.kind, 'permit_' || _status);
  END IF;
  RETURN _status;
END $$;
REVOKE ALL ON FUNCTION public.jackboy_permit_close(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jackboy_permit_close(uuid, text, text) TO service_role;

-- Service only (scheduled): expired permits lapse and their jobs stop.
CREATE OR REPLACE FUNCTION public.jackboy_permits_enforce()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _p record; _n integer := 0;
BEGIN
  FOR _p IN SELECT job_id FROM public.jackboy_permits
             WHERE status = 'active' AND expires_at <= now() FOR UPDATE LOOP
    PERFORM public.jackboy_permit_close(_p.job_id, 'lapsed', 'not_renewed_in_time');
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.jackboy_permits_enforce() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jackboy_permits_enforce() TO service_role;

-- 6. CODE leasing also needs an active Jackboy permit for that job.
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
    IF NOT public.jackboy_permit_active(NEW.id, 'code') THEN
      RAISE EXCEPTION 'This CODE job has no active Jackboy permit.';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- 7. Workspace jobs: agent-initiated jobs need full admission and a permit; every job is refused
-- while a verified Jackboy reading says the Kill Switch is on.
CREATE OR REPLACE FUNCTION public.omni_agent_job_admission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _stop boolean;
BEGIN
  IF public.jackboy_manual_blocked() THEN
    RAISE EXCEPTION 'Jackboy reports its System Kill Switch on, so OMNI terminal work is refused.'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.origin IS DISTINCT FROM 'owner' THEN
    SELECT emergency_stop INTO _stop FROM public.omni_terminal_controls WHERE id = 1;
    IF _stop IS DISTINCT FROM false OR NOT public.jackboy_safety_clear()
       OR NOT public.activation_autonomy_authorized()
       OR NOT public.jackboy_permit_active(NEW.id, 'autonomous') THEN
      RAISE EXCEPTION 'Autonomous OMNI jobs need Step 10 in effect, every stop released, a fresh clear Jackboy reading and a Jackboy permit.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.omni_agent_job_admission() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER omni_agent_job_admission BEFORE INSERT ON public.omni_agent_jobs
  FOR EACH ROW EXECUTE FUNCTION public.omni_agent_job_admission();
