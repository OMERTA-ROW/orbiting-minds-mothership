-- Held-task reads require separate, explicit owner consent; metadata keys remain read-only.
ALTER TABLE public.omni_delegations DROP CONSTRAINT omni_delegations_scopes_check;
ALTER TABLE public.omni_delegations
  ADD CONSTRAINT omni_delegations_scopes_check CHECK (cardinality(scopes) BETWEEN 1 AND 3);

CREATE OR REPLACE FUNCTION public.omni_delegation_authorize(
  _client_id text, _audience text, _redirect_uri text, _scopes text[], _code_hash text, _code_challenge text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _id uuid;
  _exp timestamptz := now() + interval '60 seconds';
  _clean text[];
BEGIN
  PERFORM public.assert_razul_owner();
  PERFORM public.assert_fresh_mfa(900);
  IF _client_id IS DISTINCT FROM 'omni-web' OR _audience IS DISTINCT FROM 'omni-mothership'
     OR _redirect_uri IS DISTINCT FROM 'https://omni-orbit-command-companion.lovable.app/mothership/callback' THEN
    RAISE EXCEPTION 'Unknown client or callback' USING ERRCODE = '22023';
  END IF;
  IF _code_hash IS NULL OR _code_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Code hash must be a 64-char hex string' USING ERRCODE = '22023';
  END IF;
  IF _code_challenge IS NULL OR _code_challenge !~ '^[A-Za-z0-9_-]{43}$' THEN
    RAISE EXCEPTION 'Code challenge must be an S256 challenge' USING ERRCODE = '22023';
  END IF;
  IF _scopes IS NULL OR cardinality(_scopes) < 1 OR EXISTS (
    SELECT 1 FROM unnest(_scopes) s WHERE s IS NULL
      OR s NOT IN ('tasks:read', 'tasks:write', 'safety:emergency-stop')
  ) THEN
    RAISE EXCEPTION 'Only supported scopes can be granted' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(DISTINCT s ORDER BY s) INTO _clean FROM unnest(_scopes) s;
  IF cardinality(_clean) <> cardinality(_scopes) THEN
    RAISE EXCEPTION 'Duplicate scope' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.omni_delegation_codes
      WHERE owner_id = auth.uid() AND created_at > now() - interval '10 minutes') >= 10 THEN
    RAISE EXCEPTION 'Too many OMNI sign-in approvals; wait 10 minutes' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.omni_delegation_codes
    (owner_id, client_id, audience, redirect_uri, scopes, code_hash, code_challenge, created_at, expires_at)
  VALUES (auth.uid(), _client_id, _audience, _redirect_uri, _clean, _code_hash, _code_challenge, now(), _exp)
  RETURNING id INTO _id;
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (auth.uid(), 'delegation_consent', 'omni_delegation', _id::text);
  RETURN jsonb_build_object('code_id', _id, 'expires_at', _exp, 'scopes', to_jsonb(_clean));
END $$;

CREATE OR REPLACE FUNCTION public.omni_delegation_read_tasks(
  _token_hash text, _audience text, _task_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _v jsonb;
  _owner uuid;
  _tasks jsonb;
BEGIN
  _v := public.omni_delegation_use(_token_hash, _audience, 'tasks:read');
  IF _v->>'status' <> 'valid' THEN
    RETURN jsonb_build_object('ok', false, 'reason', _v->>'status');
  END IF;
  _owner := (_v->>'owner_id')::uuid;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', t.id, 'title', t.project_label, 'instruction', t.instructions,
    'agentId', t.agent, 'repository', t.repository, 'status', t.state,
    'createdAt', t.created_at, 'cancelledAt', t.cancelled_at,
    'handoff', CASE WHEN h.task_id IS NULL THEN NULL ELSE jsonb_build_object(
      'status', h.status, 'jobId', h.jackboy_job_id, 'updatedAt', h.updated_at,
      'lastCheckedAt', h.last_checked_at
    ) END
  ) ORDER BY t.created_at DESC, t.id DESC), '[]'::jsonb)
  INTO _tasks
  FROM (
    SELECT * FROM public.omni_terminal_tasks
    WHERE created_by = _owner AND source_delegation IS NOT NULL
      AND (_task_id IS NULL OR id = _task_id)
    ORDER BY created_at DESC, id DESC LIMIT 50
  ) t
  LEFT JOIN public.omni_task_handoffs h ON h.task_id = t.id AND h.created_by = _owner;
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (_owner, 'delegated_tasks_read', 'omni_terminal', COALESCE(_task_id::text, 'list'));
  RETURN jsonb_build_object('ok', true, 'tasks', _tasks);
END $$;
REVOKE ALL ON FUNCTION public.omni_delegation_read_tasks(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_delegation_read_tasks(text, text, uuid) TO service_role;
