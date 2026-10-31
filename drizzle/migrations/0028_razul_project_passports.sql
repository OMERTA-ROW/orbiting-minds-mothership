create table public.razul_project_passports (
  id uuid primary key default gen_random_uuid(),
  project text not null unique,
  resident_agent text not null,
  purpose text not null default '',
  features text[] not null default '{}',
  architecture text not null default '',
  documentation_url text,
  permissions text[] not null default '{}',
  tools text[] not null default '{}',
  pending_tasks text[] not null default '{}',
  verified_tests text[] not null default '{}',
  status text not null default 'unknown',
  lessons text[] not null default '{}',
  version integer not null default 1,
  provenance text not null default 'owner',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.razul_project_passports to authenticated;
grant all on public.razul_project_passports to service_role;

alter table public.razul_project_passports enable row level security;

create policy "Approved readers view project passports"
  on public.razul_project_passports for select to authenticated
  using (public.is_knowledge_reader());

create or replace function public.razul_upsert_passport(
  _project text,
  _resident_agent text,
  _purpose text,
  _features text[],
  _architecture text,
  _documentation_url text,
  _permissions text[],
  _tools text[],
  _pending_tasks text[],
  _verified_tests text[],
  _status text,
  _lessons text[],
  _provenance text
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
    raise exception 'Only the owner or an admin can write a project passport';
  end if;
  insert into public.razul_project_passports as p (
    project, resident_agent, purpose, features, architecture, documentation_url,
    permissions, tools, pending_tasks, verified_tests, status, lessons, provenance
  ) values (
    left(_project, 80), left(_resident_agent, 80), left(_purpose, 2000),
    _features, left(_architecture, 2000), _documentation_url,
    _permissions, _tools, _pending_tasks, _verified_tests,
    left(_status, 40), _lessons, left(_provenance, 200)
  )
  on conflict (project) do update set
    resident_agent = excluded.resident_agent,
    purpose = excluded.purpose,
    features = excluded.features,
    architecture = excluded.architecture,
    documentation_url = excluded.documentation_url,
    permissions = excluded.permissions,
    tools = excluded.tools,
    pending_tasks = excluded.pending_tasks,
    verified_tests = excluded.verified_tests,
    status = excluded.status,
    lessons = excluded.lessons,
    provenance = excluded.provenance,
    version = p.version + 1,
    updated_at = now()
  returning id into _id;
  return _id;
end;
$$;

grant execute on function public.razul_upsert_passport(text, text, text, text[], text, text, text[], text[], text[], text[], text, text[], text) to authenticated;
