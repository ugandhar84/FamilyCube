-- Cheer Squad: GP/sibling reactions on a completed chore/quest.
-- cheered_by is an array of { memberId, at, coins? } — one entry per person who cheered.

ALTER TABLE public.chore_tasks
  ADD COLUMN IF NOT EXISTS cheered_by jsonb NOT NULL DEFAULT '[]'::jsonb;
