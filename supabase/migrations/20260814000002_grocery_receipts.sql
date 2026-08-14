ALTER TABLE grocery_runs
  ADD COLUMN IF NOT EXISTS total_spent numeric(10,2);

CREATE TABLE IF NOT EXISTS grocery_receipts (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id    text NOT NULL,
  run_id       uuid REFERENCES grocery_runs(id),
  store        text,
  scanned_by   text REFERENCES members(id),
  receipt_date date,
  total        numeric(10,2),
  image_url    text,
  ai_raw_json  jsonb,
  created_at   timestamptz DEFAULT now()
);
