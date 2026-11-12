-- OMNI CODE supervised task queue and Mac folder organization records. Additive.
-- Everything starts OFF. Owner reads only; all writes go through the service after server-side
-- checks. The database also fails closed on its own: no lease while CODE always-on is off or
-- expired, Emergency Stop engaged, terminal disabled, the agent not enrolled, Jackboy, or an
-- unapproved file change.

CREATE TABLE public.omni_code_service (
  id smallint PRIMARY KEY CHECK (id = 1),
  always_on boolean NOT NULL DEFAULT false,
  always_on_until timestamptz,
  max_concurrent smallint NOT NULL DEFAULT 3 CHECK (max_concurrent BETWEEN 1 AND 5),
  max_per_agent smallint NOT NULL DEFAULT 2 CHECK (max_per_agent BETWEEN 1 AND 3),
  jobs_per_agent_hour smallint NOT NULL DEFAULT 20 CHECK (jobs_per_agent_hour BETWEEN 1 AND 60),
  idle_only boolean NOT NULL DEFAULT true,
  min_idle_minutes smallint NOT NULL DEFAULT 10 CHECK (min_idle_minutes BETWEEN 1 AND 240),
  window_start_hour smallint CHECK (window_start_hour BETWEEN 0 AND 23),
  window_end_hour smallint CHECK (window_end_hour BETWEEN 0 AND 23),
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.omni_code_service (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.omni_code_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  agent_id text NOT NULL REFERENCES public.omni_agents(id) CHECK (agent_id <> 'jackboy'),
  kind text NOT NULL CHECK (kind IN ('code_task','file_inventory','file_plan','file_apply','file_undo')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','leased','running','awaiting_approval','retry_wait','paused','succeeded','failed','stopped','cancelled')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  instructions text NOT NULL DEFAULT '' CHECK (char_length(instructions) <= 8000),
  destructive boolean NOT NULL DEFAULT false,
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts smallint NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 5),
  not_before timestamptz,
  lease_owner text CHECK (lease_owner IS NULL OR char_length(lease_owner) <= 80),
  lease_expires_at timestamptz,
  checkpoint text CHECK (checkpoint IS NULL OR char_length(checkpoint) <= 2000),
  approved_at timestamptz,
  approved_by uuid,
  plan_id uuid,
  cost_cents integer NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
  error text CHECK (error IS NULL OR char_length(error) <= 400),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE INDEX omni_code_jobs_ready ON public.omni_code_jobs (status, created_at);

CREATE TABLE public.omni_code_job_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.omni_code_jobs(id),
  agent_id text NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL CHECK (char_length(actor) <= 40),
  event text NOT NULL CHECK (char_length(event) <= 60),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.omni_mac_folder_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  device_id uuid,
  path text NOT NULL CHECK (char_length(path) <= 512 AND path ~ '^/Users/[^/]+/[^/].*[^/]$' AND path !~ '(^|/)\.\.?(/|$)'),
  mode text NOT NULL CHECK (mode IN ('read','organize')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE TABLE public.omni_file_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  grant_id uuid NOT NULL REFERENCES public.omni_mac_folder_grants(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','applying','applied','partially_applied','undoing','undone','rejected','expired')),
  ops jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  plan_sha256 text NOT NULL CHECK (plan_sha256 ~ '^[0-9a-f]{64}$'),
  confirmed_destructive integer[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid,
  applied_at timestamptz
);

CREATE TABLE public.omni_file_journal (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plan_id uuid NOT NULL REFERENCES public.omni_file_plans(id),
  op_index integer NOT NULL CHECK (op_index >= 0),
  undo boolean NOT NULL DEFAULT false,
  op jsonb NOT NULL,
  result text NOT NULL CHECK (result IN ('applied','skipped_changed','skipped_missing','failed')),
  trashed_to text CHECK (trashed_to IS NULL OR char_length(trashed_to) <= 512),
  at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['omni_code_service','omni_code_jobs','omni_code_job_events','omni_mac_folder_grants','omni_file_plans','omni_file_journal'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "Owner reads" ON public.%I FOR SELECT TO authenticated USING (public.is_razul_owner())', t);
  END LOOP;
END $$;

-- Append-only history.
CREATE TRIGGER omni_code_job_events_append_only BEFORE UPDATE OR DELETE ON public.omni_code_job_events
  FOR EACH ROW EXECUTE FUNCTION public.omni_append_only();
CREATE TRIGGER omni_code_job_events_no_truncate BEFORE TRUNCATE ON public.omni_code_job_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.omni_append_only();
CREATE TRIGGER omni_file_journal_append_only BEFORE UPDATE OR DELETE ON public.omni_file_journal
  FOR EACH ROW EXECUTE FUNCTION public.omni_append_only();
CREATE TRIGGER omni_file_journal_no_truncate BEFORE TRUNCATE ON public.omni_file_journal
  FOR EACH STATEMENT EXECUTE FUNCTION public.omni_append_only();

-- CODE always-on: renewable authorization of at most 24 hours, only while stop/kill switch allow.
CREATE OR REPLACE FUNCTION public.omni_code_service_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _stop boolean; _enabled boolean;
BEGIN
  IF NEW.always_on THEN
    IF NEW.always_on_until IS NULL OR NEW.always_on_until <= now() OR NEW.always_on_until > now() + interval '24 hours' THEN
      RAISE EXCEPTION 'CODE always-on needs an end time within 24 hours.';
    END IF;
    SELECT emergency_stop INTO _stop FROM public.omni_terminal_controls WHERE id = 1;
    IF _stop IS DISTINCT FROM false THEN RAISE EXCEPTION 'Emergency Stop is engaged or unreadable.'; END IF;
    SELECT terminal_enabled INTO _enabled FROM public.omni_workspace_settings WHERE id = 1;
    IF _enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'The terminal kill switch is off.'; END IF;
  END IF;
  NEW.changed_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.omni_code_service_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER omni_code_service_guard BEFORE INSERT OR UPDATE ON public.omni_code_service
  FOR EACH ROW EXECUTE FUNCTION public.omni_code_service_guard();

-- Leasing (status → leased/running) is refused unless every database-visible condition holds.
CREATE OR REPLACE FUNCTION public.omni_code_job_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _svc public.omni_code_service%ROWTYPE; _stop boolean; _enabled boolean; _status text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IN ('succeeded','failed','stopped','cancelled') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'A finished CODE job cannot be restarted.';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.status NOT IN ('queued','awaiting_approval') THEN
    RAISE EXCEPTION 'New CODE jobs start queued.';
  END IF;
  IF NEW.kind IN ('file_apply','file_undo') THEN NEW.destructive := true; END IF;
  IF NEW.status IN ('leased','running') AND (TG_OP = 'INSERT' OR OLD.status NOT IN ('leased','running')) THEN
    SELECT * INTO _svc FROM public.omni_code_service WHERE id = 1;
    IF NOT FOUND OR NOT _svc.always_on OR _svc.always_on_until IS NULL OR _svc.always_on_until <= now() THEN
      RAISE EXCEPTION 'CODE always-on is off or expired.';
    END IF;
    SELECT emergency_stop INTO _stop FROM public.omni_terminal_controls WHERE id = 1;
    IF _stop IS DISTINCT FROM false THEN RAISE EXCEPTION 'Emergency Stop is engaged or unreadable.'; END IF;
    SELECT terminal_enabled INTO _enabled FROM public.omni_workspace_settings WHERE id = 1;
    IF _enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'The terminal kill switch is off.'; END IF;
    SELECT status INTO _status FROM public.omni_agents WHERE id = NEW.agent_id;
    IF _status IS DISTINCT FROM 'enrolled' THEN RAISE EXCEPTION 'This agent is not enrolled.'; END IF;
    IF NEW.kind IN ('file_apply','file_undo') AND NEW.approved_at IS NULL THEN
      RAISE EXCEPTION 'This job changes files and needs owner approval first.';
    END IF;
    IF NEW.not_before IS NOT NULL AND NEW.not_before > now() THEN RAISE EXCEPTION 'Retry back-off has not elapsed.'; END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.omni_code_job_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER omni_code_job_guard BEFORE INSERT OR UPDATE ON public.omni_code_jobs
  FOR EACH ROW EXECUTE FUNCTION public.omni_code_job_guard();

-- Stop conditions: always-on off, active CODE jobs stopped (Emergency Stop / kill switch) or paused (agent pause).
CREATE OR REPLACE FUNCTION public.omni_code_halt(_reason text, _agent text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _agent IS NULL THEN
    UPDATE public.omni_code_service SET always_on = false, always_on_until = NULL WHERE id = 1 AND always_on;
    UPDATE public.omni_code_jobs SET status = 'stopped', lease_expires_at = NULL, ended_at = now(), error = _reason
      WHERE status IN ('leased','running');
  ELSE
    UPDATE public.omni_code_jobs SET status = 'paused', lease_expires_at = NULL
      WHERE agent_id = _agent AND status IN ('queued','leased','running','retry_wait');
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.omni_code_halt(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.omni_code_on_emergency_stop()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.omni_code_halt('emergency_stop', NULL); RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.omni_code_on_emergency_stop() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER omni_code_on_emergency_stop
  AFTER INSERT OR UPDATE OF emergency_stop ON public.omni_terminal_controls
  FOR EACH ROW WHEN (NEW.emergency_stop IS DISTINCT FROM false)
  EXECUTE FUNCTION public.omni_code_on_emergency_stop();

CREATE OR REPLACE FUNCTION public.omni_code_on_kill_switch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.omni_code_halt('kill_switch', NULL); RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.omni_code_on_kill_switch() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER omni_code_on_kill_switch
  AFTER INSERT OR UPDATE OF terminal_enabled ON public.omni_workspace_settings
  FOR EACH ROW WHEN (NEW.terminal_enabled IS DISTINCT FROM true)
  EXECUTE FUNCTION public.omni_code_on_kill_switch();

CREATE OR REPLACE FUNCTION public.omni_code_on_agent_pause()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.omni_code_halt('agent_paused', NEW.id); RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.omni_code_on_agent_pause() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER omni_code_on_agent_pause
  AFTER UPDATE OF status ON public.omni_agents
  FOR EACH ROW WHEN (NEW.status IS DISTINCT FROM 'enrolled')
  EXECUTE FUNCTION public.omni_code_on_agent_pause();

-- Folder grants: at most 30 days; path/mode/owner cannot be changed after creation; revocation is permanent.
CREATE OR REPLACE FUNCTION public.omni_folder_grant_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.expires_at <= now() OR NEW.expires_at > now() + interval '30 days' THEN
      RAISE EXCEPTION 'Folder permissions last 1 to 30 days.';
    END IF;
    IF NEW.path ~ '/(Library|Applications|\.ssh|\.gnupg|\.aws|\.config|\.kube|\.docker|\.Trash|\.omni-undo)(/|$)' OR NEW.path ~ '^/Users/Shared/' THEN
      RAISE EXCEPTION 'This folder cannot be granted.';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.path <> OLD.path OR NEW.mode <> OLD.mode OR NEW.owner_id <> OLD.owner_id OR NEW.expires_at > OLD.expires_at THEN
    RAISE EXCEPTION 'Folder permissions cannot be widened or extended; grant a new one.';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'Revocation is permanent.';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.omni_folder_grant_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER omni_folder_grant_guard BEFORE INSERT OR UPDATE ON public.omni_mac_folder_grants
  FOR EACH ROW EXECUTE FUNCTION public.omni_folder_grant_guard();

-- File plans: ops are frozen once created; approval needs an active organize grant and every
-- destructive op individually confirmed.
CREATE OR REPLACE FUNCTION public.omni_file_plan_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _g public.omni_mac_folder_grants%ROWTYPE; _i integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN RAISE EXCEPTION 'New plans start as drafts.'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.ops <> OLD.ops OR NEW.plan_sha256 <> OLD.plan_sha256 OR NEW.grant_id <> OLD.grant_id THEN
    RAISE EXCEPTION 'A plan cannot be edited; make a new dry run.';
  END IF;
  IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'Only a draft plan can be approved.'; END IF;
    SELECT * INTO _g FROM public.omni_mac_folder_grants WHERE id = NEW.grant_id;
    IF NOT FOUND OR _g.revoked_at IS NOT NULL OR _g.expires_at <= now() OR _g.mode <> 'organize' THEN
      RAISE EXCEPTION 'The folder permission is not active for organizing.';
    END IF;
    FOR _i IN SELECT (e.ord - 1)::int FROM jsonb_array_elements(NEW.ops) WITH ORDINALITY AS e(op, ord)
      WHERE e.op->>'kind' IN ('overwrite','trash') LOOP
      IF NOT (_i = ANY (NEW.confirmed_destructive)) THEN
        RAISE EXCEPTION 'Step % needs its own confirmation.', _i + 1;
      END IF;
    END LOOP;
    IF NEW.approved_at IS NULL OR NEW.approved_by IS NULL THEN RAISE EXCEPTION 'Approval needs an approver and time.'; END IF;
  END IF;
  IF NEW.status = 'applying' AND OLD.status NOT IN ('approved','applying') THEN
    RAISE EXCEPTION 'Only an approved plan can be applied.';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.omni_file_plan_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER omni_file_plan_guard BEFORE INSERT OR UPDATE ON public.omni_file_plans
  FOR EACH ROW EXECUTE FUNCTION public.omni_file_plan_guard();