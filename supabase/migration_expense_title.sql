-- Add title column to pet_expenses
-- title: user-facing label e.g. "Annual Checkup", "Royal Canin 15lb bag"
-- notes: optional extra detail, kept for backwards compat
ALTER TABLE pet_expenses
  ADD COLUMN IF NOT EXISTS title text;
