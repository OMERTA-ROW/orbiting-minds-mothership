-- 0066 (PROPOSED, not applied): OMNI web chat through a separately consented "chat:write"
-- owner delegation. Additive. Grants nothing by itself: the owner must tick "chat:write" on
-- /omni-authorize (owner + aal2 + fresh authenticator code) for each new connection.
-- Every delegated chat request, in one transaction with its checks: valid delegation with
-- chat:write, verified owner, owner AI approval (beta_access, not paused), Emergency Stop
-- released, at most 30 started requests per owner per 24 hours, and the same durable
-- "evolution-omni" provider guard the private OMNI text agent uses (one request at a time;
-- a lost outcome keeps AI paused for owner review). Only metadata is stored: no message
-- or reply text. Metadata API keys are unchanged and still cannot chat.
-- Independent of proposed 0067 (fusion:plan): both install the same consent function, which
-- offers each gated scope only while that change's marker function exists.

ALTER TABLE public.omni_delegations DROP CONSTRAINT omni_delegations_scopes_check;
ALTER TABLE public.omni_delegations
  ADD CONSTRAINT omni_delegations_scopes_check CHECK (cardinality(scopes) BETWEEN 1 AND 5);

-- Shared with 0066/0067: the same consent function body, so either install order gives the same
-- result. chat:write and fusion:plan are grantable only while their own install marker exists.
CREATE OR REPLACE FUNCTION public.omni_delegation_authorize(
  _client_id text, _audience text, _redirect_uri text, _scopes text[], _code_hash text, _code_challenge text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _id uuid;
  _exp timestamptz := now() + interval '60 seconds';
  _clean text[];
  _allowed text[] := ARRAY['tasks:read', 'tasks:write', 'safety:emergency-stop'];
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
  IF to_regprocedure('public.omni_delegated_chat_ready()') IS NOT NULL THEN
    _allowed := _allowed || 'chat:write'::text;
  END IF;
  IF to_regprocedure('public.omni_fusion_plan_ready()') IS NOT NULL THEN
    _allowed := _allowed || 'fusion:plan'::text;
  END IF;
  IF _scopes IS NULL OR cardinality(_scopes) < 1 OR EXISTS (
    SELECT 1 FROM unnest(_scopes) s WHERE s IS NULL OR NOT (s = ANY (_allowed))
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

CREATE TABLE public.omni_delegated_chat_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  delegation_id uuid NOT NULL REFERENCES public.omni_delegations (id),
  model text NOT NULL CHECK (model = 'openai/gpt-6-astra'),
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'cancelled', 'denied')),
  message_count integer NOT NULL CHECK (message_count BETWEEN 1 AND 20),
  input_chars integer NOT NULL CHECK (input_chars BETWEEN 1 AND 24000),
  reply_chars integer CHECK (reply_chars BETWEEN 0 AND 40000),
  input_tokens integer CHECK (input_tokens >= 0),
  output_tokens integer CHECK (output_tokens >= 0),
  total_tokens integer CHECK (total_tokens >= 0),
  error_status integer CHECK (error_status BETWEEN 100 AND 599),
  error_reason text CHECK (error_reason ~ '^[a-z_]{1,60}$'),
  gateway_run_id text CHECK (length(gateway_run_id) <= 200),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CHECK ((status = 'running') = (finished_at IS NULL))
);
CREATE INDEX omni_delegated_chat_runs_owner_idx ON public.omni_delegated_chat_runs (owner_id, started_at DESC);
-- The hosted database grants new public tables to every API role by default; keep only reads.
REVOKE ALL ON public.omni_delegated_chat_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.omni_delegated_chat_runs TO authenticated;
GRANT ALL ON public.omni_delegated_chat_runs TO service_role;
ALTER TABLE public.omni_delegated_chat_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own OMNI web chat runs" ON public.omni_delegated_chat_runs
  FOR SELECT TO authenticated USING (owner_id = auth.uid() AND public.is_razul_owner());
COMMENT ON TABLE public.omni_delegated_chat_runs IS
  'Metadata for OMNI web chat replies made through a chat:write owner delegation. No message or reply text is stored.';

-- Marker the server reads to know this change is installed (no data, no secret).
CREATE OR REPLACE FUNCTION public.omni_delegated_chat_ready()
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT true $$;
REVOKE ALL ON FUNCTION public.omni_delegated_chat_ready() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_delegated_chat_ready() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.omni_delegation_begin_chat(
  _token_hash text, _audience text, _model text, _message_count integer, _input_chars integer
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _v jsonb;
  _owner uuid;
  _run uuid := gen_random_uuid();
  _guarded integer;
BEGIN
  _v := public.omni_delegation_use(_token_hash, _audience, 'chat:write');
  IF _v->>'status' <> 'valid' THEN
    RETURN jsonb_build_object('ok', false, 'reason', _v->>'status');
  END IF;
  _owner := (_v->>'owner_id')::uuid;
  IF _model IS DISTINCT FROM 'openai/gpt-6-astra' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'model_not_available');
  END IF;
  IF _message_count IS NULL OR _message_count NOT BETWEEN 1 AND 20
     OR _input_chars IS NULL OR _input_chars NOT BETWEEN 1 AND 24000 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.beta_access a
                 WHERE a.user_id = _owner AND a.ai_approved AND NOT a.paused) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ai_not_approved');
  END IF;
  IF public.omni_stop_engaged() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'emergency_stop_engaged');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('omni_delegated_chat:' || _owner::text));
  IF (SELECT count(*) FROM public.omni_delegated_chat_runs
      WHERE owner_id = _owner AND started_at > now() - interval '24 hours') >= 30 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'daily_limit');
  END IF;
  INSERT INTO public.ai_gateway_state (feature, blocked_status, message)
  VALUES ('evolution-omni', 503,
          'OMNI request ' || _run::text || ' is in progress or its outcome needs owner review. No automatic restart.')
  ON CONFLICT (feature) DO NOTHING;
  GET DIAGNOSTICS _guarded = ROW_COUNT;
  IF _guarded <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ai_busy_or_paused');
  END IF;
  INSERT INTO public.omni_delegated_chat_runs (id, owner_id, delegation_id, model, message_count, input_chars)
  VALUES (_run, _owner, (_v->>'delegation_id')::uuid, _model, _message_count, _input_chars);
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (_owner, 'chat_start_delegated', 'omni_delegated_chat', _run::text);
  RETURN jsonb_build_object('ok', true, 'run_id', _run);
END $$;
REVOKE ALL ON FUNCTION public.omni_delegation_begin_chat(text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_delegation_begin_chat(text, text, text, integer, integer) TO service_role;

-- Request-bound re-check while a reply is generated: revocation, expiry, Stop or AI approval
-- changes stop the request. Not audited per poll.
CREATE OR REPLACE FUNCTION public.omni_delegation_check_chat(_token_hash text, _audience text, _run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _v jsonb;
  _r public.omni_delegated_chat_runs;
BEGIN
  _v := public.omni_delegation_use(_token_hash, _audience, 'chat:write');
  IF _v->>'status' <> 'valid' THEN
    RETURN jsonb_build_object('ok', false, 'reason', _v->>'status');
  END IF;
  SELECT * INTO _r FROM public.omni_delegated_chat_runs WHERE id = _run_id;
  IF NOT FOUND OR _r.delegation_id IS DISTINCT FROM (_v->>'delegation_id')::uuid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'run_not_found');
  END IF;
  IF _r.status <> 'running' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'run_finished');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.beta_access a
                 WHERE a.user_id = _r.owner_id AND a.ai_approved AND NOT a.paused) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ai_not_approved');
  END IF;
  IF public.omni_stop_engaged() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'emergency_stop_engaged');
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.omni_delegation_check_chat(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_delegation_check_chat(text, text, uuid) TO service_role;

-- Records the outcome and releases (or, for provider credit/permission refusals, keeps as a
-- pause) the run's own guard, in one transaction. A run that is no longer running is untouched.
CREATE OR REPLACE FUNCTION public.omni_delegation_finish_chat(
  _run_id uuid, _status text, _reply_chars integer, _input_tokens integer, _output_tokens integer,
  _total_tokens integer, _error_status integer, _error_reason text, _gateway_run_id text,
  _pause_status integer, _pause_message text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _r public.omni_delegated_chat_runs;
  _guard text := 'OMNI request ' || _run_id::text || ' is in progress or its outcome needs owner review. No automatic restart.';
  _guard_rows integer;
BEGIN
  IF _status IS NULL OR _status NOT IN ('completed', 'failed', 'cancelled', 'denied') THEN
    RAISE EXCEPTION 'Unknown chat outcome' USING ERRCODE = '22023';
  END IF;
  IF _pause_status IS NOT NULL AND (_pause_status NOT IN (402, 403, 404)
     OR _pause_message IS NULL OR length(_pause_message) NOT BETWEEN 1 AND 500) THEN
    RAISE EXCEPTION 'Invalid AI pause' USING ERRCODE = '22023';
  END IF;
  UPDATE public.omni_delegated_chat_runs SET
    status = _status,
    reply_chars = _reply_chars,
    input_tokens = _input_tokens,
    output_tokens = _output_tokens,
    total_tokens = _total_tokens,
    error_status = CASE WHEN _status = 'completed' THEN NULL ELSE _error_status END,
    error_reason = CASE WHEN _status = 'completed' THEN NULL ELSE _error_reason END,
    gateway_run_id = _gateway_run_id,
    finished_at = clock_timestamp()
  WHERE id = _run_id AND status = 'running'
  RETURNING * INTO _r;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'run_not_running');
  END IF;
  IF _pause_status IS NOT NULL THEN
    UPDATE public.ai_gateway_state SET blocked_status = _pause_status, message = _pause_message, blocked_at = now()
    WHERE feature = 'evolution-omni' AND message = _guard;
  ELSE
    DELETE FROM public.ai_gateway_state WHERE feature = 'evolution-omni' AND message = _guard;
  END IF;
  GET DIAGNOSTICS _guard_rows = ROW_COUNT;
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (_r.owner_id, 'chat_finish_delegated_' || _status, 'omni_delegated_chat', _run_id::text);
  RETURN jsonb_build_object('ok', true, 'guard_released', _pause_status IS NULL AND _guard_rows = 1,
                            'paused', _pause_status IS NOT NULL);
END $$;
REVOKE ALL ON FUNCTION public.omni_delegation_finish_chat(uuid, text, integer, integer, integer, integer, integer, text, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_delegation_finish_chat(uuid, text, integer, integer, integer, integer, integer, text, text, integer, text) TO service_role;
