-- chore_submissions — real, append-only submission history for a chore.
--
-- Live-pasted Figma spec (ChoreProofReviewScreen's "chore photo-proof
-- review" mock): an "Earlier submission" card showing a PRIOR redo
-- cycle's own photo/note, preserved and distinct from the current one
-- ("09:10 · no photo attached. Maya requested a clearer photo at 09:15;
-- Leo added a new submission at 09:30 ... Previous version retained;
-- nothing overwritten"). That data doesn't exist anywhere today —
-- chore_tasks.submission_note/submission_photo_url/rejection_reason are
-- single fields a resubmit silently overwrites, and redo_count is just a
-- counter with no record of what each round actually contained. This
-- table is the real fix: one row per submit/resubmit, a frozen snapshot
-- of what was submitted and (once reviewed) the decision made on it —
-- genuinely append-only, never updated after insert except to attach the
-- reviewer's decision once it happens.

create table if not exists public.chore_submissions (
  id              uuid primary key default gen_random_uuid(),
  chore_id        text not null references public.chore_tasks(id) on delete cascade,
  family_id       uuid not null,
  submitted_by_id text not null,
  submitted_at    timestamptz not null default now(),
  note            text,
  photo_url       text,
  -- Which redo round this was — 0 for the first submission, 1 after the
  -- first redo, etc. Mirrors chore_tasks.redo_count at the moment of this
  -- submission so the UI can label "Submission 1", "Submission 2 (redo)".
  redo_round      integer not null default 0,
  -- Filled in once a parent/reviewer acts on THIS specific submission —
  -- null while still pending. outcome mirrors the chore's own status
  -- values that can result from a decision (approved/auto_approved/
  -- redo_requested/declined), reviewed_note is the reviewer's own
  -- message back (rejection_reason for a redo, or an approval note).
  outcome         text check (outcome in ('approved', 'auto_approved', 'redo_requested', 'declined')),
  reviewed_by_id  text,
  reviewed_at     timestamptz,
  reviewed_note   text
);

create index if not exists chore_submissions_chore_id_idx on public.chore_submissions(chore_id, submitted_at);

alter table public.chore_submissions enable row level security;

-- Same family-scoped read/write shape as chore_tasks itself — a submission
-- row is only ever visible to/writable by members of the family that owns
-- the chore it belongs to. Written exclusively through submit_chore/
-- request_redo/approve_chore (security definer), never directly from the
-- client, same pattern activity_log already follows.
create policy chore_submissions_family_select on public.chore_submissions
  for select using (
    family_id = (select family_id::uuid from public.members where id = public.resolve_active_member_id())
  );

-- ─── submit_chore: insert a fresh submission row on every submit/resubmit ──

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

comment on function public.submit_chore(text, text, text, text) is
  'Server-side submit/resubmit — now also inserts a frozen chore_submissions snapshot row per call, so a later redo cycle does not silently overwrite what an earlier submission actually contained. See chore_submission_history migration.';

-- ─── request_redo: attach the reviewer's decision to the submission it was deciding on ──

create or replace function public.request_redo(p_chore_id text, p_reviewer_id text, p_reason text)
returns public.chore_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chore public.chore_tasks;
  v_reviewer_role text;
  v_new_redo_count integer;
  v_transition_id uuid := gen_random_uuid();
begin
  select * into v_chore from public.chore_tasks where id = p_chore_id for update;

  if v_chore.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;
  if v_chore.status != 'pending_approval' then
    raise exception 'chore % is not pending approval (status=%)', p_chore_id, v_chore.status;
  end if;

  select role into v_reviewer_role from public.members where id = p_reviewer_id;
  if v_reviewer_role != 'parent' and not exists (
    select 1 from public.temporary_approvers
    where granted_to_member_id = p_reviewer_id and family_id = v_chore.family_id
      and expires_at > now() and revoked_at is null
  ) then
    raise exception 'member % is not authorized to request a redo', p_reviewer_id;
  end if;

  v_new_redo_count := coalesce(v_chore.redo_count, 0) + 1;

  update public.chore_participants
    set status = 'declined'
    where chore_id = p_chore_id and role = 'assignee';

  update public.chore_tasks
    set status = 'redo_requested', rejection_reason = p_reason, reviewed_at = now(),
        reviewed_by_id = p_reviewer_id, redo_count = v_new_redo_count
    where id = p_chore_id
    returning * into v_chore;

  -- Attach this decision to the most recent not-yet-reviewed submission
  -- row for this chore — the one the reviewer was actually looking at.
  update public.chore_submissions
    set outcome = 'redo_requested', reviewed_by_id = p_reviewer_id, reviewed_at = now(), reviewed_note = p_reason
    where id = (
      select id from public.chore_submissions
      where chore_id = p_chore_id and reviewed_at is null
      order by submitted_at desc limit 1
    );

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_chore.family_id::uuid, p_reviewer_id, 'declined', 'pending_approval', 'redo_requested', v_transition_id, p_reason);

  return v_chore;
end;
$$;

comment on function public.request_redo(text, text, text) is 'Parent/reviewer declines a submission and asks for a redo — now also marks the matching chore_submissions row with outcome=redo_requested + the reason, instead of only overwriting chore_tasks.rejection_reason (which the next submission would then clobber).';

-- ─── approve_chore: attach the approval decision to the submission it was deciding on ──

create or replace function public.approve_chore(p_chore_id text, p_reviewer_id text)
returns table(chore chore_tasks, coins_paid integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_chore public.chore_tasks;
  v_reviewer_role text;
  v_reviewer_family text;
  v_pts integer;
  v_wallet text;
  v_transition_id uuid := gen_random_uuid();
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_reviewer_id then
    raise exception 'caller is not member %', p_reviewer_id;
  end if;

  select * into v_chore from public.chore_tasks where id = p_chore_id for update;

  if v_chore.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;
  if v_chore.status != 'pending_approval' then
    raise exception 'chore % is not pending approval (status=%)', p_chore_id, v_chore.status;
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
    raise exception 'member % is not authorized to approve chores', p_reviewer_id;
  end if;

  v_pts := coalesce(nullif(v_chore.base_points, 0), v_chore.coins_reward, 0) + coalesce(v_chore.bonus_coins, 0);
  v_wallet := case when v_chore.category_type = 'grandparent_quest' or v_chore.sponsor_user_id is not null then 'gp' else 'main' end;

  update public.chore_tasks
    set status = 'approved', approved_at = now()::text, reviewed_at = now(), reviewed_by_id = p_reviewer_id
    where id = p_chore_id
    returning * into v_chore;

  update public.chore_participants
    set status = 'approved'
    where chore_id = p_chore_id and role = 'assignee';

  insert into public.chore_participants (chore_id, member_id, role, status)
    values (p_chore_id, p_reviewer_id, 'approver', 'approved')
    on conflict (chore_id, member_id, role) do update set status = 'approved';

  if v_pts > 0 and v_chore.assigned_to_id is not null and not coalesce(v_chore.reward_pending_review, false) then
    perform public.award_coins(v_chore.assigned_to_id, v_pts, coalesce(v_chore.xp_reward, 0), v_wallet);
  else
    v_pts := 0;
  end if;

  update public.chore_submissions
    set outcome = 'approved', reviewed_by_id = p_reviewer_id, reviewed_at = now()
    where id = (
      select id from public.chore_submissions
      where chore_id = p_chore_id and reviewed_at is null
      order by submitted_at desc limit 1
    );

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_chore.family_id::uuid, p_reviewer_id, 'approved', 'pending_approval', 'approved', v_transition_id,
      format('%s coins paid', v_pts));

  return query select v_chore, v_pts;
end;
$$;

comment on function public.approve_chore(text, text) is 'Approves a pending_approval chore and pays out — now also marks the matching chore_submissions row with outcome=approved, same pattern request_redo uses.';
