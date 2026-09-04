-- Live QA finding (pass 2, docs/qa_chore_handoff_bounty_audit.html, High):
-- decline_chore_handoff reopened straight to the general pool
-- (assigned_to_id=null, is_pool=true) instead of reverting to the
-- original offering member — by design per this function's own prior
-- comment ("reopens straight to the pool, no reason required"), but
-- live-confirmed to produce a genuinely bad outcome: a kid who offers
-- their own chore to a specific person, and gets declined, ends up WORSE
-- off than before offering it at all — the chore becomes claimable by
-- ANY uninvolved kid/teen in the family (deriveCardActions.ts's canClaim
-- doesn't distinguish "was this ever mine"), not just handed back to
-- them. Live-reproduced: K3 offers to T6, T6 declines, a completely
-- unrelated K5 claims it away from K3 before K3 gets a chance to reclaim
-- their own chore.
--
-- Fix: revert to pending_handoff_offered_by (the ORIGINAL owner who made
-- the offer) instead of opening the pool. Matches the natural mental
-- model of "hand it to someone" — a declined handoff undoes itself, it
-- doesn't put the chore up for grabs by the whole family.
create or replace function public.decline_chore_handoff(p_chore_id text, p_member_id text)
returns chore_tasks
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_result public.chore_tasks;
  v_transition_id uuid := gen_random_uuid();
  v_from_status text;
  v_active_member_id text;
  v_offered_by text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_member_id then
    raise exception 'caller is not member %', p_member_id;
  end if;

  select * into v_result from public.chore_tasks where id = p_chore_id for update;
  if v_result.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;
  if v_result.pending_handoff_to is distinct from p_member_id then
    raise exception 'chore % has no pending handoff to member %', p_chore_id, p_member_id;
  end if;
  v_from_status := v_result.status;
  v_offered_by := v_result.pending_handoff_offered_by;

  delete from public.chore_participants where chore_id = p_chore_id and role = 'assignee' and member_id = p_member_id;

  if v_offered_by is not null then
    insert into public.chore_participants (chore_id, member_id, role, status)
      values (p_chore_id, v_offered_by, 'assignee', 'claimed')
      on conflict (chore_id, member_id, role) do nothing;
  end if;

  update public.chore_tasks
    set assigned_to_id = v_offered_by,
        is_pool = (v_offered_by is null),
        status = 'todo',
        pending_handoff_to = null, pending_handoff_reason = null,
        pending_handoff_offered_by = null, pending_handoff_offered_at = null
    where id = p_chore_id
    returning * into v_result;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    select 'chore', p_chore_id, ct.family_id::uuid, p_member_id, 'handoff_declined', v_from_status, 'todo', v_transition_id,
      case when v_offered_by is not null then format('declined — reverted to original owner')
           else 'declined — reopened to pool (no original owner on record)' end
    from public.chore_tasks ct where ct.id = p_chore_id;

  return v_result;
end;
$$;
