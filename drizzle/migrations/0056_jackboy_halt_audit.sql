-- Audit evidence for cross-system halts: every permit revoked by a halt gets its own audit row,
-- and a halt that actually stopped work records what it stopped (counts only, no contents).
CREATE OR REPLACE FUNCTION public.jackboy_safety_halt()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p record; _code integer; _windows integer; _agents integer;
BEGIN
  FOR _p IN SELECT job_id, kind FROM public.jackboy_permits WHERE status = 'active' FOR UPDATE LOOP
    UPDATE public.jackboy_permits SET status = 'revoked', closed_at = now(),
           closed_reason = 'omni_halt', updated_at = now()
     WHERE job_id = _p.job_id;
    INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
      VALUES (NULL, 'permit_revoked_by_halt', 'jackboy_permit', _p.job_id::text);
  END LOOP;
  SELECT count(*) INTO _code FROM public.omni_code_jobs WHERE status IN ('leased', 'running');
  SELECT count(*) INTO _windows FROM public.omni_autonomy_windows WHERE ended_at IS NULL;
  SELECT count(*) INTO _agents FROM public.omni_agent_jobs
   WHERE origin = 'agent' AND status IN ('queued', 'running');
  PERFORM public.omni_code_halt('jackboy_safety', NULL);
  PERFORM public.omni_autonomy_end_all('jackboy_safety', NULL);
  UPDATE public.omni_code_jobs SET status = 'paused', lease_expires_at = NULL
   WHERE status IN ('queued', 'retry_wait');
  UPDATE public.omni_agent_jobs SET status = 'stopped', ended_at = now()
   WHERE origin = 'agent' AND status IN ('queued', 'running');
  IF _code + _windows + _agents > 0 THEN
    INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
      VALUES (NULL, 'omni_halt_stopped_work', 'jackboy_safety',
              format('code=%s windows=%s agent_jobs=%s', _code, _windows, _agents));
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.jackboy_safety_halt() FROM PUBLIC, anon, authenticated;