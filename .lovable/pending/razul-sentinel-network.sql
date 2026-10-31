-- RAZUL Sentinel network: enrolled-project connectors with expiring scoped
-- credentials, an append-only event store, and a Guardian-gated dispatch queue
-- for AngelTech scouts and DemonTech defensive inspectors. Default deny: while
-- the Guardian policy engine is unavailable, dispatches stay blocked.

create table public.razul_sentinels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  scopes text[] not null default '{}',
  token_hash text not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  expires_at timestamptz not null,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.razul_sentinel_events (
  id uuid primary key default gen_random_uuid(),
  sentinel_id uuid not null references public.razul_sentinels(id) on delete cascade,
  kind text not null check (kind in ('health', 'diagnostic', 'release', 'feedback', 'project-event')),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table public.razul_dispatch_queue (
  id uuid primary key default gen_random_uuid(),
  sentinel_id uuid not null references public.razul_sentinels(id) on delete cascade,
  scout_type text not null check (scout_type in ('angeltech', 'demontech')),
  task text not null,
  status text not null default 'blocked-guardian' check (status in ('blocked-guardian', 'queued', 'claimed', 'done', 'failed', 'cancelled')),
  guardian_status text not null default 'unavailable',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.razul_sentinels to authenticated;
grant select on public.razul_sentinel_events to authenticated;
grant select on public.razul_dispatch_queue to authenticated;
grant all on public.razul_sentinels to service_role;
grant all on public.razul_sentinel_events to service_role;
grant all on public.razul_dispatch_queue to service_role;

alter table public.razul_sentinels enable row level security;
alter table public.razul_sentinel_events enable row level security;
alter table public.razul_dispatch_queue enable row level security;

create policy "Approved readers view sentinels"
  on public.razul_sentinels for select to authenticated
  using (public.is_knowledge_reader());
create policy "Approved readers view sentinel events"
  on public.razul_sentinel_events for select to authenticated
  using (public.is_knowledge_reader());
create policy "Approved readers view dispatch queue"
  on public.razul_dispatch_queue for select to authenticated
  using (public.is_knowledge_reader());

-- Owner/admin enrollment: stores only the credential hash, with an expiry.
create or replace function public.razul_enroll_sentinel(
  _name text,
  _scopes text[],
  _token_hash text,
  _hours integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _id uuid;
begin
  if public.caller_role() not in ('owner', 'admin') then
    raise exception 'Only the owner or an admin can enroll a sentinel';
  end if;
  insert into public.razul_sentinels (name, scopes, token_hash, expires_at)
  values (
    left(_name, 80),
    (select array_agg(distinct s) from unnest(_scopes) s
     where s in ('health', 'diagnostic', 'release', 'feedback', 'project-event')),
    _token_hash,
    now() + make_interval(hours => greatest(1, least(_hours, 24 * 90)))
  )
  returning id into _id;
  return _id;
end;
$$;

create or replace function public.razul_revoke_sentinel(_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.caller_role() not in ('owner', 'admin') then
    raise exception 'Only the owner or an admin can revoke a sentinel';
  end if;
  update public.razul_sentinels set status = 'revoked' where id = _id;
end;
$$;

-- Sentinel authentication: hash match, active, unexpired, kind within scope.
-- Service-role only; the report route calls it with the admin client.
create or replace function public.razul_sentinel_verify(
  _id uuid,
  _token_hash text,
  _kind text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _ok boolean;
begin
  select exists (
    select 1 from public.razul_sentinels
    where id = _id
      and token_hash = _token_hash
      and status = 'active'
      and expires_at > now()
      and _kind = any (scopes)
  ) into _ok;
  if _ok then
    update public.razul_sentinels set last_seen_at = now() where id = _id;
  end if;
  return _ok;
end;
$$;

-- Dispatch a scout to an enrolled sentinel. Guardian is not connected, so
-- every dispatch is recorded as blocked-guardian (default deny); nothing is
-- ever queued for execution without a real Guardian approval.
create or replace function public.razul_dispatch_scout(
  _sentinel_id uuid,
  _scout_type text,
  _task text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _id uuid;
begin
  if public.caller_role() not in ('owner', 'admin') then
    raise exception 'Only the owner or an admin can dispatch scouts';
  end if;
  if not exists (
    select 1 from public.razul_sentinels
    where id = _sentinel_id and status = 'active' and expires_at > now()
  ) then
    raise exception 'Sentinel is not enrolled, active, and unexpired';
  end if;
  insert into public.razul_dispatch_queue (sentinel_id, scout_type, task, created_by)
  values (_sentinel_id, _scout_type, left(_task, 500), auth.uid())
  returning id into _id;
  return _id;
end;
$$;

revoke all on function public.razul_sentinel_verify(uuid, text, text) from public, anon, authenticated;
grant execute on function public.razul_enroll_sentinel(text, text[], text, integer) to authenticated;
grant execute on function public.razul_revoke_sentinel(uuid) to authenticated;
grant execute on function public.razul_dispatch_scout(uuid, text, text) to authenticated;
