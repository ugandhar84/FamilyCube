-- Add adult-task and grandparent-invite flags to quests table
ALTER TABLE quests
  ADD COLUMN IF NOT EXISTS is_adult_task       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS invite_grandparents boolean NOT NULL DEFAULT false;
