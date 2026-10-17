-- DMs failed on shared devices (the wall kiosk, and any phone where several people PIN-switch under one login).
-- is_chat_channel_participant looked up the caller as "the member whose auth_user_id = auth.uid()", i.e. the device
-- OWNER, not the person actually using the app. A kid's DM channel lists the kid and the other person in member_ids,
-- so with a parent's session the check said "owner is not in this channel" and every DM read/write was refused,
-- while family channels (no per-member check) kept working. Resolve the ACTIVE member the same way every other
-- identity check does (resolve_active_member_id), falling back to the auth-user match when no header is present.
create or replace function public.is_chat_channel_participant(p_channel_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller_id text;
  caller_role text;
begin
  caller_id := public.resolve_active_member_id();
  if caller_id is not null then
    select m.role into caller_role from public.members m where m.id = caller_id;
  else
    select m.id, m.role into caller_id, caller_role
    from public.members m
    where m.auth_user_id = auth.uid()
    limit 1;
  end if;

  if caller_id is null then
    return false;
  end if;

  if p_channel_id like 'dm\_%' escape '\' or p_channel_id like 'couple\_%' escape '\' then
    return exists (
      select 1 from public.chat_channels cc
      where cc.id = p_channel_id and cc.member_ids @> to_jsonb(caller_id)
    );
  end if;

  if p_channel_id in ('parents', 'seniors_a', 'seniors_b', 'seniors_all') then
    return caller_role in ('parent', 'grandparent');
  end if;

  if p_channel_id = 'all' then
    return caller_role is distinct from 'grandparent';
  end if;

  return true;
end;
$$;
