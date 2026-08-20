-- Household Backlog's pool "disable without deleting" toggle
-- (PoolQuestCard.tsx) was writing is_private_parent instead of a dedicated
-- column — a field with a completely different meaning (hides the chore
-- from every non-parent role, excludes it from the parent review deck) and
-- one that isn't even persisted as its own DB column, so the "disable"
-- silently reverted on the next sync anyway. Adding the real column the
-- client now reads/writes via choreFromRow/updateChore.

ALTER TABLE public.chore_tasks
  ADD COLUMN IF NOT EXISTS is_disabled boolean NOT NULL DEFAULT false;
