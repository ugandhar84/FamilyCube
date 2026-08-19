-- questStore.ts's toRow() has referenced these columns for a while, but no
-- migration ever added them — any addQuest() call that didn't already work
-- around the gap (e.g. via a code path that stripped these fields first)
-- was silently failing with "Could not find the '<column>' column of
-- 'quests' in the schema cache". Voice intake's plain addQuest() call is
-- what finally exercised the un-worked-around path and surfaced it.

ALTER TABLE public.quests
  ADD COLUMN IF NOT EXISTS quest_type      text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS assignment_mode text NOT NULL DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS bounce_count    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_locked       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pushbacks       jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS auto_approve_at timestamptz,
  ADD COLUMN IF NOT EXISTS snoozed_until   timestamptz;
