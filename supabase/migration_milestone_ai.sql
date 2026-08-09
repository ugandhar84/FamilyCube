-- Migration: AI-generated milestones support
-- Run once: psql $DATABASE_URL < supabase/migration_milestone_ai.sql

-- Add milestone_type to distinguish day-count vs AI-generated milestones
ALTER TABLE milestones
  ADD COLUMN IF NOT EXISTS milestone_type text NOT NULL DEFAULT 'day_count',
  ADD COLUMN IF NOT EXISTS emoji text,
  ADD COLUMN IF NOT EXISTS category text;

-- AI milestones use a text key instead of day_count, so relax the unique constraint.
-- The old constraint was UNIQUE(pet_id, day_count) — drop it and add separate ones.
ALTER TABLE milestones
  DROP CONSTRAINT IF EXISTS milestones_pet_day_unique;

-- Day-count milestones: still unique per pet per day
CREATE UNIQUE INDEX IF NOT EXISTS milestones_pet_day_count_unique
  ON milestones (pet_id, day_count)
  WHERE milestone_type = 'day_count';

-- AI milestones: unique per pet per title (prevents duplicate regeneration)
CREATE UNIQUE INDEX IF NOT EXISTS milestones_pet_ai_title_unique
  ON milestones (pet_id, title)
  WHERE milestone_type = 'ai';
