-- Migration: add return tracking to grocery_items
ALTER TABLE grocery_items
  ADD COLUMN IF NOT EXISTS is_returning boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS return_quest_id text;
