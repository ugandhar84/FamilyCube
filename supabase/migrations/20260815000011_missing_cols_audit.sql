-- Comprehensive fix for all columns referenced in store layer but missing from DB.
-- Safe: every statement uses ADD COLUMN IF NOT EXISTS.

-- ── chore_tasks ────────────────────────────────────────────────────────────────
-- GP-welcome flag: parent can offer a partner chore to GP (buy supplies + receipt)
ALTER TABLE public.chore_tasks
  ADD COLUMN IF NOT EXISTS open_to_gp             boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_pool                boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_adult_task          boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS receipt_photo_url      text,
  ADD COLUMN IF NOT EXISTS receipt_amount         numeric(10,2),
  ADD COLUMN IF NOT EXISTS receipt_note           text,
  ADD COLUMN IF NOT EXISTS receipt_submitted_at   timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_reimbursed_at  timestamptz;

-- ── calendar_events ────────────────────────────────────────────────────────────
-- GP/teen dispatch pool columns + ride coins reward
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS is_open_to_grandparents  boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS grandparent_passed_ids    jsonb    NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_open_to_teens          boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ride_coins                integer  DEFAULT NULL;

-- ── kid_requests ───────────────────────────────────────────────────────────────
-- open_to_gp: parent flags an approved ride/tutor/cheer request for GP to claim
ALTER TABLE public.kid_requests
  ADD COLUMN IF NOT EXISTS open_to_gp  boolean  NOT NULL DEFAULT false;
