CREATE TABLE IF NOT EXISTS grocery_receipt_items (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  receipt_id   uuid NOT NULL REFERENCES grocery_receipts(id) ON DELETE CASCADE,
  family_id    text NOT NULL,
  name         text NOT NULL,
  category     text,
  quantity     numeric,
  unit_price   numeric(10,2),
  total_price  numeric(10,2),
  brand        text,
  added_to_list boolean DEFAULT false
);
