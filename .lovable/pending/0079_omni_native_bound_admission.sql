-- Native signature admission must use the key and revision actually verified.
-- This does not authorize later operations: they must recheck the same identity
-- in the transaction performing the operation.
CREATE FUNCTION public.omni_native_bound_touch(
  _device uuid, _fingerprint text, _revision integer, _nonce text,
  _timestamp_ms bigint, _event text, _capabilities text[], _app_version text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _d public.omni_dock_devices;
BEGIN
  IF _device IS NULL OR _fingerprint IS NULL OR _fingerprint !~ '^[0-9a-f]{64}$'
     OR _revision IS NULL OR _revision < 0
     OR _nonce IS NULL OR _nonce !~ '^[A-Za-z0-9_-]{16,64}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request');
  END IF;
  SELECT * INTO _d FROM public.omni_dock_devices WHERE id = _device FOR UPDATE;
  IF NOT FOUND OR _d.status IS DISTINCT FROM 'paired'
     OR _d.native_client_id IS DISTINCT FROM 'omni-native-cli'
     OR NOT public.omni_native_owner_ok(_d.owner_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_permitted');
  END IF;
  IF _timestamp_ms IS NULL OR abs(extract(epoch FROM clock_timestamp()) * 1000 - _timestamp_ms) > 60000 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'stale_request');
  END IF;
  IF _d.key_fingerprint IS DISTINCT FROM _fingerprint OR _d.revision IS DISTINCT FROM _revision THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'device_changed');
  END IF;
  DELETE FROM public.omni_native_status_nonces WHERE seen_at < now() - interval '15 minutes';
  BEGIN
    INSERT INTO public.omni_native_status_nonces (device_id, nonce) VALUES (_device, _nonce);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'replay');
  END;
  RETURN public.omni_dock_touch(_device, _nonce, _event, _capabilities, _app_version);
END $$;
REVOKE ALL ON FUNCTION public.omni_native_bound_touch(uuid,text,integer,text,bigint,text,text[],text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_native_bound_touch(uuid,text,integer,text,bigint,text,text[],text)
  TO service_role;

-- The calling operation must first lock the Stop row when it uses one.
CREATE FUNCTION public.omni_native_lock_verified_device(
  _device uuid, _fingerprint text, _revision integer, _permission text
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _d public.omni_dock_devices;
BEGIN
  SELECT * INTO _d FROM public.omni_dock_devices WHERE id = _device FOR UPDATE;
  RETURN FOUND AND _d.status = 'paired'
    AND _d.native_client_id = 'omni-native-cli'
    AND _d.key_fingerprint IS NOT DISTINCT FROM _fingerprint
    AND _d.revision IS NOT DISTINCT FROM _revision
    AND _permission = ANY(_d.permissions)
    AND public.omni_native_owner_ok(_d.owner_id);
END $$;
REVOKE ALL ON FUNCTION public.omni_native_lock_verified_device(uuid,text,integer,text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.omni_native_bound_chat_projects(
  _device uuid, _fingerprint text, _revision integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _stop boolean;
BEGIN
  SELECT emergency_stop INTO _stop FROM public.omni_terminal_controls WHERE id = 1 FOR SHARE;
  IF _stop IS DISTINCT FROM false THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'emergency_stop_engaged');
  END IF;
  IF public.omni_native_lock_verified_device(_device, _fingerprint, _revision, 'chat.send') IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'device_changed');
  END IF;
  RETURN public.omni_native_chat_projects(_device);
END $$;
REVOKE ALL ON FUNCTION public.omni_native_bound_chat_projects(uuid,text,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_native_bound_chat_projects(uuid,text,integer) TO service_role;

CREATE FUNCTION public.omni_native_bound_chat_begin(
  _device uuid, _fingerprint text, _revision integer, _request_id uuid, _session_id uuid,
  _project_id uuid, _agent_id text, _model text, _message_count integer, _input_chars integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _stop boolean;
BEGIN
  SELECT emergency_stop INTO _stop FROM public.omni_terminal_controls WHERE id = 1 FOR SHARE;
  IF _stop IS DISTINCT FROM false THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'emergency_stop_engaged');
  END IF;
  IF public.omni_native_lock_verified_device(_device, _fingerprint, _revision, 'chat.send') IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'device_changed');
  END IF;
  RETURN public.omni_native_chat_begin(
    _device, _request_id, _session_id, _project_id, _agent_id, _model, _message_count, _input_chars
  );
END $$;
REVOKE ALL ON FUNCTION public.omni_native_bound_chat_begin(uuid,text,integer,uuid,uuid,uuid,text,text,integer,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_native_bound_chat_begin(uuid,text,integer,uuid,uuid,uuid,text,text,integer,integer)
  TO service_role;

CREATE FUNCTION public.omni_native_bound_hold_task(
  _device uuid, _fingerprint text, _revision integer, _id uuid,
  _kind text, _agent text, _project text, _repository text, _instructions text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _stop boolean;
BEGIN
  SELECT emergency_stop INTO _stop FROM public.omni_terminal_controls WHERE id = 1 FOR SHARE;
  IF _stop IS DISTINCT FROM false THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'stop_engaged');
  END IF;
  IF public.omni_native_lock_verified_device(_device, _fingerprint, _revision, 'jobs.propose') IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'device_changed');
  END IF;
  RETURN public.omni_dock_hold_task(_device, _id, _kind, _agent, _project, _repository, _instructions);
END $$;
REVOKE ALL ON FUNCTION public.omni_native_bound_hold_task(uuid,text,integer,uuid,text,text,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_native_bound_hold_task(uuid,text,integer,uuid,text,text,text,text,text)
  TO service_role;

CREATE FUNCTION public.omni_native_bound_handoff_status(
  _device uuid, _fingerprint text, _revision integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _stop boolean;
BEGIN
  SELECT emergency_stop INTO _stop FROM public.omni_terminal_controls WHERE id = 1 FOR SHARE;
  IF _stop IS DISTINCT FROM false THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'stop_engaged');
  END IF;
  IF public.omni_native_lock_verified_device(_device, _fingerprint, _revision, 'status.read') IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'device_changed');
  END IF;
  RETURN jsonb_build_object('ok', true, 'jobs', public.omni_dock_handoff_status(_device));
END $$;
REVOKE ALL ON FUNCTION public.omni_native_bound_handoff_status(uuid,text,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_native_bound_handoff_status(uuid,text,integer) TO service_role;

CREATE FUNCTION public.omni_native_bound_engage_stop(
  _device uuid, _fingerprint text, _revision integer
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.omni_terminal_controls WHERE id = 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF public.omni_native_lock_verified_device(_device, _fingerprint, _revision, 'stop.engage') IS NOT TRUE THEN
    RETURN false;
  END IF;
  RETURN public.omni_dock_engage_stop(_device);
END $$;
REVOKE ALL ON FUNCTION public.omni_native_bound_engage_stop(uuid,text,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_native_bound_engage_stop(uuid,text,integer) TO service_role;

-- A multi-query snapshot is not released unless authorization is still current
-- after all of its component reads have completed.
CREATE FUNCTION public.omni_native_bound_read_authorize(
  _device uuid, _fingerprint text, _revision integer, _permission text
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _stop boolean;
BEGIN
  IF _permission NOT IN ('cloud.read', 'audit.read') THEN
    RETURN false;
  END IF;
  SELECT emergency_stop INTO _stop FROM public.omni_terminal_controls WHERE id = 1 FOR SHARE;
  IF _stop IS DISTINCT FROM false THEN
    RETURN false;
  END IF;
  RETURN public.omni_native_lock_verified_device(_device, _fingerprint, _revision, _permission) IS TRUE;
END $$;
REVOKE ALL ON FUNCTION public.omni_native_bound_read_authorize(uuid,text,integer,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_native_bound_read_authorize(uuid,text,integer,text) TO service_role;

-- A remote reduction, when needed, is sent only after this transaction commits.
CREATE FUNCTION public.omni_native_bound_control(
  _device uuid, _fingerprint text, _revision integer, _action text, _agent text, _job uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _agent_row public.omni_agents;
  _workspace_agent text;
  _workspace_session uuid;
  _code_agent text;
  _workspace_count integer := 0;
  _code_count integer := 0;
  _result jsonb;
BEGIN
  PERFORM 1 FROM public.omni_terminal_controls WHERE id = 1 FOR SHARE;
  IF public.omni_native_lock_verified_device(_device, _fingerprint, _revision, 'jobs.pause') IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'device_changed');
  END IF;
  IF _action = 'stop_job' AND _job IS NOT NULL AND _agent IS NULL THEN
    UPDATE public.omni_agent_jobs SET status = 'stopped', ended_at = now()
      WHERE id = _job AND status IN ('queued','running')
      RETURNING agent_id, session_id INTO _workspace_agent, _workspace_session;
    UPDATE public.omni_code_jobs SET status = 'stopped', ended_at = now(), lease_expires_at = NULL
      WHERE id = _job AND status IN ('queued','leased','running','awaiting_approval','retry_wait','paused')
      RETURNING agent_id INTO _code_agent;
    IF _workspace_agent IS NULL AND _code_agent IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
    END IF;
    _result := jsonb_build_object('ok', true, 'stopped', 1,
      'remote_action', CASE WHEN _workspace_agent IS NULL THEN NULL ELSE 'job.stop' END,
      'session_id', _workspace_session);
    INSERT INTO public.omni_workspace_audit(actor,event,agent_id,detail)
      VALUES ('device:' || left(_device::text,8), 'device_stop_job',
        COALESCE(_workspace_agent, _code_agent), jsonb_build_object('jobId',_job,'remote','admitted'));
  ELSIF _action IN ('pause_agent','stop_agent') AND _agent IS NOT NULL AND _job IS NULL THEN
    SELECT * INTO _agent_row FROM public.omni_agents WHERE id = _agent FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
    END IF;
    IF _action = 'pause_agent' THEN
      UPDATE public.omni_agents SET status = 'paused', updated_at = now()
        WHERE id = _agent AND status = 'enrolled';
      _result := jsonb_build_object('ok', true, 'paused', _agent);
      INSERT INTO public.omni_workspace_audit(actor,event,agent_id,detail)
        VALUES ('device:' || left(_device::text,8), 'device_pause_agent', _agent, '{}'::jsonb);
    ELSE
      UPDATE public.omni_agent_jobs SET status = 'stopped', ended_at = now()
        WHERE agent_id = _agent AND status IN ('queued','running');
      GET DIAGNOSTICS _workspace_count = ROW_COUNT;
      UPDATE public.omni_code_jobs SET status = 'stopped', ended_at = now(), lease_expires_at = NULL
        WHERE agent_id = _agent AND status IN ('queued','leased','running','awaiting_approval','retry_wait','paused');
      GET DIAGNOSTICS _code_count = ROW_COUNT;
      UPDATE public.omni_autonomy_windows SET ended_at = now(), end_reason = 'device_stop'
        WHERE agent_id = _agent AND ended_at IS NULL;
      _result := jsonb_build_object('ok', true, 'stopped', _workspace_count + _code_count,
        'remote_action', 'agent.stop');
      INSERT INTO public.omni_workspace_audit(actor,event,agent_id,detail)
        VALUES ('device:' || left(_device::text,8), 'device_stop_agent', _agent,
          jsonb_build_object('stopped',_workspace_count + _code_count,'remote','admitted'));
    END IF;
  ELSE
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request');
  END IF;
  INSERT INTO public.omni_dock_events(device_id,event,outcome,detail)
    VALUES (_device, 'control_' || _action, 'ok', 'Local reduction admitted');
  RETURN _result;
END $$;
REVOKE ALL ON FUNCTION public.omni_native_bound_control(uuid,text,integer,text,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_native_bound_control(uuid,text,integer,text,text,uuid) TO service_role;
