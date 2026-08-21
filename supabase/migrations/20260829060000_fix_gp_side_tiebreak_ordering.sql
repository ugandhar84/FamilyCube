-- Live-DB QA verification found a client/server ordering divergence in how
-- "parents[0]" vs "parents[1]" (maternal/paternal side) is derived: the
-- client's members fetch orders by created_at (store/familyStore.ts), while
-- is_chat_channel_participant (migration 20260829040000) ordered by id asc
-- only. Two parents created in the same request/batch — plausible during
-- family onboarding — can share an identical created_at with no ordering
-- guarantee from Postgres on ties alone; when that happens, the client and
-- server could each independently pick a different parent as "side A,"
-- meaning a grandparent's channel tab (client-filtered) could disagree with
-- what the server RLS actually allows.
--
-- Fixed at both ends to agree: the client's fetch (store/familyStore.ts)
-- now adds a secondary .order('id') tiebreak; this migration makes the RLS
-- function order by the SAME two-column key (created_at, then id) instead
-- of id alone, so both sides resolve ties identically.
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
    -- Same ordering key the client's members fetch uses (created_at, then
    -- id as a tiebreak) so both sides agree on which parent is "a" vs "b".
    select id into parent_a_id from public.members
      where family_id = caller_family_id and role = 'parent'
      order by created_at asc, id asc limit 1;
    select id into parent_b_id from public.members
      where family_id = caller_family_id and role = 'parent'
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
$$;

comment on function public.is_chat_channel_participant(text) is
  'Server-side channel-participation check backing chat_messages/chat_channels RLS. seniors_a/seniors_b are side-restricted per grandparent, ordered by (created_at, id) to match the client — see migrations 20260829040000 and 20260829060000.';
