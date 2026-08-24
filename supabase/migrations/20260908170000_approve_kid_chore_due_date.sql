-- Parent can now set a due date alongside the coin reward when approving a
-- kid's chore proposal, same pattern as coins: a kid-authored proposal
-- never carries its own deadline either (only the parent decides that, at
-- approval time) — optional, defaults to no deadline (open-ended) if the
-- parent leaves it blank, matching the existing behavior before this change.

create or replace function public.approve_kid_chore(
  p_chore_id text, p_reviewer_id text, p_coins_reward integer default 0, p_xp_reward integer default 0,
  p_due_date text default null
)
returns public.chore_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chore public.chore_tasks;
  v_reviewer_role text;
  v_transition_id uuid := gen_random_uuid();
begin
  select * into v_chore from public.chore_tasks where id = p_chore_id for update;

  if v_chore.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;
  if v_chore.status != 'pending_kid_proposal' then
    raise exception 'chore % is not a pending kid proposal (status=%)', p_chore_id, v_chore.status;
  end if;

  select role into v_reviewer_role from public.members where id = p_reviewer_id;
  if v_reviewer_role != 'parent' and not exists (
    select 1 from public.temporary_approvers
    where granted_to_member_id = p_reviewer_id and family_id = v_chore.family_id
      and expires_at > now() and revoked_at is null
  ) then
    raise exception 'member % is not authorized to approve a kid-proposed chore', p_reviewer_id;
  end if;

  update public.chore_tasks
    set status = 'todo', coins_reward = coalesce(p_coins_reward, 0), base_points = coalesce(p_coins_reward, 0),
        xp_reward = coalesce(p_xp_reward, 0), due_date = p_due_date,
        reviewed_at = now(), reviewed_by_id = p_reviewer_id
    where id = p_chore_id
    returning * into v_chore;

  update public.chore_participants
    set status = 'approved'
    where chore_id = p_chore_id and role = 'assignee';
  insert into public.chore_participants (chore_id, member_id, role, status)
    values (p_chore_id, p_reviewer_id, 'approver', 'approved')
    on conflict (chore_id, member_id, role) do update set status = 'approved';

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_chore.family_id::uuid, p_reviewer_id, 'approved', 'pending_kid_proposal', 'todo', v_transition_id,
      format('kid proposal approved, %s coins set%s', coalesce(p_coins_reward, 0), case when p_due_date is not null then format(', due %s', p_due_date) else '' end));

  return v_chore;
end;
$$;
