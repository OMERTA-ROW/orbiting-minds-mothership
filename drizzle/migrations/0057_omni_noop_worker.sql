-- No-op worker only. This migration grants no shell, CODE, project or provider access.
-- Applying it and provisioning a worker identity require separate owner approval.
CREATE TABLE public.omni_noop_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  key_hash text NOT NULL UNIQUE CHECK (key_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '24 hours')
);

CREATE TABLE public.omni_noop_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  worker_id uuid REFERENCES public.omni_noop_workers(id),
  duration_ms integer NOT NULL CHECK (duration_ms BETWEEN 1000 AND 30000),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'acquiring', 'running', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  ended_at timestamptz,
  lease_expires_at timestamptz,
  reason text CHECK (reason IS NULL OR char_length(reason) <= 60)
);

ALTER TABLE public.omni_noop_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.omni_noop_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.omni_noop_workers, public.omni_noop_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.omni_noop_jobs TO authenticated;
GRANT ALL ON public.omni_noop_workers, public.omni_noop_jobs TO service_role;
CREATE POLICY "Verified owner reads no-op jobs" ON public.omni_noop_jobs
  FOR SELECT TO authenticated USING (public.is_razul_owner());

CREATE FUNCTION public.omni_noop_worker_create(_name text, _hash text, _hours integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _id uuid;
BEGIN
  PERFORM public.assert_razul_owner();
  PERFORM public.assert_fresh_mfa(900);
  IF _name IS NULL OR char_length(trim(_name)) NOT BETWEEN 1 AND 60
     OR _hash IS NULL OR _hash !~ '^[a-f0-9]{64}$' OR _hours IS NULL OR _hours NOT BETWEEN 1 AND 24 THEN
    RAISE EXCEPTION 'Invalid worker identity' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.omni_noop_workers(name, key_hash, created_by, expires_at)
    VALUES (trim(_name), _hash, auth.uid(), now() + make_interval(hours => _hours))
    RETURNING id INTO _id;
  INSERT INTO public.razul_control_audit(actor_id, action, record_type, record_id)
    VALUES (auth.uid(), 'worker_created', 'omni_noop_worker', _id::text);
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.omni_noop_worker_create(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_noop_worker_create(text, text, integer) TO authenticated;

CREATE FUNCTION public.omni_noop_workers_list()
RETURNS TABLE(id uuid, name text, created_at timestamptz, expires_at timestamptz, revoked_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_razul_owner();
  RETURN QUERY SELECT w.id, w.name, w.created_at, w.expires_at, w.revoked_at
    FROM public.omni_noop_workers w ORDER BY w.created_at DESC LIMIT 100;
END $$;
REVOKE ALL ON FUNCTION public.omni_noop_workers_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_noop_workers_list() TO authenticated;

CREATE FUNCTION public.omni_noop_jobs_list()
RETURNS TABLE(id uuid, worker_id uuid, status text, created_at timestamptz, started_at timestamptz,
  ended_at timestamptz, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_razul_owner();
  RETURN QUERY SELECT j.id, j.worker_id,
    CASE WHEN j.status IN ('acquiring', 'running') AND j.lease_expires_at <= now()
      THEN 'lease_expired' ELSE j.status END,
    j.created_at, j.started_at, j.ended_at, j.reason
    FROM public.omni_noop_jobs j ORDER BY j.created_at DESC LIMIT 50;
END $$;
REVOKE ALL ON FUNCTION public.omni_noop_jobs_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_noop_jobs_list() TO authenticated;

CREATE FUNCTION public.omni_noop_worker_revoke(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _job record;
BEGIN
  PERFORM public.assert_razul_owner();
  UPDATE public.omni_noop_workers SET revoked_at = now() WHERE id = _id AND revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Worker not active' USING ERRCODE = 'P0002'; END IF;
  FOR _job IN UPDATE public.omni_noop_jobs SET status = 'cancelled', ended_at = now(),
      lease_expires_at = NULL, reason = 'worker_revoked'
    WHERE worker_id = _id AND status IN ('acquiring', 'running') RETURNING id LOOP
    PERFORM public.jackboy_permit_close(_job.id, 'revoked', 'worker_revoked');
    INSERT INTO public.razul_control_audit(actor_id, action, record_type, record_id)
      VALUES (auth.uid(), 'noop_cancelled', 'omni_noop_job', _job.id::text);
  END LOOP;
  INSERT INTO public.razul_control_audit(actor_id, action, record_type, record_id)
    VALUES (auth.uid(), 'worker_revoked', 'omni_noop_worker', _id::text);
END $$;
REVOKE ALL ON FUNCTION public.omni_noop_worker_revoke(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_noop_worker_revoke(uuid) TO authenticated;

CREATE FUNCTION public.omni_noop_enqueue(_duration_ms integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _id uuid;
BEGIN
  PERFORM public.assert_razul_owner();
  PERFORM public.assert_fresh_mfa(900);
  IF _duration_ms IS NULL OR _duration_ms NOT BETWEEN 1000 AND 30000 THEN
    RAISE EXCEPTION 'Invalid no-op duration' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('omni-noop-queue', 0));
  IF (SELECT count(*) FROM public.omni_noop_jobs WHERE status = 'queued') >= 5 THEN
    RAISE EXCEPTION 'No-op queue is full' USING ERRCODE = '55000';
  END IF;
  INSERT INTO public.omni_noop_jobs(owner_id, duration_ms)
    VALUES (auth.uid(), _duration_ms) RETURNING id INTO _id;
  INSERT INTO public.razul_control_audit(actor_id, action, record_type, record_id)
    VALUES (auth.uid(), 'noop_queued', 'omni_noop_job', _id::text);
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.omni_noop_enqueue(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_noop_enqueue(integer) TO authenticated;

CREATE FUNCTION public.omni_noop_sweep()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _old record; _count integer := 0;
BEGIN
  FOR _old IN UPDATE public.omni_noop_jobs j SET status = 'cancelled', ended_at = now(),
      lease_expires_at = NULL, reason = 'lease_or_identity_expired'
    WHERE j.status IN ('acquiring', 'running') AND
      (j.lease_expires_at <= now() OR NOT EXISTS (
        SELECT 1 FROM public.omni_noop_workers w WHERE w.id = j.worker_id
          AND w.revoked_at IS NULL AND w.expires_at > now()))
    RETURNING j.id LOOP
    PERFORM public.jackboy_permit_close(_old.id, 'lapsed', 'lease_or_identity_expired');
    INSERT INTO public.razul_control_audit(actor_id, action, record_type, record_id)
      VALUES (NULL, 'noop_cancelled', 'omni_noop_job', _old.id::text);
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END $$;
REVOKE ALL ON FUNCTION public.omni_noop_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_noop_sweep() TO service_role;

-- Service-only broker action. Identity is rechecked in the same transaction as each transition.
CREATE FUNCTION public.omni_noop_worker_action(_hash text, _op text, _job uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _worker public.omni_noop_workers;
  _row public.omni_noop_jobs;
  _allowed boolean;
  _digest constant text := '9903e100e835979c05c1664f2eac28a97ba4884a56e0f62807a22e43b04d8633';
BEGIN
  IF _hash IS NULL OR _hash !~ '^[a-f0-9]{64}$'
     OR _op IS NULL OR _op NOT IN ('inspect', 'check', 'claim', 'start', 'heartbeat', 'complete', 'cancel') THEN
    RAISE EXCEPTION 'Invalid worker request' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _worker FROM public.omni_noop_workers
   WHERE key_hash = _hash AND revoked_at IS NULL AND expires_at > now() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'identity_invalid'); END IF;
  IF _op = 'inspect' THEN RETURN jsonb_build_object('ok', true); END IF;

  PERFORM public.omni_noop_sweep();

  PERFORM 1 FROM public.activation_approvals ORDER BY step FOR SHARE;
  PERFORM 1 FROM public.omni_terminal_controls WHERE id = 1 FOR SHARE;
  PERFORM 1 FROM public.activation_activations ORDER BY kind FOR SHARE;
  PERFORM 1 FROM public.jackboy_safety_state WHERE id = 1 FOR SHARE;
  SELECT COALESCE((SELECT emergency_stop = false FROM public.omni_terminal_controls WHERE id = 1), false)
    AND public.activation_effective('autonomy') AND public.jackboy_safety_clear() INTO _allowed;
  IF _op = 'claim' THEN
    IF NOT _allowed THEN RETURN jsonb_build_object('ok', false, 'reason', 'safety_blocked'); END IF;
    IF EXISTS (SELECT 1 FROM public.omni_noop_jobs WHERE worker_id = _worker.id AND status IN ('acquiring', 'running')) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'worker_busy');
    END IF;
    SELECT * INTO _row FROM public.omni_noop_jobs WHERE status = 'queued'
      ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT 1;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', true, 'job', NULL); END IF;
    UPDATE public.omni_noop_jobs SET status = 'acquiring', worker_id = _worker.id,
      lease_expires_at = now() + interval '15 seconds' WHERE id = _row.id;
    INSERT INTO public.razul_control_audit(actor_id, action, record_type, record_id)
      VALUES (NULL, 'noop_claimed', 'omni_noop_job', _row.id::text);
    RETURN jsonb_build_object('ok', true, 'job', _row.id, 'durationMs', _row.duration_ms);
  END IF;
  SELECT * INTO _row FROM public.omni_noop_jobs WHERE id = _job AND worker_id = _worker.id FOR UPDATE;
  IF NOT FOUND OR _row.status NOT IN ('acquiring', 'running') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'job_unavailable');
  END IF;
  IF _op = 'check' THEN RETURN jsonb_build_object('ok', true, 'status', _row.status); END IF;
  IF _op = 'cancel' THEN
    UPDATE public.omni_noop_jobs SET status = 'cancelled', ended_at = now(), lease_expires_at = NULL,
      reason = 'worker_cancelled' WHERE id = _job;
    PERFORM public.jackboy_permit_close(_job, 'revoked', 'worker_cancelled');
    INSERT INTO public.razul_control_audit(actor_id, action, record_type, record_id)
      VALUES (NULL, 'noop_cancelled', 'omni_noop_job', _job::text);
    RETURN jsonb_build_object('ok', true);
  END IF;
  PERFORM 1 FROM public.jackboy_permits WHERE job_id = _job FOR SHARE;
  IF NOT _allowed OR _row.lease_expires_at <= now() OR NOT EXISTS (
    SELECT 1 FROM public.jackboy_permits WHERE job_id = _job AND kind = 'autonomous'
      AND digest = _digest AND status = 'active' AND expires_at > now() + interval '3 seconds'
  ) THEN
    UPDATE public.omni_noop_jobs SET status = 'cancelled', ended_at = now(), lease_expires_at = NULL,
      reason = 'safety_or_permit' WHERE id = _job;
    PERFORM public.jackboy_permit_close(_job, 'revoked', 'safety_or_permit');
    INSERT INTO public.razul_control_audit(actor_id, action, record_type, record_id)
      VALUES (NULL, 'noop_cancelled', 'omni_noop_job', _job::text);
    RETURN jsonb_build_object('ok', false, 'reason', 'safety_or_permit');
  END IF;
  IF _op = 'start' AND _row.status = 'acquiring' THEN
    UPDATE public.omni_noop_jobs SET status = 'running', started_at = now(),
      lease_expires_at = now() + interval '15 seconds' WHERE id = _job;
    INSERT INTO public.razul_control_audit(actor_id, action, record_type, record_id)
      VALUES (NULL, 'noop_started', 'omni_noop_job', _job::text);
  ELSIF _op = 'heartbeat' AND _row.status = 'running' THEN
    UPDATE public.omni_noop_jobs SET lease_expires_at = now() + interval '15 seconds' WHERE id = _job;
  ELSIF _op = 'complete' AND _row.status = 'running'
        AND _row.started_at + make_interval(secs => _row.duration_ms / 1000.0) <= now() THEN
    UPDATE public.omni_noop_jobs SET status = 'completed', ended_at = now(),
      lease_expires_at = NULL WHERE id = _job;
    INSERT INTO public.razul_control_audit(actor_id, action, record_type, record_id)
      VALUES (NULL, 'noop_completed', 'omni_noop_job', _job::text);
  ELSE
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_transition');
  END IF;
  RETURN jsonb_build_object('ok', true, 'leaseMs', 5000);
END $$;
REVOKE ALL ON FUNCTION public.omni_noop_worker_action(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_noop_worker_action(text, text, uuid) TO service_role;
