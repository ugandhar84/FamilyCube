-- A dispute (flag-for-discussion or reversal-request) must be raised within
-- 24h of the approval it's challenging — after that the approval is final
-- and no parent can dispute it anymore. Enforced once, in the shared
-- _dispute_guard() both flag_approval() and request_reversal() already call,
-- so there's a single choke point rather than duplicating the check.
--
-- p_check_raise_window: true for flag_approval/request_reversal (checks 24h
-- since the approval). cosign_reversal passes false here — a co-sign isn't
-- "raising" a new dispute, and by the time it happens it's often already
-- past 24h since the original approval even when the dispute itself was
-- raised promptly. cosign_reversal instead gets its own, separate 24h
-- window measured from disputed_at (when the reversal was requested), added
-- directly in cosign_reversal below — "decide best to avoid nuisance":
-- the raise-window and the co-sign-response-window are different clocks.
create or replace function public._dispute_guard(
  p_chore_id text, p_caller_id text, p_require_approved boolean, p_check_raise_window boolean default true
) returns chore_tasks
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_active text;
  v_role text;
  v_family text;
  v_chore public.chore_tasks;
  v_approved_at timestamptz;
begin
  v_active := public.resolve_active_member_id();
  if v_active is null or v_active is distinct from p_caller_id then
    raise exception 'caller is not member %', p_caller_id;
  end if;
  select role, family_id into v_role, v_family from public.members where id = p_caller_id;
  if v_role is distinct from 'parent' then
    raise exception 'only a parent can dispute or resolve an approval';
  end if;
  select * into v_chore from public.chore_tasks where id = p_chore_id for update;
  if v_chore.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;
  if v_chore.family_id is distinct from v_family then
    raise exception 'member % is not in the same family as chore %', p_caller_id, p_chore_id;
  end if;
  if p_require_approved and v_chore.status not in ('approved', 'auto_approved') then
    raise exception 'chore % is not approved (status=%)', p_chore_id, v_chore.status;
  end if;
  if p_require_approved and p_check_raise_window then
    v_approved_at := coalesce(v_chore.reviewed_at, v_chore.approved_at);
    if v_approved_at is not null and now() - v_approved_at > interval '24 hours' then
      raise exception 'the 24-hour window to dispute this approval has passed';
    end if;
  end if;
  return v_chore;
end;
$$;

-- cosign_reversal: the second parent must co-sign within 24h of when the
-- reversal was requested (disputed_at) — stale, unresolved reversal
-- requests shouldn't stay actionable forever. Call stand_by_approval() to
-- clear an expired one (no time limit on simply dropping a dispute).
create or replace function public.cosign_reversal(p_chore_id text, p_cosigner_id text)
returns table (chore chore_tasks, coins_removed integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_chore public.chore_tasks;
  v_res record;
begin
  v_chore := public._dispute_guard(p_chore_id, p_cosigner_id, true, false);
  if v_chore.dispute_status is distinct from 'reversal_requested' then
    raise exception 'chore % has no pending reversal request', p_chore_id;
  end if;
  if v_chore.disputed_at is not null and now() - v_chore.disputed_at > interval '24 hours' then
    raise exception 'the 24-hour window to co-sign this reversal has passed';
  end if;
  -- Must be a second, independent parent: the original approver when one is
  -- recorded (auto-approved chores have none, so any parent other than the
  -- requester may co-sign).
  if v_chore.disputed_by_id is not distinct from p_cosigner_id then
    raise exception 'the parent who requested the reversal cannot also co-sign it';
  end if;
  if v_chore.reviewed_by_id is not null and v_chore.reviewed_by_id is distinct from p_cosigner_id then
    raise exception 'only the original approver can co-sign this reversal';
  end if;

  select * into v_res from public._reverse_chore_payout(p_chore_id, p_cosigner_id, coalesce(v_chore.dispute_reason, ''));
  return query select v_res.chore, v_res.coins_removed;
end;
$$;
