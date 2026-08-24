-- Found during final verification: request_redo's status value ('declined')
-- didn't match reality — the real client action (choreStore.ts's
-- requestRedo) sets status='redo_requested' and increments redo_count,
-- which resubmitChore later reads to know a kid is trying again rather
-- than submitting fresh. 'declined' is a DIFFERENT terminal status this app
-- also uses elsewhere (declineChoreAssignment) — using it here would have
-- silently broken the redo flow (resubmitChore/redoCount-based
-- auto-approve-after-2-tries logic) the moment any caller switched to this
-- RPC. Fixed to match the real status/field the app actually uses.
--
-- submit_chore is also NOT wired to any client call site (choreStore.ts's
-- real submitChore has 3 branches — self-assigned-parent auto-approve,
-- redo-count-2+ auto-approve, normal pending_approval — each with its own
-- payout logic, none of which this simpler RPC replicates). Left as a
-- correctly-scoped ONE-BRANCH function for a future caller that only needs
-- the plain "submit for review" path; not claimed as a drop-in replacement
-- for the real submitChore.
create or replace function public.request_redo(p_chore_id text, p_reviewer_id text, p_reason text)
returns public.chore_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.chore_tasks;
  v_transition_id uuid := gen_random_uuid();
  v_new_redo_count integer;
begin
  select coalesce(redo_count, 0) + 1 into v_new_redo_count from public.chore_tasks where id = p_chore_id for update;

  update public.chore_participants
    set status = 'declined'
    where chore_id = p_chore_id and role = 'assignee';

  update public.chore_tasks
    set status = 'redo_requested', rejection_reason = p_reason, reviewed_at = now(),
        reviewed_by_id = p_reviewer_id, redo_count = v_new_redo_count
    where id = p_chore_id
    returning * into v_result;

  if v_result.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, to_status, transition_id, note)
    values ('chore', p_chore_id, v_result.family_id::uuid, p_reviewer_id, 'declined', 'redo_requested', v_transition_id, p_reason);

  return v_result;
end;
$$;

comment on function public.request_redo(text, text, text) is 'Parent/reviewer declines a submission and asks for a redo — sets status=redo_requested and increments redo_count, matching the app''s real redo/resubmit flow.';

-- claim_gp_errand — the raw-write equivalent of claimGPErrand
-- (store/choreStore.ts), which bypasses updateChore entirely today (its own
-- audit-flagged zero-audit-trail write). Matches the real status value
-- ('gp_offer_pending') and gp_offer_by_id field the app actually uses.
create or replace function public.claim_gp_errand(p_chore_id text, p_gp_member_id text)
returns table (claimed boolean, chore public.chore_tasks)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.chore_tasks;
  v_transition_id uuid := gen_random_uuid();
begin
  select * into v_result from public.chore_tasks where id = p_chore_id for update;

  if v_result.id is null or not coalesce(v_result.invite_grandparents, false) or v_result.status != 'todo' then
    return query select false, null::public.chore_tasks;
    return;
  end if;

  update public.chore_tasks
    set status = 'gp_offer_pending', gp_offer_by_id = p_gp_member_id
    where id = p_chore_id
    returning * into v_result;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_result.family_id::uuid, p_gp_member_id, 'other', 'todo', 'gp_offer_pending', v_transition_id, 'grandparent offered to help');

  return query select true, v_result;
end;
$$;

comment on function public.claim_gp_errand(text, text) is 'Grandparent offers to help with a GP-welcome errand — atomic version of choreStore.ts''s claimGPErrand, which today bypasses updateChore entirely with no audit trail.';
