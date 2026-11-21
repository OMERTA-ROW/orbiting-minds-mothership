-- 0072 (PROPOSED; renumbered because installed 0070–0071 are Dread/Draco memory; not applied; needs owner install approval): separate read-only "diagnostics:read"
-- delegation scope. Grants nothing by itself: owner must tick it on /omni-authorize (owner + aal2 +
-- fresh code). The gate returns only Stop state and server time; it never touches tasks, permits,
-- spend, AI guards or the Stop itself. Install the consent-function update together with app code
-- that adds 'diagnostics:read' to the allowed list behind the omni_diagnostics_ready() marker.

ALTER TABLE public.omni_delegations DROP CONSTRAINT omni_delegations_scopes_check;
ALTER TABLE public.omni_delegations
  ADD CONSTRAINT omni_delegations_scopes_check CHECK (cardinality(scopes) BETWEEN 1 AND 6);

CREATE OR REPLACE FUNCTION public.omni_diagnostics_ready()
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT true $$;
REVOKE ALL ON FUNCTION public.omni_diagnostics_ready() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_diagnostics_ready() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.omni_delegation_diagnostics_read(_token_hash text, _audience text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _v jsonb;
BEGIN
  _v := public.omni_delegation_use(_token_hash, _audience, 'diagnostics:read');
  IF _v->>'status' <> 'valid' THEN
    RETURN jsonb_build_object('ok', false, 'reason', _v->>'status');
  END IF;
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES ((_v->>'owner_id')::uuid, 'diagnostics_read', 'omni_delegation', _v->>'delegation_id');
  RETURN jsonb_build_object('ok', true, 'checkedAt', now(),
    'emergencyStopEngaged', public.omni_stop_engaged(),
    'executor', 'locked_pending_sandbox');
END $$;
REVOKE ALL ON FUNCTION public.omni_delegation_diagnostics_read(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_delegation_diagnostics_read(text, text) TO service_role;

-- The consent function (omni_delegation_authorize) must also be re-created from 0067's body with:
--   IF to_regprocedure('public.omni_diagnostics_ready()') IS NOT NULL THEN
--     _allowed := _allowed || 'diagnostics:read'::text; END IF;
-- (copied verbatim at install time to avoid drift from the installed 0067 body).
