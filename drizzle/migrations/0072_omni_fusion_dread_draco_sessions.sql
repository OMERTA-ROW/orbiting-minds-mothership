-- Fusion collaboration, phase 2a: owner-approved Dread/Draco sessions. The owner approves a fixed number of
-- replies (fresh two-step code); each reply then runs only on the owner's click, with Emergency Stop released,
-- AI approved and the shared one-at-a-time OMNI guard held. Replies are written only by the service. Nothing
-- here executes tasks, approves, spends beyond the bounded replies, issues permits or changes the Stop.
CREATE TABLE public.omni_fusion_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  topic text NOT NULL CHECK (length(btrim(topic)) BETWEEN 1 AND 2000),
  first_agent text NOT NULL CHECK (first_agent IN ('dread', 'draco')),
  max_replies integer NOT NULL CHECK (max_replies BETWEEN 2 AND 4),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'finished', 'stopped')),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CHECK ((status = 'open') = (finished_at IS NULL))
);
CREATE INDEX omni_fusion_sessions_owner_idx ON public.omni_fusion_sessions (owner_id, created_at DESC);
REVOKE ALL ON public.omni_fusion_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.omni_fusion_sessions TO authenticated;
GRANT ALL ON public.omni_fusion_sessions TO service_role;
ALTER TABLE public.omni_fusion_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Verified MFA owner reads own Fusion sessions" ON public.omni_fusion_sessions
  FOR SELECT TO authenticated USING (public.is_razul_owner() AND owner_id = auth.uid());

CREATE TABLE public.omni_fusion_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.omni_fusion_sessions (id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  turn_no integer NOT NULL CHECK (turn_no BETWEEN 1 AND 4),
  agent_id text NOT NULL CHECK (agent_id IN ('dread', 'draco')),
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'cancelled', 'denied')),
  reply text CHECK (length(reply) BETWEEN 1 AND 6000),
  input_tokens integer CHECK (input_tokens >= 0),
  output_tokens integer CHECK (output_tokens >= 0),
  total_tokens integer CHECK (total_tokens >= 0),
  error_status integer CHECK (error_status BETWEEN 100 AND 599),
  error_reason text CHECK (error_reason ~ '^[a-z_]{1,60}$'),
  gateway_run_id text CHECK (length(gateway_run_id) <= 200),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CHECK ((status = 'running') = (finished_at IS NULL)),
  CHECK ((status = 'completed') = (reply IS NOT NULL))
);
CREATE UNIQUE INDEX omni_fusion_turns_one_running ON public.omni_fusion_turns (session_id) WHERE status = 'running';
CREATE UNIQUE INDEX omni_fusion_turns_one_completed ON public.omni_fusion_turns (session_id, turn_no) WHERE status = 'completed';
CREATE INDEX omni_fusion_turns_owner_idx ON public.omni_fusion_turns (owner_id, started_at DESC);
REVOKE ALL ON public.omni_fusion_turns FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.omni_fusion_turns TO authenticated;
GRANT ALL ON public.omni_fusion_turns TO service_role;
ALTER TABLE public.omni_fusion_turns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Verified MFA owner reads own Fusion turns" ON public.omni_fusion_turns
  FOR SELECT TO authenticated USING (public.is_razul_owner() AND owner_id = auth.uid());

CREATE OR REPLACE FUNCTION public.omni_fusion_session_create(_topic text, _first_agent text, _max_replies integer)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _id uuid;
  _clean text := COALESCE(btrim(_topic), '');
BEGIN
  PERFORM public.assert_razul_owner();
  PERFORM public.assert_fresh_mfa(900);
  IF length(_clean) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Write a topic of up to 2,000 characters' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(_first_agent, '') NOT IN ('dread', 'draco') OR COALESCE(_max_replies, 0) NOT BETWEEN 2 AND 4 THEN
    RAISE EXCEPTION 'Choose who starts and 2 to 4 replies' USING ERRCODE = '22023';
  END IF;
  IF public.omni_terminal_secret_like(_clean) THEN
    RAISE EXCEPTION 'This looks like a key or token; remove it first' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('omni_fusion_sessions:' || auth.uid()::text));
  IF (SELECT count(*) FROM public.omni_fusion_sessions s
      WHERE s.owner_id = auth.uid() AND s.created_at > now() - interval '24 hours') >= 5 THEN
    RAISE EXCEPTION 'Five Fusion sessions per 24 hours; try again later' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.omni_fusion_sessions s WHERE s.owner_id = auth.uid() AND s.status = 'open') THEN
    RAISE EXCEPTION 'Finish or stop the open Fusion session first' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.omni_fusion_sessions (owner_id, topic, first_agent, max_replies)
  VALUES (auth.uid(), _clean, _first_agent, _max_replies) RETURNING id INTO _id;
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (auth.uid(), 'fusion_session_approved', 'omni_fusion_session', _id::text);
  RETURN _id;
END $$;

-- Owner click for the next reply. Returns the transcript the server sends to the model.
CREATE OR REPLACE FUNCTION public.omni_fusion_turn_begin(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _s public.omni_fusion_sessions;
  _done integer;
  _attempts integer;
  _turn uuid := gen_random_uuid();
  _agent text;
  _guarded integer;
BEGIN
  PERFORM public.assert_razul_owner();
  -- Writers' order: Stop row, then session row.
  PERFORM 1 FROM public.omni_terminal_controls WHERE id = 1 FOR SHARE;
  SELECT * INTO _s FROM public.omni_fusion_sessions WHERE id = _session_id AND owner_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'session_not_found');
  END IF;
  IF _s.status <> 'open' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'session_closed');
  END IF;
  IF public.omni_stop_engaged() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'emergency_stop_engaged');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.beta_access a WHERE a.user_id = auth.uid() AND a.ai_approved AND NOT a.paused) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ai_not_approved');
  END IF;
  IF EXISTS (SELECT 1 FROM public.omni_fusion_turns t WHERE t.session_id = _s.id AND t.status = 'running') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'reply_in_progress');
  END IF;
  SELECT count(*) FILTER (WHERE t.status = 'completed'), count(*) INTO _done, _attempts
  FROM public.omni_fusion_turns t WHERE t.session_id = _s.id;
  IF _done >= _s.max_replies THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'reply_limit');
  END IF;
  IF _attempts >= _s.max_replies + 2 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'attempt_limit');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('omni_fusion_turns:' || auth.uid()::text));
  IF (SELECT count(*) FROM public.omni_fusion_turns t
      WHERE t.owner_id = auth.uid() AND t.started_at > now() - interval '24 hours') >= 20 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'daily_limit');
  END IF;
  INSERT INTO public.ai_gateway_state (feature, blocked_status, message)
  VALUES ('evolution-omni', 503,
          'OMNI request ' || _turn::text || ' is in progress or its outcome needs owner review. No automatic restart.')
  ON CONFLICT (feature) DO NOTHING;
  GET DIAGNOSTICS _guarded = ROW_COUNT;
  IF _guarded <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ai_busy_or_paused');
  END IF;
  _agent := CASE WHEN _done % 2 = 0 THEN _s.first_agent
                 WHEN _s.first_agent = 'dread' THEN 'draco' ELSE 'dread' END;
  INSERT INTO public.omni_fusion_turns (id, session_id, owner_id, turn_no, agent_id)
  VALUES (_turn, _s.id, auth.uid(), _done + 1, _agent);
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (auth.uid(), 'fusion_turn_start', 'omni_fusion_turn', _turn::text);
  RETURN jsonb_build_object(
    'ok', true, 'turn_id', _turn, 'turn_no', _done + 1, 'max_replies', _s.max_replies, 'agent_id', _agent,
    'topic', _s.topic,
    'transcript', COALESCE((SELECT jsonb_agg(jsonb_build_object('agent_id', t.agent_id, 'reply', t.reply) ORDER BY t.turn_no)
                            FROM public.omni_fusion_turns t WHERE t.session_id = _s.id AND t.status = 'completed'), '[]'::jsonb));
END $$;

-- Request-bound re-check while a reply is generated (owner session, Stop, AI approval, session still open).
CREATE OR REPLACE FUNCTION public.omni_fusion_turn_check(_turn_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _t public.omni_fusion_turns;
  _status text;
BEGIN
  PERFORM public.assert_razul_owner();
  SELECT * INTO _t FROM public.omni_fusion_turns WHERE id = _turn_id AND owner_id = auth.uid();
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'turn_not_found'); END IF;
  IF _t.status <> 'running' THEN RETURN jsonb_build_object('ok', false, 'reason', 'turn_finished'); END IF;
  SELECT s.status INTO _status FROM public.omni_fusion_sessions s WHERE s.id = _t.session_id;
  IF _status IS DISTINCT FROM 'open' THEN RETURN jsonb_build_object('ok', false, 'reason', 'session_stopped'); END IF;
  IF public.omni_stop_engaged() THEN RETURN jsonb_build_object('ok', false, 'reason', 'emergency_stop_engaged'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.beta_access a WHERE a.user_id = auth.uid() AND a.ai_approved AND NOT a.paused) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ai_not_approved');
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- Service-only: records the outcome, stores the reply only when completed, releases or keeps (pause) the guard.
CREATE OR REPLACE FUNCTION public.omni_fusion_turn_finish(
  _turn_id uuid, _status text, _reply text, _input_tokens integer, _output_tokens integer, _total_tokens integer,
  _error_status integer, _error_reason text, _gateway_run_id text, _pause_status integer, _pause_message text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _t public.omni_fusion_turns;
  _guard text := 'OMNI request ' || _turn_id::text || ' is in progress or its outcome needs owner review. No automatic restart.';
  _guard_rows integer;
  _done integer;
  _max integer;
BEGIN
  IF _status IS NULL OR _status NOT IN ('completed', 'failed', 'cancelled', 'denied') THEN
    RAISE EXCEPTION 'Unknown Fusion outcome' USING ERRCODE = '22023';
  END IF;
  IF _status = 'completed' AND (_reply IS NULL OR length(btrim(_reply)) NOT BETWEEN 1 AND 6000) THEN
    RAISE EXCEPTION 'A completed reply needs 1 to 6,000 characters' USING ERRCODE = '22023';
  END IF;
  IF _pause_status IS NOT NULL AND (_pause_status NOT IN (402, 403, 404)
     OR _pause_message IS NULL OR length(_pause_message) NOT BETWEEN 1 AND 500) THEN
    RAISE EXCEPTION 'Invalid AI pause' USING ERRCODE = '22023';
  END IF;
  UPDATE public.omni_fusion_turns SET
    status = _status,
    reply = CASE WHEN _status = 'completed' THEN btrim(_reply) ELSE NULL END,
    input_tokens = _input_tokens, output_tokens = _output_tokens, total_tokens = _total_tokens,
    error_status = CASE WHEN _status = 'completed' THEN NULL ELSE _error_status END,
    error_reason = CASE WHEN _status = 'completed' THEN NULL ELSE _error_reason END,
    gateway_run_id = _gateway_run_id,
    finished_at = clock_timestamp()
  WHERE id = _turn_id AND status = 'running'
  RETURNING * INTO _t;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'turn_not_running');
  END IF;
  IF _pause_status IS NOT NULL THEN
    UPDATE public.ai_gateway_state SET blocked_status = _pause_status, message = _pause_message, blocked_at = now()
    WHERE feature = 'evolution-omni' AND message = _guard;
  ELSE
    DELETE FROM public.ai_gateway_state WHERE feature = 'evolution-omni' AND message = _guard;
  END IF;
  GET DIAGNOSTICS _guard_rows = ROW_COUNT;
  SELECT count(*) FILTER (WHERE status = 'completed') INTO _done FROM public.omni_fusion_turns WHERE session_id = _t.session_id;
  SELECT max_replies INTO _max FROM public.omni_fusion_sessions WHERE id = _t.session_id;
  IF _done >= _max THEN
    UPDATE public.omni_fusion_sessions SET status = 'finished', finished_at = now() WHERE id = _t.session_id AND status = 'open';
  END IF;
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (_t.owner_id, 'fusion_turn_' || _status, 'omni_fusion_turn', _turn_id::text);
  RETURN jsonb_build_object('ok', true, 'guard_released', _pause_status IS NULL AND _guard_rows = 1,
                            'paused', _pause_status IS NOT NULL, 'session_finished', _done >= _max);
END $$;

CREATE OR REPLACE FUNCTION public.omni_fusion_session_stop(_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_razul_owner();
  UPDATE public.omni_fusion_sessions SET status = 'stopped', finished_at = now()
  WHERE id = _session_id AND owner_id = auth.uid() AND status = 'open';
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (auth.uid(), 'fusion_session_stopped', 'omni_fusion_session', _session_id::text);
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.omni_fusion_session_delete(_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_razul_owner();
  IF EXISTS (SELECT 1 FROM public.omni_fusion_turns t WHERE t.session_id = _session_id AND t.status = 'running') THEN
    RAISE EXCEPTION 'A reply is still running; stop the session first' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.omni_fusion_sessions WHERE id = _session_id AND owner_id = auth.uid() AND status <> 'open';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stop the session before deleting it' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (auth.uid(), 'fusion_session_deleted', 'omni_fusion_session', _session_id::text);
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.omni_fusion_session_create(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_fusion_session_create(text, text, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.omni_fusion_turn_begin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_fusion_turn_begin(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.omni_fusion_turn_check(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_fusion_turn_check(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.omni_fusion_turn_finish(uuid, text, text, integer, integer, integer, integer, text, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_fusion_turn_finish(uuid, text, text, integer, integer, integer, integer, text, text, integer, text) TO service_role;
REVOKE ALL ON FUNCTION public.omni_fusion_session_stop(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_fusion_session_stop(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.omni_fusion_session_delete(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_fusion_session_delete(uuid) TO authenticated;