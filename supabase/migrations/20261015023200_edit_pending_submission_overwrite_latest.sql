-- edit_pending_chore_submission — correction: overwrite the latest
-- unreviewed chore_submissions row in place instead of inserting a new
-- one on every edit [live-reported: "edit should only overwrite the last
-- unreviewd sumbission not the all or not create new one" — the previous
-- version (20261014210000_edit_pending_chore_submission.sql) inserted a
-- fresh snapshot row per edit, which would let a kid rack up N rows for
-- N edits of the SAME still-pending submission before a parent ever
-- reviews it — not what "edit" should mean. A genuinely new submission
-- (fresh submit_chore call, declined→resubmit) still always inserts its
-- own row as before; this only changes what happens while correcting the
-- one row that hasn't been reviewed yet.
create or replace function public.edit_pending_chore_submission(
  p_chore_id text, p_member_id text,
  p_note text default null, p_photo_url text default null
)
returns public.chore_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chore public.chore_tasks;
  v_latest_submission_id uuid;
begin
  select * into v_chore from public.chore_tasks where id = p_chore_id for update;

  if v_chore.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;
  if v_chore.assigned_to_id is distinct from p_member_id then
    raise exception 'member % is not the assignee of chore %', p_member_id, p_chore_id;
  end if;
  if v_chore.status is distinct from 'pending_approval' then
    raise exception 'chore % is not a pending submission (status=%)', p_chore_id, v_chore.status;
  end if;
  if coalesce(v_chore.requires_photo, false) and p_photo_url is null then
    raise exception 'chore % requires a photo', p_chore_id;
  end if;

  -- The most recent, still-unreviewed submission row for this chore —
  -- outcome is null until approve_chore/request_redo sets it, so this is
  -- always the one awaiting review right now.
  select id into v_latest_submission_id
    from public.chore_submissions
    where chore_id = p_chore_id and outcome is null
    order by submitted_at desc
    limit 1;

  if v_latest_submission_id is not null then
    update public.chore_submissions
      set note = p_note, photo_url = p_photo_url, submitted_at = now()
      where id = v_latest_submission_id;
  else
    -- No history row yet (e.g. a chore submitted before this table
    -- existed) — fall back to inserting one so history isn't silently
    -- skipped.
    insert into public.chore_submissions (chore_id, family_id, submitted_by_id, note, photo_url, redo_round)
      values (p_chore_id, v_chore.family_id::uuid, p_member_id, p_note, p_photo_url, coalesce(v_chore.redo_count, 0));
  end if;

  update public.chore_tasks
    set submission_note = p_note,
        submission_photo_url = p_photo_url
    where id = p_chore_id
    returning * into v_chore;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, note)
    values ('chore', p_chore_id, v_chore.family_id::uuid, p_member_id, 'submission_edited', 'pending_approval', 'pending_approval',
      'kid corrected their pending submission');

  return v_chore;
end;
$$;
