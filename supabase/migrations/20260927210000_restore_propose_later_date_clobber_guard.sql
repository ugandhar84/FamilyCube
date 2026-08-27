-- Fix: propose_later_date's double-proposal guard was silently dropped.
-- Found via live DB-verified QA (docs/master_flow_db_verified_TC51-66.md,
-- TC-66): 20260927110000_qa_fixes_batch1.sql originally added a guard
-- rejecting a second propose_later_date call while one is already pending
-- ("chore ... already has a pending later-date proposal — resolve it
-- first"), but a LATER migration (20260927150000_fix_later_date_orphan.sql,
-- fixing an unrelated is_pool orphan bug) used `create or replace function`
-- with the full body copied from BEFORE that guard existed, silently
-- reverting it. Live-confirmed regression: kid2 could clobber kid1's
-- already-pending later-date proposal with zero trace or error, exactly
-- reproducing the original pre-fix bug.
--
-- Restores the guard on top of the is_pool fix (both are needed together —
-- this is not a revert, it's the union of both prior fixes, which should
-- have been applied together the first time).

create or replace function public.propose_later_date(
  p_chore_id text, p_by_member_id text, p_new_date text, p_reason text default null
)
returns public.chore_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.chore_tasks;
  v_transition_id uuid := gen_random_uuid();
  v_from_status text;
  v_category_type text;
begin
  select status, category_type into v_from_status, v_category_type from public.chore_tasks where id = p_chore_id for update;
  if v_from_status is null then
    raise exception 'chore % not found', p_chore_id;
  end if;

  if exists (select 1 from public.chore_tasks where id = p_chore_id and pending_later_date is not null) then
    raise exception 'chore % already has a pending later-date proposal — resolve it first', p_chore_id;
  end if;

  update public.chore_tasks
    set assigned_to_id = null,
        is_pool = (v_category_type is distinct from 'parent_only_quest'),
        status = 'todo', claimed_at = null,
        rejection_reason = coalesce(p_reason, rejection_reason),
        declined_at = now(),
        pending_later_date = p_new_date,
        pending_later_reason = p_reason,
        pending_later_requested_by = p_by_member_id,
        pending_later_requested_at = now()
    where id = p_chore_id
    returning * into v_result;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_result.family_id::uuid, p_by_member_id, 'later_proposed', v_from_status, v_result.status, v_transition_id,
      format('proposed new date %s: %s', p_new_date, coalesce(p_reason, '')));

  return v_result;
end;
$$;
