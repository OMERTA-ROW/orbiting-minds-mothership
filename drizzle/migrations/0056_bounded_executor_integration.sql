-- Extends the existing activation authority; no second approval/permit database or enabled switch.
CREATE FUNCTION public.activation_attempt_outcome(_kind text,_attempt uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE a public.activation_activations%ROWTYPE;
BEGIN
  SELECT * INTO a FROM public.activation_activations WHERE kind=_kind AND attempt_id=_attempt;
  IF a.kind IS NULL THEN RETURN 'superseded'; END IF;
  IF a.status='active' THEN
    RETURN CASE WHEN public.activation_effective(_kind) THEN 'active' ELSE 'expired' END;
  END IF;
  RETURN a.status;
END $$;
REVOKE ALL ON FUNCTION public.activation_attempt_outcome(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activation_attempt_outcome(text,uuid) TO service_role;

CREATE FUNCTION public.activation_unresolved_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.status='revoked' AND OLD.status IS DISTINCT FROM 'revoked' THEN
    NEW.evidence := NEW.evidence || '{"remoteReconciliationRequired":true}'::jsonb;
  END IF;
  IF NEW.status='activating' AND (
    coalesce((OLD.evidence->>'remoteReconciliationRequired')::boolean,false) OR
    ((OLD.status='activating' OR (OLD.status='failed' AND
      coalesce((OLD.evidence->>'rollbackVerified')::boolean,false) IS NOT TRUE))
      AND NEW.attempt_id IS DISTINCT FROM OLD.attempt_id))
  THEN RAISE EXCEPTION 'Reconcile the unresolved activation before a new attempt'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER activation_unresolved_guard BEFORE UPDATE ON public.activation_activations
  FOR EACH ROW EXECUTE FUNCTION public.activation_unresolved_guard();
REVOKE ALL ON FUNCTION public.activation_unresolved_guard() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.activation_activation_revoke(_kind text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_razul_owner();
  IF _kind IS NULL OR _kind NOT IN ('live_link','autonomy') THEN
    RAISE EXCEPTION 'Unknown activation' USING ERRCODE='22023';
  END IF;
  UPDATE public.activation_activations SET status='revoked',reason='owner_revoked',updated_at=now()
    WHERE (kind=_kind OR (_kind='live_link' AND kind='autonomy'))
      AND status IN ('active','activating','failed');
  INSERT INTO public.razul_control_audit(actor_id,action,record_type,record_id)
    VALUES(auth.uid(),'activation_revoked','activation',_kind);
  PERFORM public.jackboy_safety_halt();
  RETURN 'revoked';
END $$;

-- Only the service that verified remote reduction/cancellation can close this uncertainty.
CREATE FUNCTION public.activation_rollback_confirmed(_kind text,_attempt uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a public.activation_activations%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.activation_activations
    WHERE kind=_kind OR (_kind='live_link' AND kind='autonomy') ORDER BY kind FOR UPDATE;
  SELECT * INTO a FROM public.activation_activations WHERE kind=_kind AND attempt_id=_attempt;
  IF a.kind IS NULL OR a.status='active' THEN RAISE EXCEPTION 'Rollback scope changed'; END IF;
  UPDATE public.activation_activations SET
    evidence=evidence || '{"rollbackVerified":true,"remoteReconciliationRequired":false}'::jsonb,
    updated_at=now() WHERE kind=_kind OR (_kind='live_link' AND kind='autonomy');
  INSERT INTO public.razul_control_audit(actor_id,action,record_type,record_id)
    VALUES(a.actor_id,'activation_rollback_confirmed','activation',_kind);
END $$;
REVOKE ALL ON FUNCTION public.activation_rollback_confirmed(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activation_rollback_confirmed(text,uuid) TO service_role;
