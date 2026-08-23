-- Live-repro'd, TWO bugs in this function found in sequence:
--
-- 1. "op ANY/ALL (array) requires array on right side" (SQLSTATE 42809) —
--    chat_channels.member_ids is jsonb, but the dm_% branch used
--    `caller_id = any(cc.member_ids)`, native array syntax against jsonb.
--    Fixed to `cc.member_ids @> to_jsonb(caller_id)`.
--
-- 2. After (1) was fixed, real sends still failed RLS (42501) — because
--    this function ALSO still had the id-splitting fallback
--    (`string_to_array(p_channel_id, '_')`) the ORIGINAL chat-outage
--    incident (much earlier this session) diagnosed as unsafe and said
--    should be removed entirely: real member ids contain both underscores
--    (`m_1786235893879`) and hyphens (`62ac7da2-3f21-...`), confirmed live
--    against actual chat_channels.member_ids rows — splitting the composite
--    channel id on `_` fractures a genuine participant's own id into
--    fragments that never match. That fix targeted a different function
--    (ensureDmChannelRow's RLS path) and never touched this one, so the
--    same unsafe pattern survived here untouched until now. Participation
--    is checked SOLELY against the stored chat_channels.member_ids row,
--    never by re-deriving it from the channel id string.
create or replace function public.is_chat_channel_participant(p_channel_id text)
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  caller_id text;
  caller_role text;
  caller_family_id text;
  parent_a_id text;
  parent_b_id text;
  caller_linked_parent_id text;
begin
  select m.id, m.role, m.family_id::text, m.linked_parent_id
    into caller_id, caller_role, caller_family_id, caller_linked_parent_id
  from public.members m
  where m.auth_user_id = auth.uid()
  limit 1;

  if caller_id is null then
    return false;
  end if;

  if p_channel_id like 'dm\_%' escape '\' then
    return exists (
      select 1 from public.chat_channels cc
      where cc.id = p_channel_id
        and cc.member_ids @> to_jsonb(caller_id)
    );
  end if;

  if p_channel_id in ('seniors_a', 'seniors_b') then
    if caller_role = 'parent' then
      return true; -- parents coordinate across both sides
    end if;
    if caller_role <> 'grandparent' then
      return false;
    end if;
    -- Same ordering key the client's members fetch uses (created_at, then
    -- id as a tiebreak) so both sides agree on which parent is "a" vs "b".
    select id into parent_a_id from public.members
      where family_id::text = caller_family_id and role = 'parent'
      order by created_at asc, id asc limit 1;
    select id into parent_b_id from public.members
      where family_id::text = caller_family_id and role = 'parent'
      order by created_at asc, id asc offset 1 limit 1;
    if caller_linked_parent_id is null then
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

  return true;
end;
$function$;
