-- Authorize a settled native reply and finish its run in one transaction.
-- Match completion's Stop -> device -> session -> run order during reservation.
CREATE OR REPLACE FUNCTION public.claude_reserve_native_chat(
  _run_id uuid, _input_chars integer, _max_output_tokens integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _stop boolean;
  _initial public.omni_native_chat_runs;
  _r public.omni_native_chat_runs;
  _s public.omni_native_chat_sessions;
  _d public.omni_dock_devices;
BEGIN
  SELECT * INTO _initial FROM public.omni_native_chat_runs WHERE id = _run_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'run_not_running'); END IF;
  SELECT emergency_stop INTO _stop FROM public.omni_terminal_controls WHERE id = 1 FOR SHARE;
  IF _stop IS DISTINCT FROM false THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'emergency_stop_engaged');
  END IF;
  SELECT * INTO _d FROM public.omni_dock_devices WHERE id = _initial.device_id FOR UPDATE;
  IF NOT FOUND OR _d.owner_id IS DISTINCT FROM _initial.owner_id
     OR _d.status IS DISTINCT FROM 'paired'
     OR _d.revision IS DISTINCT FROM _initial.device_revision
     OR _d.native_client_id IS DISTINCT FROM 'omni-native-cli'
     OR NOT ('chat.send' = ANY (_d.permissions)) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'device_revoked');
  END IF;
  SELECT * INTO _s FROM public.omni_native_chat_sessions WHERE id = _initial.session_id FOR SHARE;
  IF NOT FOUND OR _s.status IS DISTINCT FROM 'open'
     OR _s.device_revision IS DISTINCT FROM _initial.device_revision
     OR _s.device_id IS DISTINCT FROM _initial.device_id
     OR _s.owner_id IS DISTINCT FROM _initial.owner_id
     OR _s.project_id IS DISTINCT FROM _initial.project_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'session_stopped');
  END IF;
  SELECT * INTO _r FROM public.omni_native_chat_runs WHERE id = _run_id FOR UPDATE;
  IF NOT FOUND OR _r.status IS DISTINCT FROM 'running'
     OR _r.device_id IS DISTINCT FROM _initial.device_id
     OR _r.device_revision IS DISTINCT FROM _initial.device_revision
     OR _r.owner_id IS DISTINCT FROM _initial.owner_id
     OR _r.session_id IS DISTINCT FROM _initial.session_id
     OR _r.project_id IS DISTINCT FROM _initial.project_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'run_not_running');
  END IF;
  RETURN public.claude_reserve_core(
    'native', _run_id, _r.owner_id, _r.agent_id, _r.model, _input_chars, _max_output_tokens
  );
END $$;

CREATE FUNCTION public.omni_native_chat_finish_authorized(
  _run_id uuid, _status text, _reply_chars integer, _input_tokens integer,
  _output_tokens integer, _error_status integer, _error_reason text,
  _release_guard boolean, _pause_status integer, _pause_message text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _initial public.omni_native_chat_runs;
  _current public.omni_native_chat_runs;
  _d public.omni_dock_devices;
  _s public.omni_native_chat_sessions;
  _stop boolean;
  _reason text;
  _result jsonb;
BEGIN
  IF _status <> 'completed' OR _status IS NULL THEN
    RETURN public.omni_native_chat_finish(
      _run_id, _status, _reply_chars, _input_tokens, _output_tokens, _error_status,
      _error_reason, _release_guard, _pause_status, _pause_message
    );
  END IF;
  SELECT * INTO _initial FROM public.omni_native_chat_runs WHERE id = _run_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'run_not_running');
  END IF;
  SELECT emergency_stop INTO _stop FROM public.omni_terminal_controls WHERE id = 1 FOR SHARE;
  IF _stop IS DISTINCT FROM false THEN _reason := 'emergency_stop_engaged'; END IF;
  SELECT * INTO _d FROM public.omni_dock_devices WHERE id = _initial.device_id FOR UPDATE;
  IF NOT FOUND OR _d.status IS DISTINCT FROM 'paired'
     OR _d.owner_id IS DISTINCT FROM _initial.owner_id
     OR _d.native_client_id IS DISTINCT FROM 'omni-native-cli'
     OR NOT ('chat.send' = ANY (_d.permissions)) THEN
    _reason := COALESCE(_reason, 'device_revoked');
  ELSIF _d.revision IS DISTINCT FROM _initial.device_revision THEN
    _reason := COALESCE(_reason, 'device_rotated');
  END IF;
  PERFORM 1 FROM auth.users WHERE id = _initial.owner_id AND email_confirmed_at IS NOT NULL FOR SHARE;
  IF NOT FOUND THEN _reason := COALESCE(_reason, 'owner_unverified'); END IF;
  PERFORM 1 FROM public.user_roles WHERE user_id = _initial.owner_id AND role = 'owner' FOR SHARE;
  IF NOT FOUND THEN _reason := COALESCE(_reason, 'owner_unverified'); END IF;
  PERFORM 1 FROM public.beta_access WHERE user_id = _initial.owner_id AND ai_approved AND NOT paused FOR SHARE;
  IF NOT FOUND THEN _reason := COALESCE(_reason, 'ai_not_approved'); END IF;
  PERFORM 1 FROM public.beta_projects WHERE id = _initial.project_id AND owner_id = _initial.owner_id FOR SHARE;
  IF NOT FOUND THEN _reason := COALESCE(_reason, 'project_not_found'); END IF;
  SELECT * INTO _s FROM public.omni_native_chat_sessions WHERE id = _initial.session_id FOR SHARE;
  IF NOT FOUND OR _s.status IS DISTINCT FROM 'open'
     OR _s.owner_id IS DISTINCT FROM _initial.owner_id
     OR _s.device_id IS DISTINCT FROM _initial.device_id
     OR _s.device_revision IS DISTINCT FROM _initial.device_revision
     OR _s.project_id IS DISTINCT FROM _initial.project_id THEN
    _reason := COALESCE(_reason, 'session_stopped');
  END IF;
  SELECT * INTO _current FROM public.omni_native_chat_runs WHERE id = _run_id FOR UPDATE;
  IF NOT FOUND OR _current.status IS DISTINCT FROM 'running'
     OR _current.device_id IS DISTINCT FROM _initial.device_id
     OR _current.device_revision IS DISTINCT FROM _initial.device_revision
     OR _current.owner_id IS DISTINCT FROM _initial.owner_id
     OR _current.session_id IS DISTINCT FROM _initial.session_id
     OR _current.project_id IS DISTINCT FROM _initial.project_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'run_not_running');
  END IF;
  IF _release_guard IS DISTINCT FROM true THEN
    _reason := COALESCE(_reason, 'settlement_unresolved');
  END IF;
  IF _reason IS NOT NULL THEN
    _result := public.omni_native_chat_finish(
      _run_id, 'denied', 0, _input_tokens, _output_tokens,
      CASE WHEN _reason = 'emergency_stop_engaged' THEN 423 ELSE 409 END,
      _reason, _release_guard, _pause_status, _pause_message
    );
    RETURN _result || jsonb_build_object('final_status', 'denied', 'authorization_reason', _reason);
  END IF;
  _result := public.omni_native_chat_finish(
    _run_id, _status, _reply_chars, _input_tokens, _output_tokens, _error_status,
    _error_reason, _release_guard, _pause_status, _pause_message
  );
  RETURN _result || jsonb_build_object('final_status', 'completed');
END $$;
REVOKE ALL ON FUNCTION public.omni_native_chat_finish_authorized(uuid,text,integer,integer,integer,integer,text,boolean,integer,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_native_chat_finish_authorized(uuid,text,integer,integer,integer,integer,text,boolean,integer,text)
  TO service_role;
