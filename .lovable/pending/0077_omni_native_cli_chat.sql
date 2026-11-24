-- Migration 0077 (pending owner approval): native device-scoped, text-only Claude chat.
-- Native devices get chat.send only through the browser MFA/PKCE flow. This never grants
-- model tools, task execution, transcript storage or a bearer credential.

CREATE TABLE public.omni_native_chat_sessions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES auth.users(id),
  device_id uuid NOT NULL REFERENCES public.omni_dock_devices(id),
  device_revision integer NOT NULL CHECK (device_revision >= 0),
  project_id uuid NOT NULL,
  agent_id text NOT NULL CHECK (agent_id IN ('omni', 'dread', 'draco')),
  model text NOT NULL CHECK (model IN ('claude-sonnet-5-5', 'claude-opus-5-5')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, owner_id)
    REFERENCES public.beta_projects(id, owner_id) ON DELETE CASCADE,
  UNIQUE (id, device_id)
);
CREATE INDEX omni_native_chat_sessions_owner_idx
  ON public.omni_native_chat_sessions (owner_id, updated_at DESC);
REVOKE ALL ON public.omni_native_chat_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.omni_native_chat_sessions TO authenticated;
GRANT ALL ON public.omni_native_chat_sessions TO service_role;
ALTER TABLE public.omni_native_chat_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own native OMNI chat sessions" ON public.omni_native_chat_sessions
  FOR SELECT TO authenticated USING (owner_id = auth.uid() AND public.is_razul_owner());
COMMENT ON TABLE public.omni_native_chat_sessions IS
  'Native OMNI chat continuity metadata only. Conversation text stays on the client.';

CREATE TABLE public.omni_native_chat_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  session_id uuid NOT NULL REFERENCES public.omni_native_chat_sessions(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id),
  device_id uuid NOT NULL REFERENCES public.omni_dock_devices(id),
  device_revision integer NOT NULL CHECK (device_revision >= 0),
  project_id uuid NOT NULL REFERENCES public.beta_projects(id) ON DELETE CASCADE,
  agent_id text NOT NULL CHECK (agent_id IN ('omni', 'dread', 'draco')),
  model text NOT NULL CHECK (model IN ('claude-sonnet-5-5', 'claude-opus-5-5')),
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'cancelled', 'denied')),
  message_count integer NOT NULL CHECK (message_count BETWEEN 1 AND 20),
  input_chars integer NOT NULL CHECK (input_chars BETWEEN 1 AND 200000),
  reply_chars integer CHECK (reply_chars BETWEEN 0 AND 40000),
  input_tokens integer CHECK (input_tokens >= 0),
  output_tokens integer CHECK (output_tokens >= 0),
  error_status integer CHECK (error_status BETWEEN 100 AND 599),
  error_reason text CHECK (error_reason ~ '^[a-z_]{1,60}$'),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CHECK ((status = 'running') = (finished_at IS NULL)),
  UNIQUE (device_id, request_id)
);
CREATE INDEX omni_native_chat_runs_owner_idx
  ON public.omni_native_chat_runs (owner_id, started_at DESC);
REVOKE ALL ON public.omni_native_chat_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.omni_native_chat_runs TO authenticated;
GRANT ALL ON public.omni_native_chat_runs TO service_role;
ALTER TABLE public.omni_native_chat_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own native OMNI chat runs" ON public.omni_native_chat_runs
  FOR SELECT TO authenticated USING (owner_id = auth.uid() AND public.is_razul_owner());
COMMENT ON TABLE public.omni_native_chat_runs IS
  'Native OMNI chat run metadata only; prompt, transcript and reply text are never stored.';

ALTER TABLE public.claude_usage DROP CONSTRAINT claude_usage_source_check;
ALTER TABLE public.claude_usage ADD CONSTRAINT claude_usage_source_check
  CHECK (source IN ('chat', 'agent', 'fusion', 'native'));

-- chat.send is grantable only through native owner authorization, never legacy Dock pairing.
CREATE OR REPLACE FUNCTION public.omni_native_authorize(
  _client_id text, _audience text, _port integer, _code_hash text, _code_challenge text,
  _proof_nonce_hash text, _proof_timestamp_ms bigint, _public_key jsonb, _fingerprint text,
  _label text, _platform text, _permissions text[], _rotation_device uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _id uuid;
  _device public.omni_dock_devices;
  _redirect text;
  _selected text[];
  _expected_fingerprint text;
BEGIN
  PERFORM public.assert_razul_owner();
  PERFORM public.assert_fresh_mfa(900);
  IF _client_id IS DISTINCT FROM 'omni-native-cli'
     OR _audience IS DISTINCT FROM 'omni-mothership'
     OR _port IS NULL OR _port NOT BETWEEN 1024 AND 65535 THEN
    RAISE EXCEPTION 'Unknown native client or loopback callback' USING ERRCODE = '22023';
  END IF;
  _redirect := 'http://127.0.0.1:' || _port::text || '/callback';
  IF _code_hash IS NULL OR _code_hash !~ '^[0-9a-f]{64}$'
     OR _proof_nonce_hash IS NULL OR _proof_nonce_hash !~ '^[0-9a-f]{64}$'
     OR _code_challenge IS NULL OR _code_challenge !~ '^[A-Za-z0-9_-]{43}$'
     OR _proof_timestamp_ms IS NULL
     OR abs(extract(epoch FROM clock_timestamp()) * 1000 - _proof_timestamp_ms) > 300000 THEN
    RAISE EXCEPTION 'Native authorization proof is malformed or expired' USING ERRCODE = '22023';
  END IF;
  IF _public_key IS NULL OR jsonb_typeof(_public_key) <> 'object'
     OR (_public_key - ARRAY['kty', 'crv', 'x', 'y']) <> '{}'::jsonb
     OR _public_key->>'kty' IS DISTINCT FROM 'EC'
     OR _public_key->>'crv' IS DISTINCT FROM 'P-256'
     OR COALESCE(_public_key->>'x', '') !~ '^[A-Za-z0-9_-]{43}$'
     OR COALESCE(_public_key->>'y', '') !~ '^[A-Za-z0-9_-]{43}$' THEN
    RAISE EXCEPTION 'Native device requires a public P-256 key' USING ERRCODE = '22023';
  END IF;
  _expected_fingerprint := encode(sha256(convert_to(
    format('{"crv":"P-256","kty":"EC","x":"%s","y":"%s"}',
      _public_key->>'x', _public_key->>'y'), 'UTF8')), 'hex');
  IF _fingerprint IS DISTINCT FROM _expected_fingerprint THEN
    RAISE EXCEPTION 'Native device key fingerprint did not match' USING ERRCODE = '22023';
  END IF;
  IF _label IS NULL OR length(btrim(_label)) NOT BETWEEN 1 AND 60
     OR _label ~ '[[:cntrl:]]'
     OR _platform IS NULL OR _platform NOT IN ('macos', 'linux', 'windows') THEN
    RAISE EXCEPTION 'Native device details are invalid' USING ERRCODE = '22023';
  END IF;
  IF public.omni_terminal_secret_like(_label) THEN
    RAISE EXCEPTION 'Device label looks like a secret' USING ERRCODE = '22023';
  END IF;
  IF _rotation_device IS NULL THEN
    IF _permissions IS NULL OR cardinality(_permissions) < 1
       OR NOT public.omni_dock_valid_permissions(_permissions)
       OR NOT (_permissions <@ ARRAY[
         'status.read', 'jobs.propose', 'stop.engage', 'cloud.read', 'audit.read', 'jobs.pause',
         'chat.send'
       ]::text[]) THEN
      RAISE EXCEPTION 'Choose only implemented native device permissions' USING ERRCODE = '22023';
    END IF;
    SELECT array_agg(DISTINCT p ORDER BY p) INTO _selected FROM unnest(_permissions) p;
    IF cardinality(_selected) <> cardinality(_permissions) THEN
      RAISE EXCEPTION 'Duplicate native device permission' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF COALESCE(cardinality(_permissions), 0) <> 0 THEN
      RAISE EXCEPTION 'Key rotation cannot change device permissions' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO _device FROM public.omni_dock_devices
      WHERE id = _rotation_device AND owner_id = auth.uid()
        AND native_client_id = _client_id AND status = 'paired'
      FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Native device is not available for rotation' USING ERRCODE = '22023';
    END IF;
    IF _device.key_fingerprint = _fingerprint THEN
      RAISE EXCEPTION 'New device key must differ from the current key' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.omni_dock_devices
    WHERE key_fingerprint = _fingerprint AND status <> 'revoked'
      AND id IS DISTINCT FROM _rotation_device
  ) THEN
    RAISE EXCEPTION 'Native device key is already registered' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.omni_native_authorization_codes
      WHERE owner_id = auth.uid() AND created_at > now() - interval '10 minutes') >= 10 THEN
    RAISE EXCEPTION 'Too many native sign-in approvals; wait 10 minutes' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.omni_native_authorization_codes (
    owner_id, client_id, audience, redirect_uri, code_hash, code_challenge,
    proof_nonce_hash, public_key, key_fingerprint, label, platform, permissions,
    rotation_device_id, rotation_revision, expires_at
  ) VALUES (
    auth.uid(), _client_id, _audience, _redirect, _code_hash, _code_challenge,
    _proof_nonce_hash, _public_key, _fingerprint, btrim(_label), _platform,
    COALESCE(_selected, _device.permissions), _rotation_device,
    CASE WHEN _rotation_device IS NULL THEN NULL ELSE _device.revision END,
    now() + interval '60 seconds'
  ) RETURNING id INTO _id;
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (auth.uid(), 'native_device_authorize', 'omni_native', _id::text);
  RETURN jsonb_build_object('ok', true, 'authorization_id', _id, 'expires_in', 60);
END $$;
REVOKE ALL ON FUNCTION public.omni_native_authorize(text,text,integer,text,text,text,bigint,jsonb,text,text,text,text[],uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_native_authorize(text,text,integer,text,text,text,bigint,jsonb,text,text,text,text[],uuid) TO authenticated;

-- Extend only the shared Claude ledger source enum; reservation and settlement remain
-- service-only and retain the same owner switch, fresh price, 50-cent and 500-cent checks.
CREATE OR REPLACE FUNCTION public.claude_reserve_core(
  _source text, _run_id uuid, _owner uuid, _agent text, _model text,
  _input_chars integer, _max_output_tokens integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _p public.claude_prices;
  _est integer;
  _day integer;
BEGIN
  IF _source NOT IN ('agent', 'fusion', 'native')
     OR _model NOT IN ('claude-sonnet-5-5', 'claude-opus-5-5')
     OR _input_chars IS NULL OR _input_chars NOT BETWEEN 1 AND 200000
     OR _max_output_tokens IS NULL OR _max_output_tokens NOT BETWEEN 1 AND 4000 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request');
  END IF;
  IF NOT COALESCE(public.has_role(_owner, 'owner'), false)
     OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _owner AND u.email_confirmed_at IS NOT NULL) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'owner_unverified');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.beta_access a
                 WHERE a.user_id = _owner AND a.ai_approved AND NOT a.paused) THEN
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
REVOKE ALL ON FUNCTION public.claude_reserve_core(text,uuid,uuid,text,text,integer,integer)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.claude_settle_source(
  _source text, _run_id uuid, _status text, _input_tokens integer, _output_tokens integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _u public.claude_usage;
  _p public.claude_prices;
  _actual integer;
BEGIN
  IF _source IS NULL OR _source NOT IN ('agent', 'fusion', 'native')
     OR _status IS NULL OR _status NOT IN ('completed', 'failed', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request');
  END IF;
  SELECT * INTO _u FROM public.claude_usage WHERE run_id = _run_id AND source = _source FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_reserved'); END IF;
  IF _u.status <> 'reserved' THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_settled'); END IF;
  SELECT * INTO _p FROM public.claude_prices WHERE model = _u.model;
  IF _input_tokens IS NULL OR _output_tokens IS NULL OR _input_tokens < 0 OR _output_tokens < 0 OR NOT FOUND THEN
    _actual := _u.estimate_cents;
  ELSE
    _actual := public.claude_estimate_cents(
      _input_tokens, _output_tokens, _p.in_cents_per_mtok, _p.out_cents_per_mtok
    );
  END IF;
  UPDATE public.claude_usage SET status = _status, actual_cents = _actual,
    input_tokens = _input_tokens, output_tokens = _output_tokens, settled_at = now()
  WHERE id = _u.id;
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (_u.owner_id, 'claude_settle_' || _source || '_' || _status, 'claude_usage', _run_id::text);
  RETURN jsonb_build_object('ok', true, 'actual_cents', _actual);
END $$;
REVOKE ALL ON FUNCTION public.claude_settle_source(text,uuid,text,integer,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claude_settle_source(text,uuid,text,integer,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.omni_native_chat_ready()
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT to_regprocedure('public.omni_native_authorization_ready()') IS NOT NULL
     AND to_regprocedure('public.claude_reserve_core(text,uuid,uuid,text,text,integer,integer)') IS NOT NULL
     AND to_regprocedure('public.claude_settle_source(text,uuid,text,integer,integer)') IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.omni_native_chat_ready() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_native_chat_ready() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.omni_native_chat_projects(_device uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _d public.omni_dock_devices;
BEGIN
  SELECT * INTO _d FROM public.omni_dock_devices WHERE id = _device FOR SHARE;
  IF NOT FOUND OR _d.status <> 'paired' OR _d.native_client_id IS DISTINCT FROM 'omni-native-cli'
     OR NOT ('chat.send' = ANY (_d.permissions)) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_permitted');
  END IF;
  IF public.omni_stop_engaged() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'emergency_stop_engaged');
  END IF;
  IF NOT public.omni_native_owner_ok(_d.owner_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'owner_unverified');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.beta_access a
                 WHERE a.user_id = _d.owner_id AND a.ai_approved AND NOT a.paused) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ai_not_approved');
  END IF;
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (_d.owner_id, 'native_chat_projects', 'omni_dock', _d.id::text);
  RETURN jsonb_build_object('ok', true, 'projects', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) ORDER BY p.name)
    FROM public.beta_projects p WHERE p.owner_id = _d.owner_id
  ), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.omni_native_chat_projects(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_native_chat_projects(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.omni_native_chat_begin(
  _device uuid, _request_id uuid, _session_id uuid, _project_id uuid,
  _agent_id text, _model text, _message_count integer, _input_chars integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _stop boolean;
  _d public.omni_dock_devices;
  _s public.omni_native_chat_sessions;
  _p public.beta_projects;
  _run uuid := gen_random_uuid();
  _guarded integer;
  _new_session boolean := false;
BEGIN
  SELECT emergency_stop INTO _stop FROM public.omni_terminal_controls WHERE id = 1 FOR SHARE;
  IF _stop IS DISTINCT FROM false THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'emergency_stop_engaged');
  END IF;
  SELECT * INTO _d FROM public.omni_dock_devices WHERE id = _device FOR UPDATE;
  IF NOT FOUND OR _d.status <> 'paired' OR _d.native_client_id IS DISTINCT FROM 'omni-native-cli'
     OR NOT ('chat.send' = ANY (_d.permissions)) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_permitted');
  END IF;
  IF NOT public.omni_native_owner_ok(_d.owner_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'owner_unverified');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.beta_access a
                 WHERE a.user_id = _d.owner_id AND a.ai_approved AND NOT a.paused) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ai_not_approved');
  END IF;
  IF _request_id IS NULL OR _session_id IS NULL OR _project_id IS NULL
     OR _agent_id IS NULL OR _agent_id NOT IN ('omni', 'dread', 'draco')
     OR _model IS NULL OR _model NOT IN ('claude-sonnet-5-5', 'claude-opus-5-5')
     OR _message_count IS NULL OR _message_count NOT BETWEEN 1 AND 20
     OR _input_chars IS NULL OR _input_chars NOT BETWEEN 1 AND 200000 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request');
  END IF;
  IF EXISTS (SELECT 1 FROM public.omni_native_chat_runs
             WHERE device_id = _device AND request_id = _request_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'duplicate_request');
  END IF;
  SELECT * INTO _p FROM public.beta_projects
    WHERE id = _project_id AND owner_id = _d.owner_id FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'project_not_found');
  END IF;
  SELECT * INTO _s FROM public.omni_native_chat_sessions
    WHERE id = _session_id AND device_id = _device FOR UPDATE;
  IF NOT FOUND THEN
    _new_session := true;
  ELSIF _s.owner_id IS DISTINCT FROM _d.owner_id OR _s.device_revision IS DISTINCT FROM _d.revision
     OR _s.project_id IS DISTINCT FROM _project_id OR _s.agent_id IS DISTINCT FROM _agent_id
     OR _s.model IS DISTINCT FROM _model OR _s.status IS DISTINCT FROM 'open' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'session_mismatch');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('omni_native_chat:' || _d.owner_id::text));
  IF (SELECT count(*) FROM public.omni_native_chat_runs
      WHERE owner_id = _d.owner_id AND started_at > now() - interval '24 hours') >= 30 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'daily_limit');
  END IF;
  INSERT INTO public.ai_gateway_state (feature, blocked_status, message)
  VALUES ('evolution-omni', 503,
          'Native OMNI request ' || _run::text || ' is in progress or its outcome needs owner review. No automatic restart.')
  ON CONFLICT (feature) DO NOTHING;
  GET DIAGNOSTICS _guarded = ROW_COUNT;
  IF _guarded <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ai_busy_or_paused');
  END IF;
  IF _new_session THEN
    INSERT INTO public.omni_native_chat_sessions (
      id, owner_id, device_id, device_revision, project_id, agent_id, model
    ) VALUES (
      _session_id, _d.owner_id, _device, _d.revision, _project_id, _agent_id, _model
    );
  END IF;
  INSERT INTO public.omni_native_chat_runs (
    id, request_id, session_id, owner_id, device_id, device_revision, project_id,
    agent_id, model, message_count, input_chars
  ) VALUES (
    _run, _request_id, _session_id, _d.owner_id, _device, _d.revision, _project_id,
    _agent_id, _model, _message_count, _input_chars
  );
  UPDATE public.omni_native_chat_sessions SET updated_at = clock_timestamp()
    WHERE id = _session_id;
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (_d.owner_id, 'native_chat_start', 'omni_native_chat', _run::text);
  RETURN jsonb_build_object(
    'ok', true, 'run_id', _run, 'project_name', _p.name, 'project_brief', _p.brief
  );
END $$;
REVOKE ALL ON FUNCTION public.omni_native_chat_begin(uuid,uuid,uuid,uuid,text,text,integer,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_native_chat_begin(uuid,uuid,uuid,uuid,text,text,integer,integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.omni_native_chat_check(_device uuid, _run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _stop boolean;
  _d public.omni_dock_devices;
  _r public.omni_native_chat_runs;
  _s public.omni_native_chat_sessions;
BEGIN
  SELECT emergency_stop INTO _stop FROM public.omni_terminal_controls WHERE id = 1;
  IF _stop IS DISTINCT FROM false THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'emergency_stop_engaged');
  END IF;
  SELECT * INTO _d FROM public.omni_dock_devices WHERE id = _device;
  IF NOT FOUND OR _d.status IS DISTINCT FROM 'paired'
     OR _d.native_client_id IS DISTINCT FROM 'omni-native-cli'
     OR NOT ('chat.send' = ANY (_d.permissions)) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'device_revoked');
  END IF;
  IF NOT public.omni_native_owner_ok(_d.owner_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'owner_unverified');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.beta_access a
                 WHERE a.user_id = _d.owner_id AND a.ai_approved AND NOT a.paused) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ai_not_approved');
  END IF;
  SELECT * INTO _r FROM public.omni_native_chat_runs WHERE id = _run_id AND device_id = _device;
  IF NOT FOUND OR _r.status <> 'running' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'run_not_found');
  END IF;
  IF _r.device_revision IS DISTINCT FROM _d.revision THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'device_rotated');
  END IF;
  SELECT * INTO _s FROM public.omni_native_chat_sessions WHERE id = _r.session_id;
  IF NOT FOUND OR _s.status <> 'open' OR _s.device_revision IS DISTINCT FROM _d.revision
     OR _s.project_id IS DISTINCT FROM _r.project_id
     OR NOT EXISTS (SELECT 1 FROM public.beta_projects p
                    WHERE p.id = _r.project_id AND p.owner_id = _r.owner_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'session_stopped');
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.omni_native_chat_check(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_native_chat_check(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.claude_reserve_native_chat(
  _run_id uuid, _input_chars integer, _max_output_tokens integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _stop boolean;
  _r public.omni_native_chat_runs;
  _s public.omni_native_chat_sessions;
BEGIN
  SELECT emergency_stop INTO _stop FROM public.omni_terminal_controls WHERE id = 1 FOR SHARE;
  IF _stop IS DISTINCT FROM false THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'emergency_stop_engaged');
  END IF;
  SELECT * INTO _r FROM public.omni_native_chat_runs WHERE id = _run_id FOR UPDATE;
  IF NOT FOUND OR _r.status <> 'running' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'run_not_running');
  END IF;
  SELECT * INTO _s FROM public.omni_native_chat_sessions WHERE id = _r.session_id FOR SHARE;
  IF NOT FOUND OR _s.status <> 'open' OR _s.device_revision IS DISTINCT FROM _r.device_revision THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'session_stopped');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.omni_dock_devices d
                 WHERE d.id = _r.device_id AND d.owner_id = _r.owner_id
                   AND d.status = 'paired' AND d.revision = _r.device_revision
                   AND d.native_client_id = 'omni-native-cli' AND 'chat.send' = ANY (d.permissions)) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'device_revoked');
  END IF;
  RETURN public.claude_reserve_core(
    'native', _run_id, _r.owner_id, _r.agent_id, _r.model, _input_chars, _max_output_tokens
  );
END $$;
REVOKE ALL ON FUNCTION public.claude_reserve_native_chat(uuid,integer,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claude_reserve_native_chat(uuid,integer,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.omni_native_chat_finish(
  _run_id uuid, _status text, _reply_chars integer, _input_tokens integer,
  _output_tokens integer, _error_status integer, _error_reason text,
  _release_guard boolean, _pause_status integer, _pause_message text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _r public.omni_native_chat_runs;
  _guard text := 'Native OMNI request ' || _run_id::text || ' is in progress or its outcome needs owner review. No automatic restart.';
  _guard_rows integer;
BEGIN
  IF _status IS NULL OR _status NOT IN ('completed', 'failed', 'cancelled', 'denied') THEN
    RAISE EXCEPTION 'Unknown native chat outcome' USING ERRCODE = '22023';
  END IF;
  IF _reply_chars IS NULL OR _reply_chars NOT BETWEEN 0 AND 40000
     OR (_input_tokens IS NOT NULL AND _input_tokens < 0)
     OR (_output_tokens IS NOT NULL AND _output_tokens < 0)
     OR (_error_status IS NOT NULL AND _error_status NOT BETWEEN 100 AND 599)
     OR (_error_reason IS NOT NULL AND _error_reason !~ '^[a-z_]{1,60}$') THEN
    RAISE EXCEPTION 'Invalid native chat outcome metadata' USING ERRCODE = '22023';
  END IF;
  IF _pause_status IS NOT NULL AND (_pause_status NOT IN (402, 403, 404)
     OR _pause_message IS NULL OR length(_pause_message) NOT BETWEEN 1 AND 500) THEN
    RAISE EXCEPTION 'Invalid AI pause' USING ERRCODE = '22023';
  END IF;
  UPDATE public.omni_native_chat_runs SET
    status = _status,
    reply_chars = _reply_chars,
    input_tokens = _input_tokens,
    output_tokens = _output_tokens,
    error_status = CASE WHEN _status = 'completed' THEN NULL ELSE _error_status END,
    error_reason = CASE WHEN _status = 'completed' THEN NULL ELSE _error_reason END,
    finished_at = clock_timestamp()
  WHERE id = _run_id AND status = 'running'
  RETURNING * INTO _r;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'run_not_running'); END IF;
  IF _pause_status IS NOT NULL THEN
    UPDATE public.ai_gateway_state SET blocked_status = _pause_status,
      message = _pause_message, blocked_at = now()
    WHERE feature = 'evolution-omni' AND message = _guard;
  ELSIF _release_guard THEN
    DELETE FROM public.ai_gateway_state WHERE feature = 'evolution-omni' AND message = _guard;
  END IF;
  GET DIAGNOSTICS _guard_rows = ROW_COUNT;
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (_r.owner_id, 'native_chat_finish_' || _status, 'omni_native_chat', _run_id::text);
  RETURN jsonb_build_object(
    'ok', true, 'guard_released', _pause_status IS NULL AND _release_guard AND _guard_rows = 1,
    'paused', _pause_status IS NOT NULL
  );
END $$;
REVOKE ALL ON FUNCTION public.omni_native_chat_finish(uuid,text,integer,integer,integer,integer,text,boolean,integer,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_native_chat_finish(uuid,text,integer,integer,integer,integer,text,boolean,integer,text)
  TO service_role;
