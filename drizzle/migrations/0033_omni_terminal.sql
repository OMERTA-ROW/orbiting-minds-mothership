-- OMNI Terminal: owner-only Emergency Stop, held task queue and server-recorded command log.
-- Records only. Nothing here executes, dispatches, contacts Railway/Jackboy/CODE or makes paid calls.
-- A missing controls row means the Emergency Stop is engaged (fail closed).
CREATE TABLE public.omni_terminal_controls (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  emergency_stop boolean NOT NULL DEFAULT true,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 280),
  revision integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.omni_terminal_controls TO authenticated;
GRANT ALL ON public.omni_terminal_controls TO service_role;
ALTER TABLE public.omni_terminal_controls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Verified MFA owner reads terminal controls"
  ON public.omni_terminal_controls FOR SELECT TO authenticated
  USING (public.is_razul_owner());

-- 'held' is the only active state: no dispatcher exists. A later reviewed migration must add any dispatch state.
CREATE TABLE public.omni_terminal_tasks (
  id uuid PRIMARY KEY,
  created_by uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('code.generate', 'code.edit', 'code.test', 'code.debug', 'agent.handoff')),
  agent text NOT NULL CHECK (agent IN ('jackboy', 'jax', 'razul', 'sabrina', 'guardian', 'hercules')),
  project_label text NOT NULL CHECK (length(btrim(project_label)) BETWEEN 1 AND 120),
  repository text CHECK (repository IS NULL OR (length(repository) <= 200 AND repository ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')),
  instructions text NOT NULL CHECK (length(btrim(instructions)) BETWEEN 3 AND 4000),
  state text NOT NULL DEFAULT 'held' CHECK (state IN ('held', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  CHECK (kind = 'agent.handoff' OR agent = 'jackboy')
);
CREATE INDEX omni_terminal_tasks_created_idx ON public.omni_terminal_tasks (created_at DESC);
GRANT SELECT ON public.omni_terminal_tasks TO authenticated;
GRANT ALL ON public.omni_terminal_tasks TO service_role;
ALTER TABLE public.omni_terminal_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Verified MFA owner reads terminal tasks"
  ON public.omni_terminal_tasks FOR SELECT TO authenticated
  USING (public.is_razul_owner());

CREATE TABLE public.omni_terminal_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  command text NOT NULL CHECK (length(command) BETWEEN 1 AND 200),
  outcome text NOT NULL CHECK (outcome IN ('ok', 'blocked', 'denied', 'error')),
  summary text NOT NULL DEFAULT '' CHECK (length(summary) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX omni_terminal_log_created_idx ON public.omni_terminal_log (created_at DESC);
CREATE INDEX omni_terminal_log_session_idx ON public.omni_terminal_log (session_id, created_at);
GRANT SELECT ON public.omni_terminal_log TO authenticated;
GRANT ALL ON public.omni_terminal_log TO service_role;
ALTER TABLE public.omni_terminal_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Verified MFA owner reads terminal log"
  ON public.omni_terminal_log FOR SELECT TO authenticated
  USING (public.is_razul_owner());

CREATE OR REPLACE FUNCTION public.omni_terminal_secret_like(_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT COALESCE(_text, '') ~ '(sk-[A-Za-z0-9_-]{8,}|eyJ[A-Za-z0-9_-]{10,}|omni_[0-9a-f]{4,8}_[A-Za-z0-9_-]{8,}|[A-Fa-f0-9]{32,}|[A-Za-z0-9+/_=-]{40,})'
$$;

-- Engaging needs only the verified MFA owner, so it is always available in an emergency.
CREATE OR REPLACE FUNCTION public.omni_terminal_engage_stop(_reason text)
RETURNS SETOF public.omni_terminal_controls
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _clean text := COALESCE(btrim(_reason), '');
BEGIN
  PERFORM public.assert_razul_owner();
  IF length(_clean) > 280 THEN
    RAISE EXCEPTION 'Reason must be 280 characters or fewer' USING ERRCODE = '22023';
  END IF;
  IF public.omni_terminal_secret_like(_clean) THEN
    RAISE EXCEPTION 'Reason looks like a key or token; remove it' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.omni_terminal_controls (id, emergency_stop, changed_by, changed_at, reason, revision)
  VALUES (1, true, auth.uid(), now(), _clean, 1)
  ON CONFLICT (id) DO UPDATE
    SET emergency_stop = true, changed_by = auth.uid(), changed_at = now(), reason = _clean,
        revision = public.omni_terminal_controls.revision + 1;
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (auth.uid(), 'emergency_stop_engage', 'omni_terminal', 'controls');
  RETURN QUERY SELECT * FROM public.omni_terminal_controls WHERE id = 1;
END $$;

-- Releasing needs a fresh second factor and a reason. Releasing turns nothing on by itself.
CREATE OR REPLACE FUNCTION public.omni_terminal_release_stop(_reason text)
RETURNS SETOF public.omni_terminal_controls
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _clean text := COALESCE(btrim(_reason), '');
BEGIN
  PERFORM public.assert_razul_owner();
  PERFORM public.assert_fresh_mfa(900);
  IF length(_clean) < 3 OR length(_clean) > 280 THEN
    RAISE EXCEPTION 'Give a reason of 3 to 280 characters' USING ERRCODE = '22023';
  END IF;
  IF public.omni_terminal_secret_like(_clean) THEN
    RAISE EXCEPTION 'Reason looks like a key or token; remove it' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.omni_terminal_controls (id, emergency_stop, changed_by, changed_at, reason, revision)
  VALUES (1, false, auth.uid(), now(), _clean, 1)
  ON CONFLICT (id) DO UPDATE
    SET emergency_stop = false, changed_by = auth.uid(), changed_at = now(), reason = _clean,
        revision = public.omni_terminal_controls.revision + 1;
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (auth.uid(), 'emergency_stop_release', 'omni_terminal', 'controls');
  RETURN QUERY SELECT * FROM public.omni_terminal_controls WHERE id = 1;
END $$;

CREATE OR REPLACE FUNCTION public.omni_terminal_queue_task(
  _id uuid,
  _kind text,
  _agent text,
  _project text,
  _repository text,
  _instructions text
)
RETURNS SETOF public.omni_terminal_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _existing public.omni_terminal_tasks;
BEGIN
  PERFORM public.assert_razul_owner();
  IF _id IS NULL THEN
    RAISE EXCEPTION 'Task id is required' USING ERRCODE = '22023';
  END IF;
  IF public.omni_terminal_secret_like(_project) OR public.omni_terminal_secret_like(_instructions) THEN
    RAISE EXCEPTION 'Task text looks like a key or token; remove it' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _existing FROM public.omni_terminal_tasks WHERE id = _id;
  IF FOUND THEN
    -- Idempotent retry: same request returns the stored task, a different one is refused.
    IF _existing.kind IS DISTINCT FROM _kind OR _existing.agent IS DISTINCT FROM _agent
       OR _existing.instructions IS DISTINCT FROM btrim(_instructions) THEN
      RAISE EXCEPTION 'Task id already used for a different task' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT * FROM public.omni_terminal_tasks WHERE id = _id;
    RETURN;
  END IF;
  INSERT INTO public.omni_terminal_tasks (id, created_by, kind, agent, project_label, repository, instructions)
  VALUES (_id, auth.uid(), _kind, _agent, btrim(_project), NULLIF(btrim(COALESCE(_repository, '')), ''), btrim(_instructions));
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (auth.uid(), 'task_held', 'omni_terminal', _id::text);
  RETURN QUERY SELECT * FROM public.omni_terminal_tasks WHERE id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.omni_terminal_cancel_task(_id uuid)
RETURNS SETOF public.omni_terminal_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM public.assert_razul_owner();
  UPDATE public.omni_terminal_tasks SET state = 'cancelled', cancelled_at = now()
  WHERE id = _id AND state = 'held';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No held task with that id' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (auth.uid(), 'task_cancel', 'omni_terminal', _id::text);
  RETURN QUERY SELECT * FROM public.omni_terminal_tasks WHERE id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.omni_terminal_record(
  _session uuid,
  _command text,
  _outcome text,
  _summary text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _new uuid;
BEGIN
  PERFORM public.assert_razul_owner();
  IF _session IS NULL THEN
    RAISE EXCEPTION 'Session id is required' USING ERRCODE = '22023';
  END IF;
  IF public.omni_terminal_secret_like(_command) OR public.omni_terminal_secret_like(_summary) THEN
    RAISE EXCEPTION 'Log text looks like a key or token' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.omni_terminal_log (session_id, actor_id, command, outcome, summary)
  VALUES (_session, auth.uid(), _command, _outcome, COALESCE(_summary, ''))
  RETURNING id INTO _new;
  RETURN _new;
END $$;

REVOKE ALL ON FUNCTION public.omni_terminal_secret_like(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_terminal_secret_like(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.omni_terminal_engage_stop(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_terminal_engage_stop(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.omni_terminal_release_stop(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_terminal_release_stop(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.omni_terminal_queue_task(uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_terminal_queue_task(uuid, text, text, text, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.omni_terminal_cancel_task(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_terminal_cancel_task(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.omni_terminal_record(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_terminal_record(uuid, text, text, text) TO authenticated, service_role;
