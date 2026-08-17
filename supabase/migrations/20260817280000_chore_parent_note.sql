-- Parent-authored note on a chore/quest, added AFTER final approval.
-- Distinct from submission_note (the kid's own note when submitting) and
-- rejection_reason (parent's reason for a redo) — this is the one field a
-- parent can still add/edit once a quest is fully approved and paid out;
-- every other field (title, coins, assignee, etc.) is locked at that point.
ALTER TABLE public.chore_tasks
  ADD COLUMN IF NOT EXISTS parent_note text;
