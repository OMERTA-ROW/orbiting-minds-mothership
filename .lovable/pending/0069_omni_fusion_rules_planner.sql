-- Fusion phase 1 — rules-only plan proposals for POST /api/omni/fusion/plans (PROPOSED, not installed).
-- Builds on 0067 (fusion:plan scope). One service-only call checks, in a single transaction:
-- a valid owner delegation with fusion:plan (expiry, revocation, audience, verified owner), the
-- Emergency Stop (missing or unreadable = engaged), that the task is this owner's OMNI-created held
-- task with no Jackboy handover yet, and a per-owner daily limit; then writes one audit row and
-- returns only task metadata (never title or instruction text; a SHA-256 digest of them instead).
-- The plan itself is computed by fixed rules in the app. Nothing here creates, changes, hands off,
-- approves or runs tasks, touches permits, spending limits, AI guards, chat runs or the Stop.

-- Install marker for the rules planner (service-only; the consent page doesn't need it).
CREATE OR REPLACE FUNCTION public.omni_fusion_planner_ready()
RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = '' AS $$ SELECT true $$;
REVOKE ALL ON FUNCTION public.omni_fusion_planner_ready() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_fusion_planner_ready() TO service_role;

CREATE INDEX IF NOT EXISTS razul_control_audit_fusion_plan_idx
  ON public.razul_control_audit (actor_id, occurred_at)
  WHERE action = 'fusion_plan_proposed';

CREATE OR REPLACE FUNCTION public.omni_delegation_fusion_plan_context(
  _token_hash text, _audience text, _task_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _v jsonb;
  _owner uuid;
  _del uuid;
  _scopes text[];
  _t public.omni_terminal_tasks;
  _used integer;
  _limit CONSTANT integer := 10;
BEGIN
  _v := public.omni_delegation_use(_token_hash, _audience, 'fusion:plan');
  IF _v->>'status' <> 'valid' THEN
    RETURN jsonb_build_object('ok', false, 'reason', _v->>'status');
  END IF;
  IF public.omni_stop_engaged() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'emergency_stop_engaged');
  END IF;
  IF _task_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request');
  END IF;
  _owner := (_v->>'owner_id')::uuid;
  _del := (_v->>'delegation_id')::uuid;
  SELECT scopes INTO _scopes FROM public.omni_delegations WHERE id = _del;
  -- Only this owner's tasks that OMNI web created through a delegation (same rule as 0064 reads).
  -- Another owner's task and an unknown id get the same answer.
  SELECT * INTO _t FROM public.omni_terminal_tasks
  WHERE id = _task_id AND created_by = _owner AND source_delegation IS NOT NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'task_not_found');
  END IF;
  IF _t.state <> 'held' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'task_not_held');
  END IF;
  IF EXISTS (SELECT 1 FROM public.omni_task_handoffs WHERE task_id = _t.id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'task_already_handed_off');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('omni_fusion_plan:' || _owner::text));
  SELECT count(*) INTO _used FROM public.razul_control_audit
  WHERE actor_id = _owner AND action = 'fusion_plan_proposed'
    AND occurred_at > now() - interval '24 hours';
  IF _used >= _limit THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'daily_limit');
  END IF;
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (_owner, 'fusion_plan_proposed', 'omni_terminal', _t.id::text);
  RETURN jsonb_build_object(
    'ok', true,
    'delegation_id', _del,
    'scopes', to_jsonb(_scopes),
    'task', jsonb_build_object(
      'id', _t.id, 'agentId', _t.agent, 'kind', _t.kind, 'state', _t.state,
      'hasRepository', _t.repository IS NOT NULL, 'createdAt', _t.created_at,
      'inputDigest', encode(sha256(convert_to(_t.project_label || E'\n' || _t.instructions, 'UTF8')), 'hex')
    ),
    'stopCheckedAt', clock_timestamp(),
    'plansUsed', _used + 1,
    'dailyLimit', _limit
  );
END $$;
REVOKE ALL ON FUNCTION public.omni_delegation_fusion_plan_context(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_delegation_fusion_plan_context(text, text, uuid) TO service_role;

COMMENT ON FUNCTION public.omni_fusion_planner_ready() IS
  'Install marker for the Fusion rules-only planner (0069). Service-only.';
COMMENT ON FUNCTION public.omni_delegation_fusion_plan_context(text, text, uuid) IS
  'Fusion phase 1: fusion:plan delegation + Emergency Stop + owner held-task + daily limit check in one transaction; one audit row; task metadata and digest only. Never creates, hands off, approves or runs work, reads permits or spends.';
