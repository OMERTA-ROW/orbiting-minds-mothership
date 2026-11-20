-- OMNI owner delegation for the OMNI web frontend (client "omni-web", audience "omni-mothership").
-- Additive only. The owner approves on the Mothership (verified owner, aal2, authenticator code
-- within 15 minutes); a single-use 60-second authorization code bound to a PKCE S256 challenge
-- and the exact allowlisted callback is exchanged server-to-server for a 15-minute bearer
-- delegation stored only as a SHA-256 hash. Only "tasks:write" (held Terminal tasks) and
-- "safety:emergency-stop" (engage only) can be granted. Metadata API keys are unchanged.

CREATE TABLE public.omni_delegation_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  client_id text NOT NULL,
  audience text NOT NULL,
  redirect_uri text NOT NULL,
  scopes text[] NOT NULL,
  code_hash text NOT NULL UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  code_challenge text NOT NULL CHECK (code_challenge ~ '^[A-Za-z0-9_-]{43}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  delegation_id uuid,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '60 seconds')
);
CREATE INDEX omni_delegation_codes_owner_idx ON public.omni_delegation_codes (owner_id, created_at DESC);
GRANT ALL ON public.omni_delegation_codes TO service_role;
ALTER TABLE public.omni_delegation_codes ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.omni_delegation_codes IS
  'Single-use OMNI sign-in codes (hash + PKCE challenge only). Service-only; no direct owner or browser access.';

CREATE TABLE public.omni_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  client_id text NOT NULL,
  audience text NOT NULL,
  scopes text[] NOT NULL CHECK (cardinality(scopes) BETWEEN 1 AND 2),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  token_prefix text NOT NULL CHECK (token_prefix ~ '^omnid_[0-9a-f]{6}$'),
  code_id uuid NOT NULL UNIQUE REFERENCES public.omni_delegation_codes (id),
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_reason text CHECK (revoked_reason IN ('client', 'owner', 'superseded', 'code_replay', 'owner_changed')),
  last_used_at timestamptz,
  CHECK (expires_at > issued_at AND expires_at <= issued_at + interval '15 minutes'),
  CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL))
);
CREATE INDEX omni_delegations_owner_client_idx ON public.omni_delegations (owner_id, client_id) WHERE revoked_at IS NULL;
GRANT SELECT (id, owner_id, client_id, audience, scopes, token_prefix, issued_at, expires_at,
              revoked_at, revoked_reason, last_used_at) ON public.omni_delegations TO authenticated;
GRANT ALL ON public.omni_delegations TO service_role;
ALTER TABLE public.omni_delegations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own OMNI delegations" ON public.omni_delegations
  FOR SELECT TO authenticated USING (owner_id = auth.uid() AND public.is_razul_owner());
COMMENT ON TABLE public.omni_delegations IS
  'Short-lived OMNI owner delegations: hash-only bearer, owner/client/audience bound, scoped, revocable.';

ALTER TABLE public.omni_terminal_tasks ADD COLUMN source_delegation uuid REFERENCES public.omni_delegations (id);
COMMENT ON COLUMN public.omni_terminal_tasks.source_delegation IS
  'Set when OMNI web held this task through an owner delegation; the task stays held like any other.';

CREATE OR REPLACE FUNCTION public.omni_delegation_owner_ok(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT _uid IS NOT NULL
    AND COALESCE(public.has_role(_uid, 'owner'), false)
    AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _uid AND u.email_confirmed_at IS NOT NULL)
$$;
REVOKE ALL ON FUNCTION public.omni_delegation_owner_ok(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_delegation_owner_ok(uuid) TO service_role;

-- Owner consent (signed-in owner, aal2, fresh authenticator code). Returns no secret.
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
    SELECT 1 FROM unnest(_scopes) s WHERE s IS NULL OR s NOT IN ('tasks:write', 'safety:emergency-stop')
  ) THEN
    RAISE EXCEPTION 'Only supported scopes (tasks:write, safety:emergency-stop) can be granted' USING ERRCODE = '22023';
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
REVOKE ALL ON FUNCTION public.omni_delegation_authorize(text, text, text, text[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_delegation_authorize(text, text, text, text[], text, text) TO authenticated;

-- Server-to-server exchange. Every attempt burns the code; a reused code revokes what it issued.
-- Refusals are returned (not raised) so the burn and any replay revocation are kept.
CREATE OR REPLACE FUNCTION public.omni_delegation_exchange(
  _code_hash text, _code_challenge text, _client_id text, _redirect_uri text, _token_hash text, _token_prefix text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _c public.omni_delegation_codes;
  _d public.omni_delegations;
  _now timestamptz := clock_timestamp();
BEGIN
  IF _token_hash IS NULL OR _token_hash !~ '^[0-9a-f]{64}$'
     OR _token_prefix IS NULL OR _token_prefix !~ '^omnid_[0-9a-f]{6}$' THEN
    RAISE EXCEPTION 'Malformed delegation token fields' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _c FROM public.omni_delegation_codes WHERE code_hash = _code_hash FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_grant', 'reason', 'unknown_code');
  END IF;
  IF _c.used_at IS NOT NULL THEN
    UPDATE public.omni_delegations SET revoked_at = _now, revoked_reason = 'code_replay'
    WHERE code_id = _c.id AND revoked_at IS NULL;
    INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
    VALUES (_c.owner_id, 'delegation_code_replay', 'omni_delegation', _c.id::text);
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_grant', 'reason', 'code_already_used');
  END IF;
  UPDATE public.omni_delegation_codes SET used_at = _now WHERE id = _c.id;
  IF _c.expires_at <= _now THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_grant', 'reason', 'code_expired');
  END IF;
  IF _c.client_id IS DISTINCT FROM _client_id OR _c.redirect_uri IS DISTINCT FROM _redirect_uri THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_grant', 'reason', 'client_mismatch');
  END IF;
  IF _code_challenge IS NULL OR _c.code_challenge IS DISTINCT FROM _code_challenge THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_grant', 'reason', 'pkce_mismatch');
  END IF;
  IF NOT public.omni_delegation_owner_ok(_c.owner_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_grant', 'reason', 'owner_unverified');
  END IF;
  -- One current delegation per owner and client.
  UPDATE public.omni_delegations SET revoked_at = _now, revoked_reason = 'superseded'
  WHERE owner_id = _c.owner_id AND client_id = _c.client_id AND revoked_at IS NULL;
  INSERT INTO public.omni_delegations
    (owner_id, client_id, audience, scopes, token_hash, token_prefix, code_id, issued_at, expires_at)
  VALUES (_c.owner_id, _c.client_id, _c.audience, _c.scopes, _token_hash, _token_prefix, _c.id,
          _now, _now + interval '15 minutes')
  RETURNING * INTO _d;
  UPDATE public.omni_delegation_codes SET delegation_id = _d.id WHERE id = _c.id;
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (_c.owner_id, 'delegation_issue', 'omni_delegation', _d.id::text);
  RETURN jsonb_build_object(
    'ok', true, 'delegation_id', _d.id, 'client_id', _d.client_id, 'audience', _d.audience,
    'scopes', to_jsonb(_d.scopes), 'issued_at', _d.issued_at, 'expires_at', _d.expires_at
  );
END $$;
REVOKE ALL ON FUNCTION public.omni_delegation_exchange(text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_delegation_exchange(text, text, text, text, text, text) TO service_role;

-- Shared check used inside every delegated action, in the same transaction as the action.
CREATE OR REPLACE FUNCTION public.omni_delegation_use(_token_hash text, _audience text, _scope text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _d public.omni_delegations;
BEGIN
  IF _token_hash IS NULL OR _token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT * INTO _d FROM public.omni_delegations WHERE token_hash = _token_hash FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  IF _d.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('status', 'revoked'); END IF;
  IF _d.expires_at <= clock_timestamp() THEN RETURN jsonb_build_object('status', 'expired'); END IF;
  IF _d.audience IS DISTINCT FROM _audience THEN RETURN jsonb_build_object('status', 'wrong_audience'); END IF;
  IF NOT public.omni_delegation_owner_ok(_d.owner_id) THEN
    UPDATE public.omni_delegations SET revoked_at = clock_timestamp(), revoked_reason = 'owner_changed' WHERE id = _d.id;
    INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
    VALUES (_d.owner_id, 'delegation_revoke_owner_changed', 'omni_delegation', _d.id::text);
    RETURN jsonb_build_object('status', 'owner_unverified');
  END IF;
  IF _scope IS NULL OR NOT (_scope = ANY (_d.scopes)) THEN
    RETURN jsonb_build_object('status', 'scope_missing');
  END IF;
  UPDATE public.omni_delegations SET last_used_at = clock_timestamp() WHERE id = _d.id;
  RETURN jsonb_build_object('status', 'valid', 'delegation_id', _d.id, 'owner_id', _d.owner_id, 'client_id', _d.client_id);
END $$;
REVOKE ALL ON FUNCTION public.omni_delegation_use(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_delegation_use(text, text, text) TO service_role;

-- tasks:write — store a HELD agent.handoff task only. Nothing runs; the owner hands off on the Mothership.
CREATE OR REPLACE FUNCTION public.omni_delegation_hold_task(
  _token_hash text, _audience text, _id uuid, _agent text, _title text, _instructions text, _repository text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _v jsonb;
  _owner uuid;
  _del uuid;
  _t public.omni_terminal_tasks;
  _inserted integer;
  _repo text := NULLIF(btrim(COALESCE(_repository, '')), '');
  _title_c text := btrim(COALESCE(_title, ''));
  _instr_c text := btrim(COALESCE(_instructions, ''));
BEGIN
  _v := public.omni_delegation_use(_token_hash, _audience, 'tasks:write');
  IF _v->>'status' <> 'valid' THEN
    RETURN jsonb_build_object('ok', false, 'reason', _v->>'status');
  END IF;
  _owner := (_v->>'owner_id')::uuid;
  _del := (_v->>'delegation_id')::uuid;
  IF _id IS NULL OR length(_title_c) NOT BETWEEN 1 AND 120 OR length(_instr_c) NOT BETWEEN 3 AND 4000
     OR (_repo IS NOT NULL AND (length(_repo) > 200 OR _repo !~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_task');
  END IF;
  IF _agent IS NULL OR _agent NOT IN ('jackboy', 'jax', 'razul', 'sabrina', 'guardian', 'hercules') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'agent_not_accepted');
  END IF;
  IF public.omni_terminal_secret_like(_title_c) OR public.omni_terminal_secret_like(_instr_c) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'secret_like');
  END IF;
  SELECT * INTO _t FROM public.omni_terminal_tasks WHERE id = _id;
  IF NOT FOUND THEN
    IF (SELECT count(*) FROM public.omni_terminal_tasks
        WHERE created_by = _owner AND source_delegation IS NOT NULL
          AND created_at > now() - interval '24 hours') >= 20 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'daily_limit');
    END IF;
    INSERT INTO public.omni_terminal_tasks
      (id, created_by, kind, agent, project_label, repository, instructions, source_delegation)
    VALUES (_id, _owner, 'agent.handoff', _agent, _title_c, _repo, _instr_c, _del)
    ON CONFLICT (id) DO NOTHING;
    GET DIAGNOSTICS _inserted = ROW_COUNT;
    IF _inserted = 1 THEN
      INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
      VALUES (_owner, 'task_held_delegated', 'omni_terminal', _id::text);
      SELECT * INTO _t FROM public.omni_terminal_tasks WHERE id = _id;
      RETURN jsonb_build_object('ok', true, 'duplicate', false, 'task', jsonb_build_object(
        'id', _t.id, 'agent', _t.agent, 'title', _t.project_label, 'repository', _t.repository,
        'state', _t.state, 'created_at', _t.created_at));
    END IF;
    SELECT * INTO _t FROM public.omni_terminal_tasks WHERE id = _id;
  END IF;
  IF _t.source_delegation IS NULL OR _t.created_by IS DISTINCT FROM _owner OR _t.kind <> 'agent.handoff'
     OR _t.agent IS DISTINCT FROM _agent OR _t.project_label IS DISTINCT FROM _title_c
     OR _t.repository IS DISTINCT FROM _repo OR _t.instructions IS DISTINCT FROM _instr_c THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'id_conflict');
  END IF;
  RETURN jsonb_build_object('ok', true, 'duplicate', true, 'task', jsonb_build_object(
    'id', _t.id, 'agent', _t.agent, 'title', _t.project_label, 'repository', _t.repository,
    'state', _t.state, 'created_at', _t.created_at));
END $$;
REVOKE ALL ON FUNCTION public.omni_delegation_hold_task(text, text, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_delegation_hold_task(text, text, uuid, text, text, text, text) TO service_role;

-- safety:emergency-stop — engage only (the same row, triggers and propagation as the owner's button).
CREATE OR REPLACE FUNCTION public.omni_delegation_engage_stop(_token_hash text, _audience text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _v jsonb;
  _owner uuid;
  _rev bigint;
BEGIN
  _v := public.omni_delegation_use(_token_hash, _audience, 'safety:emergency-stop');
  IF _v->>'status' <> 'valid' THEN
    RETURN jsonb_build_object('ok', false, 'reason', _v->>'status');
  END IF;
  _owner := (_v->>'owner_id')::uuid;
  INSERT INTO public.omni_terminal_controls (id, emergency_stop, changed_by, changed_at, reason, revision)
  VALUES (1, true, _owner, now(), 'Engaged from OMNI web (owner delegation)', 1)
  ON CONFLICT (id) DO UPDATE
    SET emergency_stop = true, changed_by = _owner, changed_at = now(),
        reason = 'Engaged from OMNI web (owner delegation)',
        revision = public.omni_terminal_controls.revision + 1
  RETURNING revision INTO _rev;
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (_owner, 'emergency_stop_engage_delegated', 'omni_terminal', 'controls');
  RETURN jsonb_build_object('ok', true, 'revision', _rev);
END $$;
REVOKE ALL ON FUNCTION public.omni_delegation_engage_stop(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_delegation_engage_stop(text, text) TO service_role;

-- Safe metadata for the bearer's own delegation; never the hash or any secret.
CREATE OR REPLACE FUNCTION public.omni_delegation_status(_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _d public.omni_delegations;
BEGIN
  IF _token_hash IS NULL OR _token_hash !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO _d FROM public.omni_delegations WHERE token_hash = _token_hash;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'delegation_id', _d.id, 'client_id', _d.client_id, 'audience', _d.audience,
    'scopes', to_jsonb(_d.scopes), 'issued_at', _d.issued_at, 'expires_at', _d.expires_at,
    'revoked_at', _d.revoked_at, 'revoked_reason', _d.revoked_reason,
    'owner_verified', public.omni_delegation_owner_ok(_d.owner_id), 'server_time', clock_timestamp()
  );
END $$;
REVOKE ALL ON FUNCTION public.omni_delegation_status(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_delegation_status(text) TO service_role;

-- Client revocation by its own bearer. Idempotent; audited once.
CREATE OR REPLACE FUNCTION public.omni_delegation_revoke(_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _d public.omni_delegations;
BEGIN
  IF _token_hash IS NULL OR _token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  UPDATE public.omni_delegations SET revoked_at = clock_timestamp(), revoked_reason = 'client'
  WHERE token_hash = _token_hash AND revoked_at IS NULL
  RETURNING * INTO _d;
  IF FOUND THEN
    INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
    VALUES (_d.owner_id, 'delegation_revoke', 'omni_delegation', _d.id::text);
    RETURN jsonb_build_object('found', true, 'already_revoked', false, 'delegation_id', _d.id, 'revoked_at', _d.revoked_at);
  END IF;
  SELECT * INTO _d FROM public.omni_delegations WHERE token_hash = _token_hash;
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;
  RETURN jsonb_build_object('found', true, 'already_revoked', true, 'delegation_id', _d.id, 'revoked_at', _d.revoked_at);
END $$;
REVOKE ALL ON FUNCTION public.omni_delegation_revoke(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_delegation_revoke(text) TO service_role;

-- Owner revocation from the Mothership (signed-in owner, aal2). Idempotent; audited once.
CREATE OR REPLACE FUNCTION public.omni_delegation_owner_revoke(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _d public.omni_delegations;
BEGIN
  PERFORM public.assert_razul_owner();
  UPDATE public.omni_delegations SET revoked_at = clock_timestamp(), revoked_reason = 'owner'
  WHERE id = _id AND owner_id = auth.uid() AND revoked_at IS NULL
  RETURNING * INTO _d;
  IF FOUND THEN
    INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
    VALUES (auth.uid(), 'delegation_revoke_owner', 'omni_delegation', _d.id::text);
    RETURN jsonb_build_object('already_revoked', false, 'revoked_at', _d.revoked_at);
  END IF;
  SELECT * INTO _d FROM public.omni_delegations WHERE id = _id AND owner_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such OMNI connection' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('already_revoked', true, 'revoked_at', _d.revoked_at);
END $$;
REVOKE ALL ON FUNCTION public.omni_delegation_owner_revoke(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_delegation_owner_revoke(uuid) TO authenticated;