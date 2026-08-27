-- Fix: reject_terms_change (just rewritten this session in
-- 20260927190000_fix_terms_change_live_write_and_due_time.sql) set
-- is_pool=true unconditionally, missing the category_type='parent_only_quest'
-- exclusion guard that its sibling cancel_locked_assignment already has
-- (TC-31's fix). Found while tracing TC-30-50 for the full role-action
-- report: a parent-only quest run through claim → propose-terms-change →
-- reject could incorrectly become visible/claimable in the kid/teen pool —
-- adult-only tasks must never enter that pool regardless of how they get
-- released.

create or replace function public.reject_terms_change(p_chore_id text, p_member_id text)
returns chore_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chore public.chore_tasks;
  v_transition_id uuid := gen_random_uuid();
begin
  select * into v_chore from public.chore_tasks where id = p_chore_id for update;
  if v_chore.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;
  if v_chore.status != 'terms_changed' then
    raise exception 'chore % has no pending terms change (status=%)', p_chore_id, v_chore.status;
  end if;
  if v_chore.assigned_to_id is distinct from p_member_id then
    raise exception 'member % is not the current claimant of chore %', p_member_id, p_chore_id;
  end if;

  update public.chore_tasks
    set status = 'todo', assigned_to_id = null,
        is_pool = (v_chore.category_type is distinct from 'parent_only_quest'),
        pending_terms = null
    where id = p_chore_id
    returning * into v_chore;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, to_status, transition_id, note)
    values ('chore', p_chore_id, v_chore.family_id::uuid, p_member_id, 'terms_rejected', 'todo', v_transition_id, 'terms changed, handed back — kept original terms');

  return v_chore;
end;
$$;
