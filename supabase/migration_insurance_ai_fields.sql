-- Extra fields the AI parser can extract from an insurance card/policy photo,
-- shown on the wallet-style summary card. All nullable/additive.
--
-- Run once: psql $DATABASE_URL < supabase/migration_insurance_ai_fields.sql

ALTER TABLE pet_insurance
  ADD COLUMN IF NOT EXISTS deductible numeric(10,2),
  ADD COLUMN IF NOT EXISTS reimbursement_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS annual_limit numeric(10,2),
  ADD COLUMN IF NOT EXISTS claims_phone text;
