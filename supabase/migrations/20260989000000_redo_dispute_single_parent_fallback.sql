-- resolve_redo_dispute: fall back to the SAME parent when no other
-- eligible approver exists.
--
-- Live direction: "after certain no of request redos kid can dispute it
-- right ... and goes to other parent dispute. if no other parent then it
-- will just go to same parent." Confirmed real dead-end bug:
-- resolve_redo_dispute's guard unconditionally blocked
-- reviewed_by_id = p_reviewer_id — correct in a multi-parent family (a
-- second, independent opinion is the whole point), but in a
-- single-parent family that parent is the ONLY person who could ever
-- act, so a disputed redo became permanently unresolvable the moment it
-- was raised — the kid's chore sat in kid_disputed_redo forever with no
-- path forward. choreStore.ts's disputeRedo notification logic had the
-- matching gap: it excludes reviewed_by_id from the notify list with no
-- fallback, so in a single-parent family NOBODY got told the dispute
-- even existed (approverIds.length === 0, the whole notify call is
-- skipped).
--
-- Fix: the self-resolve block now only applies when at least one OTHER
-- eligible approver (parent, senior, or active temporary-approver grant)
-- exists in the family. Zero others → the original parent may resolve
-- their own dispute, same as the self-assigned-parent shortcut
-- submit_chore already uses for the analogous "nobody else to review
-- this" situation.
create or replace function public.resolve_redo_dispute(p_chore_id text, p_reviewer_id text, p_pay boolean)
returns table(chore chore_tasks, coins_paid integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_chore public.chore_tasks;
  v_reviewer_role text;
  v_reviewer_family text;
  v_pts integer := 0;
  v_wallet text;
  v_transition_id uuid := gen_random_uuid();
  v_active_member_id text;
  v_other_approver_exists boolean;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_reviewer_id then
    raise exception 'caller is not member %', p_reviewer_id;
  end if;

  select * into v_chore from public.chore_tasks where id = p_chore_id for update;

  if v_chore.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;
  if v_chore.status != 'kid_disputed_redo' then
    raise exception 'chore % has no pending redo dispute (status=%)', p_chore_id, v_chore.status;
  end if;

  select role, family_id into v_reviewer_role, v_reviewer_family from public.members where id = p_reviewer_id;
  if v_reviewer_family is distinct from v_chore.family_id then
    raise exception 'member % is not in the same family as chore %', p_reviewer_id, p_chore_id;
  end if;
  if v_reviewer_role != 'parent' and not exists (
    select 1 from public.temporary_approvers
    where granted_to_member_id = p_reviewer_id and family_id = v_chore.family_id
      and expires_at > now() and revoked_at is null
  ) then
    raise exception 'member % is not authorized to resolve a redo dispute', p_reviewer_id;
  end if;

  -- Is there anyone ELSE in this family eligible to resolve this dispute?
  -- Same eligibility rule as the check just above (parent role, or an
  -- active temporary-approver grant), excluding the reviewer themself.
  select exists (
    select 1 from public.members m
    where m.family_id = v_chore.family_id and m.id != p_reviewer_id
      and (
        m.role = 'parent'
        or exists (
          select 1 from public.temporary_approvers ta
          where ta.granted_to_member_id = m.id and ta.family_id = v_chore.family_id
            and ta.expires_at > now() and ta.revoked_at is null
        )
      )
  ) into v_other_approver_exists;

  if v_chore.reviewed_by_id is not null and v_chore.reviewed_by_id = p_reviewer_id and v_other_approver_exists then
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
        case when not v_other_approver_exists then format('%s coins paid (single-parent family — same parent resolved)', v_pts)
             else format('%s coins paid', v_pts) end);
  else
    -- Second parent sides with the original redo request — same
    -- redo_disputes_lost bookkeeping the earlier migration added, so the
    -- redo-cap check in submit_chore doesn't count this round toward
    -- auto-approval.
    update public.chore_tasks
      set status = 'redo_requested', reviewed_at = now(), reviewed_by_id = p_reviewer_id,
          redo_disputes_lost = coalesce(redo_disputes_lost, 0) + 1
      where id = p_chore_id
      returning * into v_chore;

    insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
      values ('chore', p_chore_id, v_chore.family_id::uuid, p_reviewer_id, 'redo_dispute_resolved', 'kid_disputed_redo', 'redo_requested', v_transition_id,
        case when not v_other_approver_exists then 'redo upheld (single-parent family — same parent resolved)'
             else 'redo upheld' end);
  end if;

  return query select v_chore, v_pts;
end;
$function$;

comment on function public.resolve_redo_dispute(text, text, boolean) is
  'Resolves a kid-disputed redo. Blocks the original requesting parent from resolving their own dispute ONLY when another eligible approver (parent/senior with an active grant) exists in the family — a single-parent family falls back to letting that same parent resolve it instead of leaving the dispute permanently stuck.';
