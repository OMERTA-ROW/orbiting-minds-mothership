create or replace function public.razul_increment_corroboration(_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.razul_findings
  set corroborations = corroborations + 1
  where url = _url;
end;
$$;

revoke all on function public.razul_increment_corroboration(text) from public, anon, authenticated;