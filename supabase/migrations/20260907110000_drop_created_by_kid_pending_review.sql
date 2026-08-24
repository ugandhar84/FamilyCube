-- Supersedes 20260907100000_chore_tasks_kid_proposed_column.sql — that
-- migration added a client-computed boolean gate for kid-authored chores.
-- Corrected direction: state must live authoritatively in the DB per role
-- (creator/assignee/approver), matching the event_participants/RPC pattern
-- already built this session, not another client-side derived flag. See
-- 20260907120000_kid_proposed_chore_rpcs.sql for the real implementation
-- (a chore_tasks.status value + chore_participants rows + RPCs). This
-- column was never used by any shipped feature — added and superseded
-- within the same session, no real data could exist in it — safe to drop
-- outright rather than leave as dead schema.

ALTER TABLE public.chore_tasks
  DROP COLUMN IF EXISTS created_by_kid_pending_review;
