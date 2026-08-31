-- Real, serious gap found by a deep exploratory QA trace of Chores:
-- update_chore_task_checked (this session's own compare-and-set fix for
-- title/description/parentNote/dueDate/dueTime/coinsReward/basePoints
-- edits) verified the caller was SOME real family member, but never
-- checked they had any actual authority over the chore being edited. Any
-- kid's session could rewrite any chore's title, coin reward, or due date
-- directly — including a chore assigned to someone else entirely — with
-- no parent/creator check at all. This defeats the whole reason
-- propose_terms_change exists (to pause a CLAIMED chore's terms change
-- for the claimant's review) by giving a second, ungated path to the same
-- edit.
--
-- Fix: only a parent, or the chore's own creator, may call this
-- successfully. The chore's current assignee is deliberately NOT included
-- here — an assignee changing their own chore's reward/due-date is
-- exactly the tampering this function exists to prevent, and is already
-- correctly routed through propose_terms_change instead when the chore
-- is claimed (see updateChore's own branching logic in choreStore.ts).
create or replace function public.update_chore_task_checked(
  p_chore_id text,
  p_title text default null,
  p_has_title boolean default false,
  p_description text default null,
  p_has_description boolean default false,
  p_parent_note text default null,
  p_has_parent_note boolean default false,
  p_due_date text default null,
  p_has_due_date boolean default false,
  p_due_time text default null,
  p_has_due_time boolean default false,
  p_coins_reward integer default null,
  p_has_coins_reward boolean default false,
  p_base_points integer default null,
  p_has_base_points boolean default false,
  p_expected_updated_at timestamptz default null
)
returns public.chore_tasks
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_active_member_id text;
  v_current public.chore_tasks;
  v_result public.chore_tasks;
  v_caller_is_parent boolean;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null then
    raise exception 'caller is not a verified family member';
  end if;

  select * into v_current from public.chore_tasks where id = p_chore_id for update;
  if v_current.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;

  select exists (
    select 1 from public.members
    where id = v_active_member_id and role = 'parent'
  ) into v_caller_is_parent;

  if not v_caller_is_parent and v_current.created_by_id is distinct from v_active_member_id then
    raise exception 'only a parent or this chore''s creator can edit it';
  end if;

  if p_expected_updated_at is not null and v_current.updated_at is distinct from p_expected_updated_at then
    raise exception 'stale_write: chore % was changed by someone else since you last loaded it', p_chore_id;
  end if;

  update public.chore_tasks set
    title         = case when p_has_title         then p_title         else title end,
    description   = case when p_has_description   then p_description   else description end,
    parent_note   = case when p_has_parent_note    then p_parent_note   else parent_note end,
    due_date      = case when p_has_due_date       then p_due_date      else due_date end,
    due_time      = case when p_has_due_time       then p_due_time      else due_time end,
    coins_reward  = case when p_has_coins_reward   then p_coins_reward  else coins_reward end,
    base_points   = case when p_has_base_points    then p_base_points   else base_points end
  where id = p_chore_id
  returning * into v_result;

  return v_result;
end;
$function$;
