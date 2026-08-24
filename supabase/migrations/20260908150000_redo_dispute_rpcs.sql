-- QA punch list #5 — "Kid disagrees, second parent decides" had no
-- PRE-payout path at all. The only arbitration mechanism this app has
-- (flagApprovalForDiscussion/requestApprovalReversal/coSignReversal,
-- choreStore.ts) is confirmed post-payout only — it requires
-- reviewed_by_id to already be set, i.e. the chore was already approved
-- and paid. A kid who disagrees with a redo_requested decision (before
-- ever resubmitting) had no recourse to a second parent at all — their
-- only options were resubmit (implicitly conceding the redo was fair) or
-- do nothing (which, per fix #3's redo cap, eventually forces an
-- auto-approve at round 2 regardless of who was right).
--
-- Lifecycle: 'redo_requested' (a parent declined the submission, asked for
-- another try) -> kid disputes ('kid_disputed_redo', the ORIGINAL
-- submission_photo_url/submission_note are untouched — a redo request
-- never clears them, only status/rejection_reason/reviewed_by_id) -> a
-- DIFFERENT parent (not the one who requested the redo) reviews the
-- original submission directly and either Pays It (approves on the
-- original work, same payout path approve_chore uses) or Sides With The
-- Redo (back to 'redo_requested', kid must actually resubmit — the
-- original reviewer's call stands).

ALTER TABLE public.chore_tasks
  DROP CONSTRAINT IF EXISTS chore_tasks_status_check;

ALTER TABLE public.chore_tasks
  ADD CONSTRAINT chore_tasks_status_check
  CHECK (status = ANY (ARRAY[
    'todo',
    'claimed',
    'in_progress',
    'pending_approval',
    'pending_grandparent_approval',
    'pending_parent_approval',
    'gp_offer_pending',
    'pending_kid_proposal',
    'terms_changed',
    'kid_disputed_redo',
    'approved',
    'auto_approved',
    'done',
    'completed',
    'declined',
    'redo_requested',
    'archived',
    'cancelled',
    'expired'
  ]));

-- ── dispute_redo ─────────────────────────────────────────────────────────
-- Only the assignee can dispute their own redo request.
create or replace function public.dispute_redo(p_chore_id text, p_member_id text)
returns public.chore_tasks
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
  if v_chore.status != 'redo_requested' then
    raise exception 'chore % has no active redo request (status=%)', p_chore_id, v_chore.status;
  end if;
  if v_chore.assigned_to_id is distinct from p_member_id then
    raise exception 'member % is not the assignee of chore %', p_member_id, p_chore_id;
  end if;

  update public.chore_tasks
    set status = 'kid_disputed_redo'
    where id = p_chore_id
    returning * into v_chore;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_chore.family_id::uuid, p_member_id, 'redo_disputed', 'redo_requested', 'kid_disputed_redo', v_transition_id,
      'assignee disputed the redo request — asking a second parent to review the original submission');

  return v_chore;
end;
$$;

-- ── resolve_redo_dispute ────────────────────────────────────────────────
-- p_pay=true: a DIFFERENT parent than the one who requested the redo
-- (reviewed_by_id) reviews the original submission and approves it as-is —
-- same payout shape approve_chore uses (award_coins, atomic).
-- p_pay=false: sides with the original redo request — back to
-- 'redo_requested', the kid still has to actually resubmit; redo_count is
-- NOT incremented again here (this wasn't a new redo round, just upholding
-- the existing one).
create or replace function public.resolve_redo_dispute(p_chore_id text, p_reviewer_id text, p_pay boolean)
returns table (chore public.chore_tasks, coins_paid integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chore public.chore_tasks;
  v_reviewer_role text;
  v_pts integer := 0;
  v_wallet text;
  v_transition_id uuid := gen_random_uuid();
begin
  select * into v_chore from public.chore_tasks where id = p_chore_id for update;

  if v_chore.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;
  if v_chore.status != 'kid_disputed_redo' then
    raise exception 'chore % has no pending redo dispute (status=%)', p_chore_id, v_chore.status;
  end if;

  select role into v_reviewer_role from public.members where id = p_reviewer_id;
  if v_reviewer_role != 'parent' and not exists (
    select 1 from public.temporary_approvers
    where granted_to_member_id = p_reviewer_id and family_id = v_chore.family_id
      and expires_at > now() and revoked_at is null
  ) then
    raise exception 'member % is not authorized to resolve a redo dispute', p_reviewer_id;
  end if;
  -- The second-parent principle: whoever asked for the redo doesn't also
  -- get to be the one who overrides it — that's not arbitration, that's
  -- the same decision twice. Only enforced when reviewed_by_id is actually
  -- set (a temporary-approver-only household has nobody else to require).
  if v_chore.reviewed_by_id is not null and v_chore.reviewed_by_id = p_reviewer_id then
    raise exception 'member % requested this redo — a different parent must resolve the dispute', p_reviewer_id;
  end if;

  if p_pay then
    v_pts := coalesce(nullif(v_chore.base_points, 0), v_chore.coins_reward, 0) + coalesce(v_chore.bonus_coins, 0);
    v_wallet := case when v_chore.category_type = 'grandparent_quest' or v_chore.sponsor_user_id is not null then 'gp' else 'main' end;

    update public.chore_tasks
      set status = 'approved', approved_at = now()::text, reviewed_at = now(), reviewed_by_id = p_reviewer_id
      where id = p_chore_id
      returning * into v_chore;

    if v_pts > 0 and v_chore.assigned_to_id is not null and not coalesce(v_chore.reward_pending_review, false) then
      perform public.award_coins(v_chore.assigned_to_id, v_pts, coalesce(v_chore.xp_reward, 0), v_wallet);
    else
      v_pts := 0;
    end if;

    insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
      values ('chore', p_chore_id, v_chore.family_id::uuid, p_reviewer_id, 'redo_dispute_resolved', 'kid_disputed_redo', 'approved', v_transition_id,
        format('second parent sided with the kid — approved the original submission, %s coins paid', v_pts));
  else
    update public.chore_tasks
      set status = 'redo_requested'
      where id = p_chore_id
      returning * into v_chore;

    insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
      values ('chore', p_chore_id, v_chore.family_id::uuid, p_reviewer_id, 'redo_dispute_resolved', 'kid_disputed_redo', 'redo_requested', v_transition_id,
        'second parent sided with the original redo request');
  end if;

  return query select v_chore, v_pts;
end;
$$;
