-- 0053 is reserved by the separate intelligence-foundation branch. No switches are enabled.
CREATE TABLE public.activation_operations (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  step integer NOT NULL CHECK (step IN (9,10)),
  approval_revision integer NOT NULL,
  target_revision integer NOT NULL,
  prerequisite_revisions jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('pending','completed','failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.activation_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY activation_operations_owner_read ON public.activation_operations FOR SELECT TO authenticated
  USING (actor_id=auth.uid() AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='owner'));
REVOKE ALL ON public.activation_operations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.activation_operations TO authenticated;
GRANT ALL ON public.activation_operations TO service_role;

-- Prevent direct label-only approval, including calls made without the app's handler.
CREATE FUNCTION public.activation_actuation_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.step IN (9,10) AND NEW.status='approved' AND OLD.status IS DISTINCT FROM 'approved'
    AND NOT EXISTS (SELECT 1 FROM public.activation_operations o
      WHERE o.step=NEW.step AND o.actor_id=NEW.approver_id AND o.state='completed'
        AND o.target_revision=OLD.revision AND o.created_at>now()-interval '2 minutes'
        AND o.approval_revision=(SELECT revision FROM public.activation_approvals WHERE step=7))
  THEN RAISE EXCEPTION 'Step 9/10 requires verified backend actuation'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER activation_actuation_guard BEFORE UPDATE ON public.activation_approvals
  FOR EACH ROW EXECUTE FUNCTION public.activation_actuation_guard();

CREATE FUNCTION public.activation_begin(_id uuid,_step integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  existing public.activation_operations%ROWTYPE;
  revision integer;
  expiry timestamptz;
BEGIN
  PERFORM public.assert_razul_owner();
  PERFORM public.assert_fresh_mfa(900);
  IF _id IS NULL OR _step NOT IN (9,10) THEN RAISE EXCEPTION 'Invalid operation'; END IF;
  PERFORM 1 FROM public.activation_approvals ORDER BY step FOR UPDATE;
  SELECT * INTO existing FROM public.activation_operations WHERE id=_id FOR UPDATE;
  IF existing.id IS NOT NULL THEN
    IF existing.actor_id IS DISTINCT FROM auth.uid() OR existing.step IS DISTINCT FROM _step
    THEN RAISE EXCEPTION 'Operation scope conflict'; END IF;
    RETURN jsonb_build_object('state',existing.state,'id',_id);
  END IF;
  IF EXISTS (SELECT 1 FROM public.activation_operations WHERE state='pending')
  THEN RAISE EXCEPTION 'Reconcile the pending activation before another request'; END IF;
  SELECT a.approval_expires_at INTO expiry FROM public.activation_approvals a WHERE a.step=7;
  IF expiry IS NULL OR expiry<=now() OR EXISTS (
    SELECT 1 FROM public.activation_approvals WHERE step<_step AND status<>'approved'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.activation_approval_checks WHERE step=8 AND status='passed'
      AND evidence_version=2 AND checked_at>now()-interval '15 minutes' AND checked_at<=now()
  ) THEN RAISE EXCEPTION 'Approval window or signed Step 8 evidence is not fresh'; END IF;
  SELECT a.revision INTO revision FROM public.activation_approvals a WHERE a.step=7;
  INSERT INTO public.activation_operations(id,actor_id,step,approval_revision,target_revision,prerequisite_revisions,state)
    VALUES(_id,auth.uid(),_step,revision,(SELECT a.revision FROM public.activation_approvals a WHERE a.step=_step),
      (SELECT jsonb_object_agg(a.step::text,a.revision) FROM public.activation_approvals a WHERE a.step<_step),'pending');
  INSERT INTO public.razul_control_audit(actor_id,action,record_type,record_id)
    VALUES(auth.uid(),'activation_begin','activation_operation',_id::text);
  RETURN jsonb_build_object('state','pending','id',_id,'expiresAt',expiry);
END $$;

CREATE FUNCTION public.activation_finalize(_actor uuid,_id uuid,_state text,_note text,_cap boolean,_daily boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE operation public.activation_operations%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.activation_approvals ORDER BY step FOR UPDATE;
  SELECT * INTO operation FROM public.activation_operations WHERE id=_id FOR UPDATE;
  IF _actor IS NULL OR operation.actor_id IS DISTINCT FROM _actor OR operation.state IS DISTINCT FROM 'pending'
    OR _state NOT IN ('completed','failed') THEN RAISE EXCEPTION 'Operation is not pending'; END IF;
  IF _state='completed' THEN
    IF NOT EXISTS (SELECT 1 FROM public.activation_approvals WHERE step=7
      AND revision=operation.approval_revision AND approval_expires_at>now())
      OR operation.created_at<now()-interval '2 minutes'
      OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_actor AND role='owner')
      OR EXISTS (SELECT 1 FROM public.activation_approvals WHERE step<operation.step AND status<>'approved')
      OR NOT EXISTS (SELECT 1 FROM public.activation_approval_checks WHERE step=8 AND status='passed'
        AND evidence_version=2 AND checked_at>now()-interval '15 minutes' AND checked_at<=now())
      OR (operation.step=10 AND (_cap IS DISTINCT FROM true OR _daily IS DISTINCT FROM true))
      OR NOT EXISTS (SELECT 1 FROM public.activation_approvals WHERE step=operation.step AND revision=operation.target_revision)
      OR operation.prerequisite_revisions IS DISTINCT FROM
        (SELECT jsonb_object_agg(a.step::text,a.revision) FROM public.activation_approvals a WHERE a.step<operation.step)
      OR EXISTS (SELECT 1 FROM public.owner_mfa_recovery_events
        WHERE user_id=_actor AND event='recovery_completed' AND created_at>=operation.created_at)
    THEN RAISE EXCEPTION 'Approval changed while activation was in flight'; END IF;
    UPDATE public.activation_operations SET state='completed' WHERE id=_id;
    UPDATE public.activation_approvals SET status='approved',approver_id=_actor,decided_at=now(),
      note='',revision=revision+1,spend_confirmations=CASE WHEN operation.step=10
        THEN jsonb_build_object('openai_cap_usd',10,'daily_limit_usd',5,'confirmed_at',now()) ELSE NULL END
      WHERE step=operation.step AND status<>'approved';
    IF NOT FOUND THEN RAISE EXCEPTION 'Step is already approved'; END IF;
  END IF;
  UPDATE public.activation_operations SET state=_state WHERE id=_id;
  INSERT INTO public.razul_control_audit(actor_id,action,record_type,record_id)
    VALUES(_actor,'activation_'||_state,'activation_operation',_id::text);
END $$;
REVOKE ALL ON FUNCTION public.activation_begin(uuid,integer),
  public.activation_finalize(uuid,uuid,text,text,boolean,boolean),public.activation_actuation_guard()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activation_begin(uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activation_finalize(uuid,uuid,text,text,boolean,boolean) TO service_role;

CREATE FUNCTION public.activation_operation_status(_actor uuid,_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE operation public.activation_operations%ROWTYPE;
BEGIN
  SELECT * INTO operation FROM public.activation_operations WHERE id=_id AND actor_id=_actor;
  IF operation.id IS NULL THEN RAISE EXCEPTION 'Operation scope denied'; END IF;
  RETURN jsonb_build_object('state',operation.state,'effective',
    operation.state='completed'
    AND EXISTS (SELECT 1 FROM public.activation_approvals WHERE step=operation.step AND status='approved'
      AND approver_id=_actor AND revision=operation.target_revision+1)
    AND EXISTS (SELECT 1 FROM public.activation_approvals WHERE step=7
      AND revision=operation.approval_revision AND approval_expires_at>now()));
END $$;
REVOKE ALL ON FUNCTION public.activation_operation_status(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activation_operation_status(uuid,uuid) TO service_role;
