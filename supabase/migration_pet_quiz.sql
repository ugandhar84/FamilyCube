-- Store per-pet onboarding quiz answers for context-aware notifications
ALTER TABLE pets
  ADD COLUMN IF NOT EXISTS quiz_concerns   jsonb,        -- e.g. ["stomach","anxiety","emergency"]
  ADD COLUMN IF NOT EXISTS quiz_expense_idx integer;     -- 0-6 index into $0/$100/…/$600+
