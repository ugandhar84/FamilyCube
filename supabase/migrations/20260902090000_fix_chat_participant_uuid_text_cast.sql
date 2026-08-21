-- User-reported: sending a chat message (including Ask Cube's meal-share
-- to the 'all' group channel) failed with "operator does not exist: uuid =
-- text", caught by chatStore's own catch-all and silently queued offline
-- instead of actually sending. Traced to is_chat_channel_participant's
-- seniors_a/seniors_b branch: caller_family_id is declared text, but
-- members.family_id is uuid — `where family_id = caller_family_id` has no
-- cast. Even though a message to 'all' should short-circuit on an earlier
-- branch before ever reaching this comparison, STABLE PL/pgSQL functions
-- can have every branch type-checked at parse/plan time regardless of
-- which one actually executes, so the type mismatch can still surface as
-- a real runtime error for callers who never take that branch. Same fix
-- pattern already used elsewhere in this function (::text casts) and by
-- every other family_id comparison in this codebase's RLS layer.
create or replace function public.is_chat_channel_participant(p_channel_id text)
returns boolean
language plpgsql
stable security definer
set search_path = 'public'
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
  select m.id, m.role, m.family_id::text, m.linked_parent_id
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
$$;
