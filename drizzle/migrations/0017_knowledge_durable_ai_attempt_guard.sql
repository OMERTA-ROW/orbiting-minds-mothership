ALTER TABLE public.knowledge_job_state ADD COLUMN brief_attempt_pending boolean NOT NULL DEFAULT false;
ALTER TABLE public.knowledge_job_state ADD COLUMN brief_attempt_run uuid;
ALTER TABLE public.knowledge_job_state ADD COLUMN brief_attempt_date date;
COMMENT ON COLUMN public.knowledge_job_state.brief_attempt_pending IS 'Service-only durable pre-provider guard. An unresolved request blocks automatic AI across runs/dates until its outcome is persisted or owner explicitly confirms recovery. Feed retrieval may continue.';