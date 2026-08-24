-- A kid-authored chore (created via KidSmartAskComposer, assigned to a
-- sibling or themselves) must stay invisible to every existing claim/pool/
-- assignee query until a parent approves it — a stronger gate than
-- reward_pending_review (which already exists for "chore is live and
-- claimable, only the PAYOUT is gated" — a teen self-creating a quest for
-- themselves). This is "the chore itself doesn't exist yet as far as
-- anyone but the creator and their parents are concerned."
--
-- Deliberately a boolean flag, not a new chore_tasks_status_check value —
-- the chore's real status stays 'todo' the whole time; every existing
-- status-based query keeps working unmodified, this is purely an
-- additional visibility gate.

ALTER TABLE public.chore_tasks
  ADD COLUMN IF NOT EXISTS created_by_kid_pending_review boolean NOT NULL DEFAULT false;
