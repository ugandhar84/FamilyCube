-- Migration: add missing columns to chore_tasks used by choreStore
-- Run once: psql $DATABASE_URL < supabase/migration_chore_columns.sql

ALTER TABLE public.chore_tasks
  ADD COLUMN IF NOT EXISTS base_points          integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approval_window_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS family_id            text,
  ADD COLUMN IF NOT EXISTS category_type        text DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS quest_mode           text,
  ADD COLUMN IF NOT EXISTS invite_grandparents  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sponsor_user_id      text,
  ADD COLUMN IF NOT EXISTS recurrence_rule      jsonb,
  ADD COLUMN IF NOT EXISTS instance_date        text,
  ADD COLUMN IF NOT EXISTS reviewed_at          timestamptz,
  ADD COLUMN IF NOT EXISTS redo_count           integer DEFAULT 0;

-- Widen the status CHECK to cover all statuses used in the app
ALTER TABLE public.chore_tasks
  DROP CONSTRAINT IF EXISTS chore_tasks_status_check;

ALTER TABLE public.chore_tasks
  ADD CONSTRAINT chore_tasks_status_check
  CHECK (status = ANY (ARRAY[
    'todo','claimed','in_progress','pending_approval',
    'approved','done','completed','declined',
    'redo_requested','archived','cancelled'
  ]));
