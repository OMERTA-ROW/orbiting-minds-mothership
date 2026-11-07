CREATE TABLE public.omni_passkeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  credential_id text NOT NULL UNIQUE,
  public_key text NOT NULL,
  counter bigint NOT NULL DEFAULT 0,
  transports text[] NOT NULL DEFAULT '{}',
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  rp_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE TABLE public.omni_passkey_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('register','assert')),
  purpose text NOT NULL CHECK (purpose IN ('register','open','session','kill_switch','autonomy','approval','agent')),
  challenge text NOT NULL,
  rp_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  confirmed_at timestamptz,
  used_at timestamptz
);
CREATE TABLE public.omni_workspace_settings (
  id smallint PRIMARY KEY CHECK (id = 1),
  terminal_enabled boolean NOT NULL DEFAULT false,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text
);
CREATE TABLE public.omni_agents (
  id text PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9-]{1,31}$'),
  display_name text NOT NULL,
  model text,
  link_kind text NOT NULL,
  status text NOT NULL DEFAULT 'paused' CHECK (status IN ('enrolled','paused','revoked')),
  allowed_actions text[] NOT NULL DEFAULT '{}',
  budget_task_cents integer NOT NULL DEFAULT 0 CHECK (budget_task_cents BETWEEN 0 AND 100),
  budget_day_cents integer NOT NULL DEFAULT 0 CHECK (budget_day_cents BETWEEN 0 AND 500),
  budget_total_cents integer NOT NULL DEFAULT 0 CHECK (budget_total_cents BETWEEN 0 AND 1000),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.omni_workspace_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  agent_id text NOT NULL REFERENCES public.omni_agents(id),
  sandbox_id text,
  sandbox_name text,
  model text,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  end_reason text CHECK (end_reason IN ('owner','timeout','max_age','kill_switch','emergency_stop','error','agent_stop'))
);
CREATE TABLE public.omni_autonomy_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  agent_id text NOT NULL REFERENCES public.omni_agents(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ended_at timestamptz,
  end_reason text,
  CHECK (expires_at > started_at AND expires_at <= started_at + interval '60 minutes')
);
CREATE UNIQUE INDEX omni_autonomy_one_open ON public.omni_autonomy_windows(agent_id) WHERE ended_at IS NULL;
CREATE TABLE public.omni_agent_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL REFERENCES public.omni_agents(id),
  session_id uuid NOT NULL REFERENCES public.omni_workspace_sessions(id),
  kind text NOT NULL CHECK (kind IN ('chat','command')),
  origin text NOT NULL CHECK (origin IN ('owner','agent')),
  input text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed','stopped')),
  cost_cents integer NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
  cursor text,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE TABLE public.omni_agent_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.omni_agent_jobs(id),
  agent_id text NOT NULL REFERENCES public.omni_agents(id),
  session_id uuid NOT NULL,
  remote_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('plan','diff','command','result','message','output')),
  status text NOT NULL CHECK (status IN ('pending_approval','approved','rejected','done','failed')),
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 16384),
  stream text CHECK (stream IN ('stdout','stderr','system')),
  exit_code integer,
  cost_cents integer NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
  model text,
  body_sha256 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  UNIQUE (job_id, remote_id)
);
CREATE TABLE public.omni_workspace_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL REFERENCES public.omni_agents(id),
  session_id uuid NOT NULL,
  job_id uuid NOT NULL REFERENCES public.omni_agent_jobs(id),
  remote_id text NOT NULL,
  action_kind text NOT NULL CHECK (action_kind IN ('merge','deploy','publish','secrets','github_permissions','network')),
  description text NOT NULL CHECK (char_length(description) <= 2000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid,
  UNIQUE (job_id, remote_id)
);
CREATE TABLE public.omni_spend_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agent_id text NOT NULL REFERENCES public.omni_agents(id),
  session_id uuid,
  job_id uuid,
  cents integer NOT NULL CHECK (cents >= 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.omni_workspace_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL,
  agent_id text,
  session_id uuid,
  job_id uuid,
  event text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_sha256 text,
  output_head text CHECK (output_head IS NULL OR char_length(output_head) <= 4096)
);
CREATE INDEX omni_workspace_audit_agent ON public.omni_workspace_audit(agent_id, at DESC);
CREATE INDEX omni_agent_jobs_agent ON public.omni_agent_jobs(agent_id, created_at DESC);
CREATE INDEX omni_spend_ledger_agent ON public.omni_spend_ledger(agent_id, created_at);

CREATE OR REPLACE FUNCTION public.omni_append_only() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Append-only record: % is not allowed', TG_OP;
END $$;
CREATE TRIGGER omni_workspace_audit_append_only BEFORE UPDATE OR DELETE ON public.omni_workspace_audit
  FOR EACH ROW EXECUTE FUNCTION public.omni_append_only();
CREATE TRIGGER omni_workspace_audit_no_truncate BEFORE TRUNCATE ON public.omni_workspace_audit
  FOR EACH STATEMENT EXECUTE FUNCTION public.omni_append_only();
CREATE TRIGGER omni_spend_ledger_append_only BEFORE UPDATE OR DELETE ON public.omni_spend_ledger
  FOR EACH ROW EXECUTE FUNCTION public.omni_append_only();
CREATE TRIGGER omni_spend_ledger_no_truncate BEFORE TRUNCATE ON public.omni_spend_ledger
  FOR EACH STATEMENT EXECUTE FUNCTION public.omni_append_only();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['omni_passkeys','omni_passkey_checks','omni_workspace_settings','omni_agents',
    'omni_workspace_sessions','omni_autonomy_windows','omni_agent_jobs','omni_agent_steps',
    'omni_workspace_approvals','omni_spend_ledger','omni_workspace_audit'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "Owner reads" ON public.%I FOR SELECT TO authenticated USING (public.is_razul_owner())', t);
  END LOOP;
END $$;
-- Challenges are never exposed to the browser.
REVOKE SELECT ON public.omni_passkey_checks FROM authenticated;

INSERT INTO public.omni_agents (id, display_name, model, link_kind, status)
VALUES ('omni', 'OMNI', NULL, 'omni.workspace/v1 (secure link)', 'paused'),
       ('jackboy', 'Jackboy', NULL, 'omni.link/v2 (existing Jackboy link identity)', 'paused');