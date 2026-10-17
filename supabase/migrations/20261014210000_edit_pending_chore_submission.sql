-- edit_pending_chore_submission — let the assignee correct their OWN
-- already-submitted proof (retake photo / fix the comment) while a chore
-- is still pending_approval, without losing history.
--
-- KidQuestDetailScreen's new "Edit submission" action
-- (features/hub/kid/KidQuestDetailScreen.tsx) was built against a plain
-- updateChore() patch of chore_tasks.submission_note/submission_photo_url
-- — RLS allows that write (any non-terminal-status update is unrestricted
-- family-wide, see 20260925112000_chore_tasks_approver_only_write.sql),
-- but it silently overwrote the row in place with no trace of what was
-- submitted before [live-reported: "why is it replacing previous
-- submission data we should have the full history of their submissions"].
-- chore_submissions (20260988000000_chore_submission_history.sql) already
-- exists as the real append-only history — submit_chore inserts one frozen
-- row per call — but submit_chore itself rejects status='pending_approval'
-- ("chore % is not submittable"), so there was no server path for
-- "correct the CURRENT pending submission" at all. This RPC is that path:
-- same snapshot-then-patch shape as submit_chore, but scoped to the one
-- case submit_chore doesn't cover — editing in place while still pending,
-- same redo_round (this isn't a new redo cycle, just a correction to the
-- one already awaiting review).
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

  -- Frozen snapshot of the correction, same redo_round as the submission
  -- it's editing (not a new redo cycle — still the same review round).
  insert into public.chore_submissions (chore_id, family_id, submitted_by_id, note, photo_url, redo_round)
    values (p_chore_id, v_chore.family_id::uuid, p_member_id, p_note, p_photo_url, coalesce(v_chore.redo_count, 0));

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

grant execute on function public.edit_pending_chore_submission(text, text, text, text) to authenticated;
