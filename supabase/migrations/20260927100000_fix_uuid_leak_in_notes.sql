-- Same UUID-in-note bug as reassign_chore (20260927090000): propose_kid_chore
-- and offer_chore_handoff both baked a raw member UUID directly into
-- activity_log.note via format('...%s...', p_member_id) — ChoreHistorySheet.tsx
-- renders row.note verbatim with no resolution, so a parent's History sheet
-- showed a meaningless hex string instead of a name. Both fixed to resolve
-- the name via a join first, same pattern as reassign_chore's own fix.
create or replace function public.propose_kid_chore(
  p_family_id uuid, p_proposer_id text, p_for_member_id text,
  p_title text, p_description text default null, p_category text default 'other'
)
returns public.chore_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposer_role text;
  v_for_role text;
  v_for_name text;
  v_chore public.chore_tasks;
  v_id text := 'chore_' || replace(gen_random_uuid()::text, '-', '');
  v_transition_id uuid := gen_random_uuid();
begin
  select role into v_proposer_role from public.members where id = p_proposer_id;
  if v_proposer_role is distinct from 'child' then
    raise exception 'member % is not a kid — only a kid can propose a chore this way', p_proposer_id;
  end if;

  select role, name into v_for_role, v_for_name from public.members where id = p_for_member_id;
  if v_for_role is null then
    raise exception 'target member % not found', p_for_member_id;
  end if;
  if v_for_role in ('parent', 'grandparent') then
    raise exception 'a kid cannot propose a chore for a parent/grandparent (member % is %)', p_for_member_id, v_for_role;
  end if;

  insert into public.chore_tasks (
    id, family_id, title, description, category_type, category,
    base_points, coins_reward, bonus_coins, xp_reward,
    status, is_pool, assigned_to_id, created_by_id, created_at
  ) values (
    v_id, p_family_id, p_title, p_description, 'general', p_category,
    0, 0, 0, 0,
    'pending_kid_proposal', false, p_for_member_id, p_proposer_id, now()
  )
  returning * into v_chore;

  insert into public.chore_participants (chore_id, member_id, role, status)
    values (v_id, p_proposer_id, 'requester', null);
  insert into public.chore_participants (chore_id, member_id, role, status)
    values (v_id, p_for_member_id, 'assignee', 'pending');

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', v_id, p_family_id, p_proposer_id, 'created', null, 'pending_kid_proposal', v_transition_id,
      format('proposed by a kid, for %s', coalesce(v_for_name, 'a family member')));

  return v_chore;
end;
$$;

create or replace function public.offer_chore_handoff(
  p_chore_id text, p_to_member_id text, p_by_member_id text, p_reason text default null
)
returns public.chore_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.chore_tasks;
  v_transition_id uuid := gen_random_uuid();
  v_to_name text;
begin
  select * into v_result from public.chore_tasks where id = p_chore_id for update;
  if v_result.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;

  select name into v_to_name from public.members where id = p_to_member_id;

  delete from public.chore_participants where chore_id = p_chore_id and role = 'assignee' and member_id = p_to_member_id;
  insert into public.chore_participants (chore_id, member_id, role, status)
    values (p_chore_id, p_to_member_id, 'assignee', 'pending');

  update public.chore_tasks
    set pending_handoff_to = p_to_member_id,
        pending_handoff_reason = p_reason,
        pending_handoff_offered_by = p_by_member_id,
        pending_handoff_offered_at = now(),
        rejection_reason = coalesce(p_reason, rejection_reason),
        declined_at = case when p_reason is not null then now() else declined_at end
    where id = p_chore_id
    returning * into v_result;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_result.family_id::uuid, p_by_member_id, 'handoff_offered', v_result.status, v_result.status, v_transition_id,
      format('offered to %s', coalesce(v_to_name, 'a family member')));

  return v_result;
end;
$$;
