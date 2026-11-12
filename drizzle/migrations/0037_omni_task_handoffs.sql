-- Held OMNI Terminal task -> queued Jackboy job handoff records. Mothership never runs or dispatches to OMNI;
-- Jackboy owns passkey approval, spend caps and execution. Statuses are written only by the server after
-- verifying Jackboy's signed reply. Emergency Stop (missing row = engaged) blocks every step.
CREATE TABLE public.omni_task_handoffs (
  task_id uuid PRIMARY KEY REFERENCES public.omni_terminal_tasks(id),
  created_by uuid NOT NULL,
  job_kind text NOT NULL CHECK (job_kind IN ('test', 'build')),
  payload_digest text NOT NULL CHECK (payload_digest ~ '^[a-f0-9]{64}$'),
  jackboy_job_id text CHECK (jackboy_job_id IS NULL OR jackboy_job_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending','queued','approved','quarantined','running','completed','failed','refused','error')),
  detail text NOT NULL DEFAULT '' CHECK (length(detail) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz
);
GRANT SELECT ON public.omni_task_handoffs TO authenticated;
GRANT ALL ON public.omni_task_handoffs TO service_role;
ALTER TABLE public.omni_task_handoffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Verified MFA owner reads task handoffs"
  ON public.omni_task_handoffs FOR SELECT TO authenticated
  USING (public.is_razul_owner());

CREATE OR REPLACE FUNCTION public.omni_stop_engaged()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$ SELECT NOT EXISTS (SELECT 1 FROM public.omni_terminal_controls WHERE id = 1 AND emergency_stop = false) $$;

-- Owner step: requires owner/aal2 and a TOTP check within 15 minutes. Idempotent per task.
CREATE OR REPLACE FUNCTION public.omni_task_handoff_begin(_task uuid, _kind text, _digest text)
RETURNS SETOF public.omni_task_handoffs
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE _t public.omni_terminal_tasks; _h public.omni_task_handoffs;
BEGIN
  PERFORM public.assert_razul_owner();
  PERFORM public.assert_fresh_mfa(900);
  IF public.omni_stop_engaged() THEN
    RAISE EXCEPTION 'Emergency Stop is engaged; nothing was sent' USING ERRCODE = '22023';
  END IF;
  IF _kind NOT IN ('test','build') OR _digest !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid handoff' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _t FROM public.omni_terminal_tasks WHERE id = _task FOR UPDATE;
  IF NOT FOUND OR _t.state <> 'held' OR _t.agent <> 'jackboy' OR _t.repository IS NULL THEN
    RAISE EXCEPTION 'Only held Jackboy tasks with a repository can be sent' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _h FROM public.omni_task_handoffs WHERE task_id = _task;
  IF FOUND THEN
    IF _h.payload_digest <> _digest OR _h.job_kind <> _kind THEN
      RAISE EXCEPTION 'This task was already sent with different details' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT * FROM public.omni_task_handoffs WHERE task_id = _task;
    RETURN;
  END IF;
  INSERT INTO public.omni_task_handoffs (task_id, created_by, job_kind, payload_digest)
  VALUES (_task, auth.uid(), _kind, _digest);
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (auth.uid(), 'handoff_begin', 'omni_terminal', _task::text);
  RETURN QUERY SELECT * FROM public.omni_task_handoffs WHERE task_id = _task;
END $$;

-- Server-only: called after Jackboy's signed reply was verified.
CREATE OR REPLACE FUNCTION public.omni_task_handoff_record(_task uuid, _job text, _status text, _detail text, _actor uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  UPDATE public.omni_task_handoffs
     SET jackboy_job_id = COALESCE(jackboy_job_id, _job),
         status = _status,
         detail = left(COALESCE(_detail, ''), 200),
         updated_at = now(),
         last_checked_at = now()
   WHERE task_id = _task AND (jackboy_job_id IS NULL OR _job IS NULL OR jackboy_job_id = _job);
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (_actor, 'handoff_' || _status, 'omni_terminal', _task::text);
  RETURN true;
END $$;

-- Server-only, device-scoped status list (no instructions or output).
CREATE OR REPLACE FUNCTION public.omni_dock_handoff_status(_device uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'taskId', t.id, 'state', t.state,
    'handoff', COALESCE(h.status, 'not_sent'),
    'updatedAt', COALESCE(h.updated_at, t.created_at)) ORDER BY t.created_at DESC), '[]'::jsonb)
  FROM (SELECT * FROM public.omni_terminal_tasks WHERE source_device = _device ORDER BY created_at DESC LIMIT 50) t
  LEFT JOIN public.omni_task_handoffs h ON h.task_id = t.id
$$;

REVOKE ALL ON FUNCTION public.omni_stop_engaged() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_stop_engaged() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.omni_task_handoff_begin(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_task_handoff_begin(uuid, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.omni_task_handoff_record(uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_task_handoff_record(uuid, text, text, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.omni_dock_handoff_status(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_dock_handoff_status(uuid) TO service_role;