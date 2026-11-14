-- Jackboy safety halt also stops agent-initiated (autonomous) workspace jobs.
-- Owner-initiated (manual terminal) jobs and sessions are not touched.
CREATE OR REPLACE FUNCTION public.jackboy_safety_halt()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.omni_code_halt('jackboy_safety', NULL);
  PERFORM public.omni_autonomy_end_all('jackboy_safety', NULL);
  UPDATE public.omni_code_jobs SET status = 'paused', lease_expires_at = NULL
   WHERE status IN ('queued', 'retry_wait');
  UPDATE public.omni_agent_jobs SET status = 'stopped', ended_at = now()
   WHERE origin = 'agent' AND status IN ('queued', 'running');
END $$;
REVOKE ALL ON FUNCTION public.jackboy_safety_halt() FROM PUBLIC, anon, authenticated;
