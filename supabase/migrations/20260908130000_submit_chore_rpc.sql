-- QA punch list #3 — the redo-round cap ("max 2 rounds, then auto-approve")
-- was enforced ONLY in client code (choreStore.ts's submitChore/
-- resubmitChore), reading the client's own local chore.redoCount — a
-- modified or merely-stale client could keep resubmitting through the
-- normal pending_approval path forever instead of ever hitting the forced
-- auto-approve, since nothing server-side ever re-derived or checked
-- redo_count. In fact submitChore/resubmitChore had NO RPC at all — every
-- write (status transition, submission fields, AND the coin payout on the
-- redo-cap/self-assigned-parent shortcuts) went through the client's own
-- composed updateChore patch + a separate awardPoints() call, mirroring
-- exactly the class of gap approve_chore (20260905120000) was already
-- built to close for the reviewer's own approve action.
--
-- submit_chore is a full server-side replacement: re-derives every branch
-- (self-assigned-by-a-parent shortcut, redo-cap auto-approve, normal
-- pending_approval) from the ROW's own redo_count/created_by_id/
-- assigned_to_id — not the caller's claims — and pays out via the same
-- award_coins() RPC approve_chore already uses, atomically, in one
-- transaction. The client still separately logs a point_transactions row
-- for jar-split reporting (spend/save/give breakdown) exactly as it does
-- today for every other payout path — that's cosmetic/reporting-only per
-- awardPoints()'s own existing comment ("the not currently persisted
-- per-jar running balance was ever missing"), award_coins is what actually
-- credits the wallet and is now the server's job, not the client's.
--
-- A submit_chore(text,text,text,text) already existed (20260905120000) —
-- unconditionally set status='pending_approval' with no redo-cap/self-
-- assigned-parent branching, no coin payout, no photo check — and turns
-- out to be dead code (choreStore.ts's submitChore/resubmitChore never
-- called it, confirmed via grep; both wrote through a plain updateChore
-- patch instead). A different parameter ORDER (p_note/p_photo_url swapped)
-- plus a different RETURN TYPE means CREATE OR REPLACE can't just swap it
-- in place (Postgres: "cannot change return type of existing function") —
-- drop the old signature explicitly first, same pattern reassign_chore's
-- own migration already used for this exact situation.
drop function if exists public.submit_chore(text, text, text, text);

create or replace function public.submit_chore(
  p_chore_id text, p_member_id text,
  p_note text default null, p_photo_url text default null
)
returns table (chore public.chore_tasks, coins_paid integer, auto_approved boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chore public.chore_tasks;
  v_member_role text;
  v_creator_role text;
  v_is_self_assigned_parent boolean := false;
  v_is_redo_cap boolean := false;
  v_pts integer := 0;
  v_wallet text;
  v_transition_id uuid := gen_random_uuid();
  v_expiry timestamptz;
  v_from_status text;
begin
  select * into v_chore from public.chore_tasks where id = p_chore_id for update;

  if v_chore.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;
  v_from_status := v_chore.status;
  if v_chore.assigned_to_id is distinct from p_member_id then
    raise exception 'member % is not the assignee of chore %', p_member_id, p_chore_id;
  end if;
  if v_chore.status not in ('todo', 'in_progress', 'redo_requested') then
    raise exception 'chore % is not submittable (status=%)', p_chore_id, v_chore.status;
  end if;

  -- Photo-required chores must actually carry a photo before ANY payout
  -- path fires — was previously only checked ad hoc per-branch client-side;
  -- enforced once, up front, here.
  if coalesce(v_chore.requires_photo, false) and p_photo_url is null and v_chore.submission_photo_url is null then
    raise exception 'chore % requires a photo to submit', p_chore_id;
  end if;

  -- Self-assigned-by-a-parent shortcut: createdById === assignedToId and
  -- that member is a parent — nobody meaningful to review it, so it
  -- approves immediately instead of sitting in pending_approval.
  if v_chore.created_by_id is not null and v_chore.created_by_id = v_chore.assigned_to_id then
    select role into v_creator_role from public.members where id = v_chore.created_by_id;
    v_is_self_assigned_parent := v_creator_role = 'parent';
  end if;

  -- Redo cap: 2 rounds of requestRedo already happened (redo_count >= 2,
  -- read from the ROW, not trusted from the client) → auto-approve rather
  -- than a 3rd manual review round, same "don't let a parent indefinitely
  -- stonewall a kid" protection the client-side version already had, now
  -- actually enforced instead of merely suggested.
  if not v_is_self_assigned_parent and coalesce(v_chore.redo_count, 0) >= 2 then
    v_is_redo_cap := true;
  end if;

  if v_is_self_assigned_parent or v_is_redo_cap then
    v_pts := coalesce(nullif(v_chore.base_points, 0), v_chore.coins_reward, 0) + coalesce(v_chore.bonus_coins, 0);
    v_wallet := case when v_chore.category_type = 'grandparent_quest' or v_chore.sponsor_user_id is not null then 'gp' else 'main' end;

    update public.chore_tasks
      set status = case when v_is_self_assigned_parent then 'approved' else 'auto_approved' end,
          approved_at = now()::text, reviewed_at = now(),
          submission_note = coalesce(p_note, submission_note),
          submission_photo_url = coalesce(p_photo_url, submission_photo_url),
          submitted_at = now()
      where id = p_chore_id
      returning * into v_chore;

    if v_pts > 0 and not coalesce(v_chore.reward_pending_review, false) then
      perform public.award_coins(v_chore.assigned_to_id, v_pts, coalesce(v_chore.xp_reward, 0), v_wallet);
    else
      v_pts := 0;
    end if;

    insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
      values ('chore', p_chore_id, v_chore.family_id::uuid, p_member_id,
        case when v_is_self_assigned_parent then 'approved' else 'auto_approved' end,
        v_from_status, v_chore.status, v_transition_id,
        case when v_is_redo_cap then format('redo cap reached (%s rounds) — auto-approved, %s coins paid', v_chore.redo_count, v_pts)
             else format('self-assigned by a parent, %s coins paid', v_pts) end);

    return query select v_chore, v_pts, v_is_redo_cap;
    return;
  end if;

  -- Normal path: pending_approval, real review needed.
  v_expiry := now() + interval '24 hours';
  update public.chore_tasks
    set status = 'pending_approval',
        submission_note = coalesce(p_note, submission_note),
        submission_photo_url = coalesce(p_photo_url, submission_photo_url),
        submitted_at = now(),
        approval_window_expires_at = v_expiry
    where id = p_chore_id
    returning * into v_chore;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_chore.family_id::uuid, p_member_id, 'submitted', v_from_status, 'pending_approval', v_transition_id, 'submitted for review');

  return query select v_chore, 0, false;
end;
$$;

comment on function public.submit_chore(text, text, text, text) is
  'Server-side replacement for choreStore.ts submitChore/resubmitChore — re-derives the self-assigned-parent and redo-cap (>=2 rounds) auto-approve branches from the row itself, not the caller''s claims, and pays out via award_coins atomically. See QA punch list #3.';
