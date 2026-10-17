-- Records when a member opens the app and hands back the PREVIOUS time, so the Home header can say "Last login ...".
-- Only the active member (resolve_active_member_id) can touch their own row.
create or replace function public.touch_member_login(p_member_id text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare prev timestamptz;
begin
  if public.resolve_active_member_id() is distinct from p_member_id then
    raise exception 'not the active member';
  end if;
  select last_active into prev from public.members where id = p_member_id;
  update public.members set last_active = now() where id = p_member_id;
  return prev;
end;
$$;
revoke all on function public.touch_member_login(text) from public, anon;
grant execute on function public.touch_member_login(text) to authenticated;
