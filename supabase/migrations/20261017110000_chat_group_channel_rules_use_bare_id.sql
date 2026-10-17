-- QA finding: group channel ids are stored family-scoped ('<familyId>::parents'), but this function compared the bare id,
-- so the parents-only and grandparent rules never matched and every family member could read and post in every group
-- channel. Strip the family prefix before comparing.
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
  bare_id text := case when position('::' in p_channel_id) > 0 then substring(p_channel_id from position('::' in p_channel_id) + 2) else p_channel_id end;
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

  if bare_id = 'seniors_all' then
    return true;
  end if;

  if bare_id in ('parents', 'seniors_a', 'seniors_b') then
    return caller_role in ('parent', 'grandparent');
  end if;

  if bare_id = 'all' then
    return caller_role is distinct from 'grandparent';
  end if;

  return true;
end;
$$;
