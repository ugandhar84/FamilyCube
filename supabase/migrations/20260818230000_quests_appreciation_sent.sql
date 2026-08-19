-- questStore.ts's toRow/fromRow have referenced appreciation_sent since the
-- co-parent-appreciation feature was built, but no migration ever actually
-- added the column — every quest insert/update has been silently failing
-- ("Could not find the 'appreciation_sent' column of 'quests' in the schema
-- cache") until now.

ALTER TABLE public.quests
  ADD COLUMN IF NOT EXISTS appreciation_sent boolean NOT NULL DEFAULT false;
