-- A parent switching into a kid/teen profile on a shared phone no longer needs the child's PIN. For a child with their own login the
-- server still needs a per-device grant for that child, which used to come only from the PIN check. This hands one to a parent:
-- the CALLER (the active member) must be a parent in the same family as the child, and the target must be a child/teen.
create or replace function public.parent_grant_child_session(p_child_id text, p_device_id text default null)
returns table(grant_token text, grant_expires_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_caller text := public.resolve_active_member_id();
  v_token text;
  v_expires timestamptz;
  v_device text := coalesce(p_device_id, '__legacy_unscoped__');
begin
  if v_caller is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.members p
    join public.members c on c.family_id = p.family_id
    where p.id = v_caller and p.role = 'parent'
      and c.id = p_child_id and c.role in ('child', 'teenager', 'kid', 'teen')
  ) then
    raise exception 'Only a parent can open a child profile this way' using errcode = '42501';
  end if;
  v_token := encode(extensions.gen_random_bytes(24), 'base64');
  v_expires := now() + interval '30 days';
  insert into public.member_grant_tokens (member_id, device_id, grant_token, expires_at, updated_at)
    values (p_child_id, v_device, v_token, v_expires, now())
    on conflict (member_id, device_id) do update
      set grant_token = excluded.grant_token, expires_at = excluded.expires_at, updated_at = now();
  return query select v_token, v_expires;
end;
$function$;
revoke all on function public.parent_grant_child_session(text, text) from public;
grant execute on function public.parent_grant_child_session(text, text) to authenticated;
