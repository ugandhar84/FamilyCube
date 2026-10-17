-- One shared grandparent channel (seniors_all) for every grandparent plus the whole family.
-- Same function as 20261017070000; only the seniors_all rule changes (any family member may take part).
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

  if p_channel_id = 'seniors_all' then
    return true;
  end if;

  if p_channel_id in ('parents', 'seniors_a', 'seniors_b') then
    return caller_role in ('parent', 'grandparent');
  end if;

  if p_channel_id = 'all' then
    return caller_role is distinct from 'grandparent';
  end if;

  return true;
end;
$$;
