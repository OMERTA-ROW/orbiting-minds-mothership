CREATE TABLE public.omni_stop_outbox (
  revision bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);
ALTER TABLE public.omni_stop_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.omni_stop_outbox FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.omni_stop_outbox TO service_role;

CREATE FUNCTION public.omni_stop_pending() RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT max(revision) FROM public.omni_stop_outbox WHERE delivered_at IS NULL
$$;
REVOKE ALL ON FUNCTION public.omni_stop_pending() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.omni_stop_pending() TO service_role;

CREATE FUNCTION public.omni_stop_propagation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.emergency_stop IS DISTINCT FROM false THEN
    IF EXISTS (SELECT 1 FROM public.activation_activations WHERE status IN ('active','activating','failed'))
      OR EXISTS (SELECT 1 FROM public.jackboy_permits WHERE status='active')
      OR EXISTS (SELECT 1 FROM public.omni_stop_outbox WHERE delivered_at IS NULL)
    THEN
      INSERT INTO public.omni_stop_outbox DEFAULT VALUES;
    END IF;
    PERFORM public.jackboy_safety_halt();
  ELSIF EXISTS (SELECT 1 FROM public.omni_stop_outbox WHERE delivered_at IS NULL) THEN
    RAISE EXCEPTION 'Remote cancellation remains unverified; reconcile before releasing Stop';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.omni_stop_propagation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER omni_stop_propagation AFTER INSERT OR UPDATE OF emergency_stop
  ON public.omni_terminal_controls FOR EACH ROW EXECUTE FUNCTION public.omni_stop_propagation();

CREATE FUNCTION public.omni_stop_delivered(_revision bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.omni_terminal_controls WHERE id=1 FOR UPDATE;
  UPDATE public.omni_stop_outbox SET delivered_at=now() WHERE revision<=_revision AND delivered_at IS NULL;
  INSERT INTO public.razul_control_audit(actor_id,action,record_type,record_id)
    VALUES(NULL,'remote_stop_verified','omni_terminal',_revision::text);
END $$;
REVOKE ALL ON FUNCTION public.omni_stop_delivered(bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.omni_stop_delivered(bigint) TO service_role;

ALTER FUNCTION public.jackboy_permit_record(uuid,text,text,uuid,timestamptz,integer,numeric,numeric,numeric,text)
  RENAME TO jackboy_permit_record_unlocked;
REVOKE ALL ON FUNCTION public.jackboy_permit_record_unlocked(uuid,text,text,uuid,timestamptz,integer,numeric,numeric,numeric,text)
  FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.jackboy_permit_record(
  _job uuid,_kind text,_digest text,_permit_id uuid,_expires_at timestamptz,_renewals integer,
  _per_call numeric,_per_task numeric,_daily numeric,_signature_digest text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.omni_terminal_controls WHERE id=1 FOR UPDATE;
  RETURN public.jackboy_permit_record_unlocked(_job,_kind,_digest,_permit_id,_expires_at,_renewals,
    _per_call,_per_task,_daily,_signature_digest);
END $$;
REVOKE ALL ON FUNCTION public.jackboy_permit_record(uuid,text,text,uuid,timestamptz,integer,numeric,numeric,numeric,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.jackboy_permit_record(uuid,text,text,uuid,timestamptz,integer,numeric,numeric,numeric,text)
  TO service_role;

CREATE FUNCTION public.omni_execution_permit_live(_job uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.omni_terminal_controls WHERE id=1 FOR UPDATE;
  RETURN EXISTS (SELECT 1 FROM public.omni_terminal_controls WHERE id=1 AND emergency_stop=false)
    AND NOT EXISTS (SELECT 1 FROM public.omni_stop_outbox WHERE delivered_at IS NULL)
    AND public.activation_autonomy_authorized()
    AND EXISTS (SELECT 1 FROM public.jackboy_permits WHERE job_id=_job AND kind='autonomous'
      AND status='active' AND expires_at>clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION public.omni_execution_permit_live(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.omni_execution_permit_live(uuid) TO service_role;
