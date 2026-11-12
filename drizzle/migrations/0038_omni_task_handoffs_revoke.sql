REVOKE ALL ON public.omni_task_handoffs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.omni_task_handoffs FROM authenticated;
REVOKE ALL ON FUNCTION public.omni_stop_engaged() FROM anon;