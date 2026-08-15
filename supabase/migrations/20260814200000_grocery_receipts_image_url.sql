-- Add image_url to grocery_receipts so the scanned photo can be shown in history
ALTER TABLE grocery_receipts
  ADD COLUMN IF NOT EXISTS image_url text;
