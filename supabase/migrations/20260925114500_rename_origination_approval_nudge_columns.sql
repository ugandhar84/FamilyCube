-- 20260925114000 was already applied to this database before its content
-- was edited (the CLI tracks migrations by filename, not content hash, so
-- the edit never re-ran) — that applied version added
-- approval_nudge_notified_at and left approval_escalated_at alone (it
-- already existed, from 20260908140000, so the ADD COLUMN IF NOT EXISTS
-- was a no-op there — confirmed via the "already exists, skipping" notice
-- at push time). This migration finishes what 20260925114000 was actually
-- meant to do: add the correctly-named, collision-free columns.
alter table public.chore_tasks
  add column if not exists origination_approval_nudge_at timestamptz,
  add column if not exists origination_approval_escalated_at timestamptz;

comment on column public.chore_tasks.origination_approval_nudge_at is
  'Set once chore-deadline-notifier fires the approval-cutoff nudge (~15h into a 24h window) for a pending_parent_approval/pending_kid_proposal chore — a NEW chore awaiting its first yes/no, distinct from the pre-existing approval_escalated_at (submitted-work review cutoff, chore-auto-approve).';
comment on column public.chore_tasks.origination_approval_escalated_at is
  'Set once chore-deadline-notifier escalates an unanswered origination approval to the co-parent (~24h into the window).';

-- The stray column from 20260925114000's original (already-applied)
-- content — superseded by the two above, safe to drop since nothing ever
-- wrote to it (this migration runs immediately after that one, same
-- session, zero real usage window).
alter table public.chore_tasks
  drop column if exists approval_nudge_notified_at;
