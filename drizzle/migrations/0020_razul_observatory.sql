-- RAZUL Internet Observatory: source registry, findings, run history, owner controls.
-- Public sources only; private project events never enter these tables.

create table public.razul_sources (
  id text primary key,
  name text not null,
  url text not null unique,
  kind text not null,
  category text not null,
  terms_note text not null,
  active boolean not null default true,
  added_at timestamptz not null default now()
);

create table public.razul_findings (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.razul_sources(id),
  source_name text not null,
  title text not null,
  url text not null unique,
  summary text not null default '',
  category text not null,
  relevance integer not null default 0,
  corroborations integer not null default 1,
  routed_to text[] not null default '{}',
  published_at timestamptz,
  collected_at timestamptz not null default now(),
  run_id uuid
);

create table public.razul_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  fetched integer not null default 0,
  inserted integer not null default 0,
  duplicates integer not null default 0,
  alerts integer not null default 0,
  source_errors jsonb not null default '[]'
);

create table public.razul_job_state (
  id integer primary key default 1 check (id = 1),
  lease_owner text,
  lease_until timestamptz,
  paused_reason text,
  paused_at timestamptz,
  alert_threshold integer not null default 40,
  retention_days integer not null default 90,
  coverage text[] not null default '{ai-model,vulnerability,development,research}',
  blocked_sources text[] not null default '{}',
  updated_at timestamptz not null default now()
);

insert into public.razul_job_state (id) values (1);

-- Small real starting source set: official public feeds only.
insert into public.razul_sources (id, name, url, kind, category, terms_note) values
  ('cisa-alerts', 'CISA Cybersecurity Alerts', 'https://www.cisa.gov/uscert/ncas/alerts.xml', 'rss', 'vulnerability', 'US government public alert feed; attribution retained.'),
  ('github-security-blog', 'GitHub Security Blog', 'https://github.blog/security/feed/', 'rss', 'vulnerability', 'Public engineering blog feed; standard feed terms.'),
  ('openai-news', 'OpenAI News', 'https://openai.com/news/rss.xml', 'rss', 'ai-model', 'Public announcements feed; standard feed terms.'),
  ('arxiv-cs-ai', 'arXiv cs.AI', 'https://arxiv.org/rss/cs.AI', 'rss', 'research', 'arXiv public RSS; rate-limited single fetch per run, attribution retained.');

grant select on public.razul_sources to authenticated;
grant select on public.razul_findings to authenticated;
grant select on public.razul_runs to authenticated;
grant select on public.razul_job_state to authenticated;
grant all on public.razul_sources to service_role;
grant all on public.razul_findings to service_role;
grant all on public.razul_runs to service_role;
grant all on public.razul_job_state to service_role;

alter table public.razul_sources enable row level security;
alter table public.razul_findings enable row level security;
alter table public.razul_runs enable row level security;
alter table public.razul_job_state enable row level security;

-- Read access follows the same approved-reader gate as the knowledge collector.
create policy "Approved readers view observatory sources"
  on public.razul_sources for select to authenticated
  using (public.is_knowledge_reader());
create policy "Approved readers view observatory findings"
  on public.razul_findings for select to authenticated
  using (public.is_knowledge_reader());
create policy "Approved readers view observatory runs"
  on public.razul_runs for select to authenticated
  using (public.is_knowledge_reader());
create policy "Approved readers view observatory state"
  on public.razul_job_state for select to authenticated
  using (public.is_knowledge_reader());

create or replace function public.claim_owned_razul_lease(_owner text, _minutes integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.razul_job_state
  set lease_owner = _owner,
      lease_until = now() + make_interval(mins => _minutes)
  where id = 1
    and (lease_until is null or lease_until < now() or lease_owner = _owner);
  return found;
end;
$$;

create or replace function public.release_owned_razul_lease(_owner text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.razul_job_state
  set lease_owner = null, lease_until = null
  where id = 1 and lease_owner = _owner;
  return found;
end;
$$;

-- Owner controls: pause/resume and coverage configuration. Owner or admin only.
create or replace function public.razul_pause(_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.caller_role() not in ('owner', 'admin') then
    raise exception 'Only the owner or an admin can pause the observatory';
  end if;
  update public.razul_job_state
  set paused_reason = left(coalesce(nullif(_reason, ''), 'Paused by owner'), 200),
      paused_at = now(),
      updated_at = now()
  where id = 1;
end;
$$;

create or replace function public.razul_resume()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.caller_role() not in ('owner', 'admin') then
    raise exception 'Only the owner or an admin can resume the observatory';
  end if;
  update public.razul_job_state
  set paused_reason = null, paused_at = null, updated_at = now()
  where id = 1;
end;
$$;

create or replace function public.razul_configure(
  _threshold integer,
  _retention_days integer,
  _coverage text[],
  _blocked_sources text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.caller_role() not in ('owner', 'admin') then
    raise exception 'Only the owner or an admin can configure the observatory';
  end if;
  update public.razul_job_state
  set alert_threshold = greatest(0, least(100, coalesce(_threshold, alert_threshold))),
      retention_days = greatest(7, least(365, coalesce(_retention_days, retention_days))),
      coverage = coalesce(_coverage, coverage),
      blocked_sources = coalesce(_blocked_sources, blocked_sources),
      updated_at = now()
  where id = 1;
end;
$$;

revoke all on function public.claim_owned_razul_lease(text, integer) from public, anon, authenticated;
revoke all on function public.release_owned_razul_lease(text) from public, anon, authenticated;
grant execute on function public.razul_pause(text) to authenticated;
grant execute on function public.razul_resume() to authenticated;
grant execute on function public.razul_configure(integer, integer, text[], text[]) to authenticated;