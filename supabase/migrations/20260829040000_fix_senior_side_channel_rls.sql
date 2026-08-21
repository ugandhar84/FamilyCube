-- Live-DB QA audit (grandparent-role agent) found is_chat_channel_participant
-- (migration 20260824020000) grants ANY grandparent full read/write on BOTH
-- seniors_a and seniors_b — the maternal/paternal split channels — with no
-- side check at all. A maternal grandparent could read/post in the paternal
-- side's private channel (and vice versa) via a direct API call, defeating
-- the entire purpose of the side split (mirrored the same bug in the
-- client-side filter in ChatScreen.tsx, fixed separately in the app code).
-- Side is derived from members.linked_parent_id → whichever of the family's
-- (at most 2) parent rows that GP is linked to, same derivation
-- buildGroupChannels() uses client-side.
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
  caller_family_id text;
  parts text[];
  parent_a_id text;
  parent_b_id text;
  caller_linked_parent_id text;
begin
  select m.id, m.role, m.family_id, m.linked_parent_id
    into caller_id, caller_role, caller_family_id, caller_linked_parent_id
  from public.members m
  where m.auth_user_id = auth.uid()
  limit 1;

  if caller_id is null then
    return false;
  end if;

  if p_channel_id like 'dm\_%' escape '\' then
    parts := string_to_array(substring(p_channel_id from 4), '_');
    return caller_id = any(parts) or exists (
      select 1 from public.chat_channels cc
      where cc.id = p_channel_id and caller_id = any(cc.member_ids)
    );
  end if;

  if p_channel_id in ('seniors_a', 'seniors_b') then
    if caller_role = 'parent' then
      return true; -- parents coordinate across both sides
    end if;
    if caller_role <> 'grandparent' then
      return false;
    end if;
    -- Determine this family's parent[0]/parent[1] ordering the same way
    -- buildGroupChannels() does client-side — stable by id so both sides
    -- agree on which parent is "a" vs "b".
    select id into parent_a_id from public.members
      where family_id = caller_family_id and role = 'parent'
      order by id asc limit 1;
    select id into parent_b_id from public.members
      where family_id = caller_family_id and role = 'parent'
      order by id asc offset 1 limit 1;
    if caller_linked_parent_id is null then
      -- Unlinked GP folds into seniors_a only (matches buildGroupChannels'
      -- own fallback), never seniors_b.
      return p_channel_id = 'seniors_a';
    end if;
    if p_channel_id = 'seniors_a' then
      return caller_linked_parent_id = parent_a_id;
    else
      return caller_linked_parent_id = parent_b_id;
    end if;
  end if;

  if p_channel_id in ('parents', 'seniors_all') then
    return caller_role in ('parent', 'grandparent');
  end if;

  if p_channel_id = 'all' then
    return caller_role is distinct from 'grandparent';
  end if;

  -- Unrecognized channel id — don't newly restrict something this policy
  -- hasn't specifically reasoned about; family-membership check (already
  -- applied by the surrounding policy qual) still applies.
  return true;
end;
$$;

comment on function public.is_chat_channel_participant(text) is
  'Server-side channel-participation check backing chat_messages/chat_channels RLS. seniors_a/seniors_b are side-restricted per grandparent — see migration 20260829040000.';
