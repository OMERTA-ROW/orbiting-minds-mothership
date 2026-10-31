-- Each enrolled sentinel is also a registered provenance source so its
-- findings satisfy the razul_findings source foreign key.
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
  insert into public.razul_sources (id, name, url, kind, category, terms_note, active)
  values (
    'sentinel:' || _id,
    'Sentinel: ' || left(_name, 80),
    'sentinel://' || _id,
    'sentinel',
    'project-operations',
    'Owner-enrolled project sentinel; scoped credential reports only.',
    true
  );
  return _id;
end;
$$;
