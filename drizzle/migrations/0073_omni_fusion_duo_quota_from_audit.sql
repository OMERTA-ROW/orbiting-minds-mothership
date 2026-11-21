-- Daily Fusion session/reply limits count the append-only control audit, not deletable session rows,
-- so deleting a session can never free quota for more paid replies.
CREATE INDEX IF NOT EXISTS razul_control_audit_fusion_duo_idx
  ON public.razul_control_audit (actor_id, occurred_at)
  WHERE action IN ('fusion_session_approved', 'fusion_turn_start');

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
  IF (SELECT count(*) FROM public.razul_control_audit a
      WHERE a.actor_id = auth.uid() AND a.action = 'fusion_session_approved'
        AND a.occurred_at > now() - interval '24 hours') >= 5 THEN
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