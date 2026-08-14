-- Drop the FK constraint on scanned_by so any member ID string works
ALTER TABLE grocery_receipts
  DROP CONSTRAINT IF EXISTS grocery_receipts_scanned_by_fkey;
