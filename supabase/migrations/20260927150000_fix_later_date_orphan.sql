-- Fix: later-date reschedule permanently orphaned the chore for every kid/
-- teen role. Found by exploratory cross-role QA
-- (docs/master_flow_exploratory_findings.md, GP-pool/later-date section,
-- finding #2): propose_later_date releases the chore (assigned_to_id=null)
-- but never set is_pool=true, unlike every other "release back to the
-- household" path (reassign_chore's release branch, cancel_locked_assignment's
-- reopen — see 20260927110000_qa_fixes_batch1.sql's TC-31 fix). Because
-- approve_later_date/decline_later_date never touch is_pool either, the
-- chore stayed is_pool=false/assigned_to_id=null forever after propose — live-
-- confirmed via isolated test family: the requesting kid loses visibility
-- into their own chore the instant they ask for a later time, and BOTH
-- outcomes (approved or declined) leave it invisible to every kid/teen pool
-- filter afterward, requiring a parent to manually notice and reassign it.
--
-- Fix: propose_later_date now sets is_pool=true on release (same guard as
-- cancel_locked_assignment — adult-only parent_only_quest chores never enter
-- a kid/teen pool). This alone fixes all three reported states: the
-- requester's own chore reappears in the pool immediately (visible, just
-- like any other released chore, rather than invisible-and-pending), and
-- since approve/decline never flip is_pool back to false, the chore stays
-- correctly poolable after either resolution too — no changes needed to
-- those two functions.

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

  if v_result.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_result.family_id::uuid, p_by_member_id, 'later_proposed', v_from_status, v_result.status, v_transition_id,
      format('proposed new date %s: %s', p_new_date, coalesce(p_reason, '')));

  return v_result;
end;
$$;
