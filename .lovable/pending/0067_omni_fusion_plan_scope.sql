-- 0067 (PROPOSED, not applied): a separate, least-privilege "fusion:plan" owner delegation scope.
-- Additive and independent of proposed 0066 (either install order gives the same consent function).
-- Grants nothing by itself: the owner must tick "fusion:plan" on /omni-authorize (owner + aal2 +
-- fresh authenticator code) for each new connection, and it is never implied by any other scope.
-- What fusion:plan allows: OMNI web may ASK Fusion for a plan proposal for the owner's held work.
-- What it can never do (no code path here or in the app): create, start, hand off, approve or
-- retry tasks; call an AI model or any provider; read or issue Jackboy permits; change spend caps;
-- engage or release the Emergency Stop. The gate below writes only one audit row. Fusion's
-- planner is not built, so every admitted request is answered "planner_not_available".

ALTER TABLE public.omni_delegations DROP CONSTRAINT omni_delegations_scopes_check;
ALTER TABLE public.omni_delegations
  ADD CONSTRAINT omni_delegations_scopes_check CHECK (cardinality(scopes) BETWEEN 1 AND 5);

-- Marker the server reads to know this change is installed (no data, no secret).
CREATE OR REPLACE FUNCTION public.omni_fusion_plan_ready()
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT true $$;
REVOKE ALL ON FUNCTION public.omni_fusion_plan_ready() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_fusion_plan_ready() TO authenticated, service_role;

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

-- Service-only gate for POST /api/omni/fusion/plans, in one transaction: a valid delegation that
-- includes fusion:plan (expiry, revocation, audience and verified owner via omni_delegation_use),
-- then the Emergency Stop (missing or unreadable row = engaged). Returns the planner state; it
-- never touches tasks, handoffs, permits, AI guards, chat runs or the Stop itself.
CREATE OR REPLACE FUNCTION public.omni_delegation_fusion_plan_gate(_token_hash text, _audience text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _v jsonb;
BEGIN
  _v := public.omni_delegation_use(_token_hash, _audience, 'fusion:plan');
  IF _v->>'status' <> 'valid' THEN
    RETURN jsonb_build_object('ok', false, 'reason', _v->>'status');
  END IF;
  IF public.omni_stop_engaged() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'emergency_stop_engaged');
  END IF;
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES ((_v->>'owner_id')::uuid, 'fusion_plan_requested', 'omni_delegation', _v->>'delegation_id');
  RETURN jsonb_build_object('ok', true, 'planner', 'not_available',
                            'delegation_id', _v->>'delegation_id');
END $$;
REVOKE ALL ON FUNCTION public.omni_delegation_fusion_plan_gate(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_delegation_fusion_plan_gate(text, text) TO service_role;
