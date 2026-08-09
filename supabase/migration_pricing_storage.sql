-- Pricing & storage settings seeded into app_settings
-- Run once in Supabase Dashboard → SQL Editor

-- Subscription pricing (admin-editable, read by plans screen)
INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES
  ('pricing_pro_monthly',    '"5.99"', now(), 'system'),
  ('pricing_pro_annual',     '"39.99"', now(), 'system'),
  ('pricing_ultimate_monthly', '"9.99"', now(), 'system'),
  ('pricing_ultimate_annual',  '"69.99"', now(), 'system')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- Storage caps per tier in bytes (admin-editable)
-- free: 100 MB, pro: 2 GB, ultimate: 5 GB
INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES
  ('storage_cap_free_bytes',    '104857600',   now(), 'system'),
  ('storage_cap_pro_bytes',     '2147483648',  now(), 'system'),
  ('storage_cap_ultimate_bytes',  '5368709120',  now(), 'system')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- Add file_size_bytes to pet_photos and social_posts for usage tracking
ALTER TABLE pet_photos    ADD COLUMN IF NOT EXISTS file_size_bytes bigint DEFAULT 0;
ALTER TABLE social_posts  ADD COLUMN IF NOT EXISTS file_size_bytes bigint DEFAULT 0;
