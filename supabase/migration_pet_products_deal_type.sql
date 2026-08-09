-- Add deal_type to pet_products for clearance and rollback pricing badges
ALTER TABLE pet_products
  ADD COLUMN IF NOT EXISTS deal_type text
  CHECK (deal_type IN ('clearance', 'rollback'));
