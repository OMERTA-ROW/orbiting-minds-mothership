-- 0075 (pending owner approval): Claude engine for the private OMNI text agent and Dread/Draco Fusion sessions.
-- Additive only. Each Claude call first passes that path's existing checks, then a service-only reservation
-- (Stop row FOR SHARE -> run or turn row FOR UPDATE -> session row FOR SHARE -> per-owner Claude ledger lock)
-- against the shared 50-cent per-call and 500-cent per-24-hour caps, and settles exactly once. Nothing here runs
-- code, starts or hands off tasks, issues permits or changes the Emergency Stop. Ledger rows hold no text.

ALTER TABLE public.claude_usage ADD COLUMN source text NOT NULL DEFAULT 'chat';
ALTER TABLE public.claude_usage ADD CONSTRAINT claude_usage_source_check CHECK (source IN ('chat', 'agent', 'fusion'));
COMMENT ON COLUMN public.claude_usage.source IS
  'Where the Claude call ran: chat (delegated OMNI chat), agent (private OMNI text agent), fusion (Dread/Draco session reply). run_id stays globally unique.';

ALTER TABLE public.omni_agent_runs ADD CONSTRAINT omni_agent_runs_model_check
  CHECK (model IN ('openai/gpt-6-astra', 'claude-sonnet-5-5', 'claude-opus-5-5'));

ALTER TABLE public.omni_fusion_sessions
  ADD COLUMN dread_engine text NOT NULL DEFAULT 'openai/gpt-6-astra',
  ADD COLUMN draco_engine text NOT NULL DEFAULT 'openai/gpt-6-astra';
ALTER TABLE public.omni_fusion_sessions ADD CONSTRAINT omni_fusion_sessions_engines_check
  CHECK (dread_engine IN ('openai/gpt-6-astra', 'claude-sonnet-5-5', 'claude-opus-5-5')
     AND draco_engine IN ('openai/gpt-6-astra', 'claude-sonnet-5-5', 'claude-opus-5-5'));
ALTER TABLE public.omni_fusion_turns ADD COLUMN model text NOT NULL DEFAULT 'openai/gpt-6-astra';
ALTER TABLE public.omni_fusion_turns ADD CONSTRAINT omni_fusion_turns_model_check
  CHECK (model IN ('openai/gpt-6-astra', 'claude-sonnet-5-5', 'claude-opus-5-5'));

-- Approval binds each agent's engine for the whole session. Claude needs the owner's switch for that agent and
-- model plus prices confirmed within 30 days at approval time (and again at every reply). All other checks,
-- limits and the audit row come from the existing 3-argument function, in the same transaction.
CREATE OR REPLACE FUNCTION public.omni_fusion_session_create(
  _topic text, _first_agent text, _max_replies integer, _dread_engine text, _draco_engine text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _id uuid;
  _a text;
  _e text;
BEGIN
  PERFORM public.assert_razul_owner();
  PERFORM public.assert_fresh_mfa(900);
  IF COALESCE(_dread_engine, '') NOT IN ('openai/gpt-6-astra', 'claude-sonnet-5-5', 'claude-opus-5-5')
     OR COALESCE(_draco_engine, '') NOT IN ('openai/gpt-6-astra', 'claude-sonnet-5-5', 'claude-opus-5-5') THEN
    RAISE EXCEPTION 'Choose an engine for each agent' USING ERRCODE = '22023';
  END IF;
  FOR _a, _e IN SELECT v.a, v.e FROM (VALUES ('dread', _dread_engine), ('draco', _draco_engine)) AS v(a, e) LOOP
    IF _e <> 'openai/gpt-6-astra' THEN
      IF NOT EXISTS (SELECT 1 FROM public.claude_engine_settings s
                     WHERE s.owner_id = auth.uid() AND s.agent_id = _a AND s.model = _e AND s.enabled) THEN
        RAISE EXCEPTION 'Turn that Claude model on for this agent in the Claude tab first' USING ERRCODE = '22023';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.claude_prices p
                     WHERE p.model = _e AND p.confirmed_at >= now() - interval '30 days') THEN
        RAISE EXCEPTION 'Confirm Claude prices (within the last 30 days) first' USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;
  _id := public.omni_fusion_session_create(_topic, _first_agent, _max_replies);
  UPDATE public.omni_fusion_sessions SET dread_engine = _dread_engine, draco_engine = _draco_engine WHERE id = _id;
  IF _dread_engine <> 'openai/gpt-6-astra' OR _draco_engine <> 'openai/gpt-6-astra' THEN
    INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
    VALUES (auth.uid(), 'fusion_session_claude_bound', 'omni_fusion_session', _id::text);
  END IF;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.omni_fusion_session_create(text, text, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_fusion_session_create(text, text, integer, text, text) TO authenticated;

-- Same as 0073, plus: each turn records the engine bound for its speaker, and the reply says which one.
CREATE OR REPLACE FUNCTION public.omni_fusion_turn_begin(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _s public.omni_fusion_sessions;
  _done integer;
  _attempts integer;
  _turn uuid := gen_random_uuid();
  _agent text;
  _model text;
  _guarded integer;
BEGIN
  PERFORM public.assert_razul_owner();
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
  IF (SELECT count(*) FROM public.razul_control_audit a
      WHERE a.actor_id = auth.uid() AND a.action = 'fusion_turn_start'
        AND a.occurred_at > now() - interval '24 hours') >= 20 THEN
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
  _model := CASE WHEN _agent = 'dread' THEN _s.dread_engine ELSE _s.draco_engine END;
  INSERT INTO public.omni_fusion_turns (id, session_id, owner_id, turn_no, agent_id, model)
  VALUES (_turn, _s.id, auth.uid(), _done + 1, _agent, _model);
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (auth.uid(), 'fusion_turn_start', 'omni_fusion_turn', _turn::text);
  RETURN jsonb_build_object(
    'ok', true, 'turn_id', _turn, 'turn_no', _done + 1, 'max_replies', _s.max_replies, 'agent_id', _agent,
    'model', _model, 'topic', _s.topic,
    'transcript', COALESCE((SELECT jsonb_agg(jsonb_build_object('agent_id', t.agent_id, 'reply', t.reply) ORDER BY t.turn_no)
                            FROM public.omni_fusion_turns t WHERE t.session_id = _s.id AND t.status = 'completed'), '[]'::jsonb));
END $$;

-- Internal: the shared cap math. Callers hold the Stop row and their run/turn row locks first.
CREATE OR REPLACE FUNCTION public.claude_reserve_core(
  _source text, _run_id uuid, _owner uuid, _agent text, _model text, _input_chars integer, _max_output_tokens integer
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _p public.claude_prices;
  _est integer;
  _day integer;
BEGIN
  IF _source NOT IN ('agent', 'fusion') OR _model NOT IN ('claude-sonnet-5-5', 'claude-opus-5-5')
     OR _input_chars IS NULL OR _input_chars NOT BETWEEN 1 AND 200000
     OR _max_output_tokens IS NULL OR _max_output_tokens NOT BETWEEN 1 AND 4000 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request');
  END IF;
  IF NOT COALESCE(public.has_role(_owner, 'owner'), false)
     OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _owner AND u.email_confirmed_at IS NOT NULL) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'owner_unverified');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.beta_access a WHERE a.user_id = _owner AND a.ai_approved AND NOT a.paused) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ai_not_approved');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.claude_engine_settings s
                 WHERE s.owner_id = _owner AND s.agent_id = _agent AND s.model = _model AND s.enabled) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'engine_not_enabled');
  END IF;
  SELECT * INTO _p FROM public.claude_prices WHERE model = _model;
  IF NOT FOUND OR _p.confirmed_at < now() - interval '30 days' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'price_not_confirmed');
  END IF;
  _est := public.claude_estimate_cents(ceil(_input_chars / 3.0)::integer + 200, _max_output_tokens,
                                       _p.in_cents_per_mtok, _p.out_cents_per_mtok);
  IF _est < 1 THEN _est := 1; END IF;
  IF _est > 50 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'call_cap', 'estimate_cents', _est);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('claude_ledger:' || _owner::text));
  SELECT coalesce(sum(CASE WHEN status = 'reserved' THEN estimate_cents ELSE coalesce(actual_cents, estimate_cents) END), 0)
    INTO _day FROM public.claude_usage
    WHERE owner_id = _owner AND reserved_at > now() - interval '24 hours';
  IF _day + _est > 500 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'daily_cap', 'estimate_cents', _est);
  END IF;
  IF EXISTS (SELECT 1 FROM public.claude_usage WHERE run_id = _run_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_reserved');
  END IF;
  INSERT INTO public.claude_usage (owner_id, run_id, agent_id, model, estimate_cents, source)
  VALUES (_owner, _run_id, _agent, _model, _est, _source);
  RETURN jsonb_build_object('ok', true, 'estimate_cents', _est);
END $$;
REVOKE ALL ON FUNCTION public.claude_reserve_core(text, uuid, uuid, text, text, integer, integer)
  FROM PUBLIC, anon, authenticated, service_role;

-- Private OMNI text agent: the owner's own running run, on the OMNI agent's Claude switch.
CREATE OR REPLACE FUNCTION public.claude_reserve_agent_run(_run_id uuid, _model text, _input_chars integer, _max_output_tokens integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _stop boolean;
  _r public.omni_agent_runs;
  _res jsonb;
BEGIN
  SELECT emergency_stop INTO _stop FROM public.omni_terminal_controls WHERE id = 1 FOR SHARE;
  IF _stop IS DISTINCT FROM false THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'emergency_stop_engaged');
  END IF;
  SELECT * INTO _r FROM public.omni_agent_runs WHERE id = _run_id FOR UPDATE;
  IF NOT FOUND OR _model IS NULL OR _model NOT IN ('claude-sonnet-5-5', 'claude-opus-5-5') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request');
  END IF;
  IF _r.status <> 'running' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'run_not_running');
  END IF;
  IF _r.model <> 'openai/gpt-6-astra' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_reserved');
  END IF;
  _res := public.claude_reserve_core('agent', _run_id, _r.owner_id, 'omni', _model, _input_chars, _max_output_tokens);
  IF (_res->>'ok')::boolean IS TRUE THEN
    UPDATE public.omni_agent_runs SET model = _model WHERE id = _run_id;
  END IF;
  RETURN _res;
END $$;
REVOKE ALL ON FUNCTION public.claude_reserve_agent_run(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claude_reserve_agent_run(uuid, text, integer, integer) TO service_role;

-- Fusion: a running turn of an open session, on the engine bound at approval for that speaker.
CREATE OR REPLACE FUNCTION public.claude_reserve_fusion_turn(_turn_id uuid, _input_chars integer, _max_output_tokens integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _stop boolean;
  _t public.omni_fusion_turns;
  _status text;
BEGIN
  SELECT emergency_stop INTO _stop FROM public.omni_terminal_controls WHERE id = 1 FOR SHARE;
  IF _stop IS DISTINCT FROM false THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'emergency_stop_engaged');
  END IF;
  SELECT * INTO _t FROM public.omni_fusion_turns WHERE id = _turn_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'turn_not_found'); END IF;
  IF _t.status <> 'running' THEN RETURN jsonb_build_object('ok', false, 'reason', 'turn_finished'); END IF;
  IF _t.model NOT IN ('claude-sonnet-5-5', 'claude-opus-5-5') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request');
  END IF;
  SELECT s.status INTO _status FROM public.omni_fusion_sessions s WHERE s.id = _t.session_id FOR SHARE;
  IF _status IS DISTINCT FROM 'open' THEN RETURN jsonb_build_object('ok', false, 'reason', 'session_stopped'); END IF;
  RETURN public.claude_reserve_core('fusion', _turn_id, _t.owner_id, _t.agent_id, _t.model, _input_chars, _max_output_tokens);
END $$;
REVOKE ALL ON FUNCTION public.claude_reserve_fusion_turn(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claude_reserve_fusion_turn(uuid, integer, integer) TO service_role;

-- Settle an agent or Fusion reservation once (chat keeps claude_settle). Unknown usage keeps the estimate.
CREATE OR REPLACE FUNCTION public.claude_settle_source(_source text, _run_id uuid, _status text, _input_tokens integer, _output_tokens integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _u public.claude_usage;
  _p public.claude_prices;
  _actual integer;
BEGIN
  IF _source IS NULL OR _source NOT IN ('agent', 'fusion') OR _status IS NULL OR _status NOT IN ('completed', 'failed', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request');
  END IF;
  SELECT * INTO _u FROM public.claude_usage WHERE run_id = _run_id AND source = _source FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_reserved'); END IF;
  IF _u.status <> 'reserved' THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_settled'); END IF;
  SELECT * INTO _p FROM public.claude_prices WHERE model = _u.model;
  IF _input_tokens IS NULL OR _output_tokens IS NULL OR _input_tokens < 0 OR _output_tokens < 0 OR NOT FOUND THEN
    _actual := _u.estimate_cents;
  ELSE
    _actual := public.claude_estimate_cents(_input_tokens, _output_tokens, _p.in_cents_per_mtok, _p.out_cents_per_mtok);
  END IF;
  UPDATE public.claude_usage SET status = _status, actual_cents = _actual,
    input_tokens = _input_tokens, output_tokens = _output_tokens, settled_at = now()
  WHERE id = _u.id;
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (_u.owner_id, 'claude_settle_' || _source || '_' || _status, 'claude_usage', _run_id::text);
  RETURN jsonb_build_object('ok', true, 'actual_cents', _actual);
END $$;
REVOKE ALL ON FUNCTION public.claude_settle_source(text, uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claude_settle_source(text, uuid, text, integer, integer) TO service_role;
