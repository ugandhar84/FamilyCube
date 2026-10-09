-- Restores the caller-identity check on submit_chore.
-- 20260930340000 added `resolve_active_member_id() = p_member_id`; the
-- 20260988000000 rewrite (chore_submissions history) re-declared the function
-- from an older body and silently dropped it, so any family member's session
-- could submit a chore on behalf of the assignee. Found by the Tasks e2e QA
-- pass (qa-scratch-family): kid B submitted kid A's chore with no error.

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
  v_submission_note text;
  v_submission_photo text;
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_member_id then
    raise exception 'caller is not member %', p_member_id;
  end if;

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

  if coalesce(v_chore.requires_photo, false) and p_photo_url is null and v_chore.submission_photo_url is null then
    raise exception 'chore % requires a photo to submit', p_chore_id;
  end if;

  v_submission_note := coalesce(p_note, v_chore.submission_note);
  v_submission_photo := coalesce(p_photo_url, v_chore.submission_photo_url);

  -- One frozen snapshot row per submission — inserted BEFORE the branch
  -- logic below so every outcome (self-assigned-parent/redo-cap auto path
  -- AND the normal pending_approval path) gets its own history row, not
  -- just the normal path.
  insert into public.chore_submissions (chore_id, family_id, submitted_by_id, note, photo_url, redo_round)
    values (p_chore_id, v_chore.family_id::uuid, p_member_id, v_submission_note, v_submission_photo, coalesce(v_chore.redo_count, 0));

  if v_chore.created_by_id is not null and v_chore.created_by_id = v_chore.assigned_to_id then
    select role into v_creator_role from public.members where id = v_chore.created_by_id;
    v_is_self_assigned_parent := v_creator_role = 'parent';
  end if;

  if not v_is_self_assigned_parent and coalesce(v_chore.redo_count, 0) >= 2 then
    v_is_redo_cap := true;
  end if;

  if v_is_self_assigned_parent or v_is_redo_cap then
    v_pts := coalesce(nullif(v_chore.base_points, 0), v_chore.coins_reward, 0) + coalesce(v_chore.bonus_coins, 0);
    v_wallet := case when v_chore.category_type = 'grandparent_quest' or v_chore.sponsor_user_id is not null then 'gp' else 'main' end;

    update public.chore_tasks
      set status = case when v_is_self_assigned_parent then 'approved' else 'auto_approved' end,
          approved_at = now()::text, reviewed_at = now(),
          submission_note = v_submission_note,
          submission_photo_url = v_submission_photo,
          submitted_at = now()
      where id = p_chore_id
      returning * into v_chore;

    if v_pts > 0 and not coalesce(v_chore.reward_pending_review, false) then
      perform public.award_coins(v_chore.assigned_to_id, v_pts, coalesce(v_chore.xp_reward, 0), v_wallet);
    else
      v_pts := 0;
    end if;

    update public.chore_submissions
      set outcome = case when v_is_self_assigned_parent then 'approved' else 'auto_approved' end,
          reviewed_by_id = p_member_id, reviewed_at = now()
      where id = (
        select id from public.chore_submissions
        where chore_id = p_chore_id and submitted_by_id = p_member_id and reviewed_at is null
        order by submitted_at desc limit 1
      );

    insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
      values ('chore', p_chore_id, v_chore.family_id::uuid, p_member_id,
        case when v_is_self_assigned_parent then 'approved' else 'auto_approved' end,
        v_from_status, v_chore.status, v_transition_id,
        case when v_is_redo_cap then format('redo cap reached (%s rounds) — auto-approved, %s coins paid', v_chore.redo_count, v_pts)
             else format('self-assigned by a parent, %s coins paid', v_pts) end);

    return query select v_chore, v_pts, v_is_redo_cap;
    return;
  end if;

  v_expiry := now() + interval '24 hours';
  update public.chore_tasks
    set status = 'pending_approval',
        submission_note = v_submission_note,
        submission_photo_url = v_submission_photo,
        submitted_at = now(),
        approval_window_expires_at = v_expiry
    where id = p_chore_id
    returning * into v_chore;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_chore.family_id::uuid, p_member_id, 'submitted', v_from_status, 'pending_approval', v_transition_id, 'submitted for review');

  return query select v_chore, 0, false;
end;
$$;
