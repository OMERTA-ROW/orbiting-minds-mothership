-- The terminal tables are owner-only; remove the hosted default grants to signed-out visitors.
REVOKE ALL ON public.omni_terminal_controls FROM anon;
REVOKE ALL ON public.omni_terminal_tasks FROM anon;
REVOKE ALL ON public.omni_terminal_log FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.omni_terminal_controls FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.omni_terminal_tasks FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.omni_terminal_log FROM authenticated;
