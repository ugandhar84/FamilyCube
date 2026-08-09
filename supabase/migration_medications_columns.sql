-- Defensive sync: ensure medications table has all columns the app writes to.
-- Live DB had drifted from migration files (missing `notes`), causing
-- PostgREST "Could not find the 'notes' column of 'medications' in the schema cache" on save.
ALTER TABLE public.medications
  ADD COLUMN IF NOT EXISTS notes  text,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';
