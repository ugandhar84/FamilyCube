ALTER TABLE public.quests
  ADD COLUMN IF NOT EXISTS is_adult_task boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_quests_adult_task
  ON public.quests (is_adult_task)
  WHERE is_adult_task = true;
