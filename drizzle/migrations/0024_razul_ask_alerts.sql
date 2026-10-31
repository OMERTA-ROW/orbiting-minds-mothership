-- RAZUL shared research service: Ask Razul query cache + privacy-safe query
-- log, proactive alert event bus, and Hercules subscription.

-- Hercules joins the agent feed subscriptions.
insert into public.razul_agent_feeds (agent, categories, min_relevance) values
  ('hercules', '{vulnerability,development,government-data,engineering,emerging-tech}', 45)
on conflict (agent) do nothing;

-- Ask Razul cache: one row per normalized question hash, 6-hour freshness.
create table public.razul_query_cache (
  question_hash text primary key,
  scope_key text not null default 'all',
  answer jsonb not null,
  created_at timestamptz not null default now()
);

-- Query log: hashes and counts only — never the raw question text.
create table public.razul_query_log (
  id uuid primary key default gen_random_uuid(),
  question_hash text not null,
  agent text not null,
  result_count integer not null default 0,
  cached boolean not null default false,
  created_at timestamptz not null default now()
);

-- Alert event bus: one row per finding x subscribed agent. Agents poll their
-- own events; read receipts are recorded with read_at.
create table public.razul_alert_events (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references public.razul_findings(id) on delete cascade,
  agent text not null,
  relevance integer not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (finding_id, agent)
);

grant select on public.razul_query_cache to authenticated;
grant select, insert on public.razul_query_log to authenticated;
grant select, update on public.razul_alert_events to authenticated;
grant all on public.razul_query_cache to service_role;
grant all on public.razul_query_log to service_role;
grant all on public.razul_alert_events to service_role;

alter table public.razul_query_cache enable row level security;
alter table public.razul_query_log enable row level security;
alter table public.razul_alert_events enable row level security;

create policy "Approved readers view query cache"
  on public.razul_query_cache for select to authenticated
  using (public.is_knowledge_reader());
create policy "Approved readers view query log"
  on public.razul_query_log for select to authenticated
  using (public.is_knowledge_reader());
create policy "Approved readers log queries"
  on public.razul_query_log for insert to authenticated
  with check (public.is_knowledge_reader());
create policy "Approved readers view alert events"
  on public.razul_alert_events for select to authenticated
  using (public.is_knowledge_reader());
create policy "Approved readers mark alerts read"
  on public.razul_alert_events for update to authenticated
  using (public.is_knowledge_reader())
  with check (public.is_knowledge_reader());