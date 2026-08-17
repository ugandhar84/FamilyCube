-- GP Quest targeting + coins split support.
-- A grandparent can publish a quest to:
--   1. one specific kid        → assigned_to_id set, full points
--   2. several kids            → one clone per kid, points split evenly
--   3. no kids (bounty pool)   → is_pool=true, any kid can first-come claim

ALTER TABLE public.chore_tasks
  ADD COLUMN IF NOT EXISTS target_child_ids    text[]   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS coins_split_per_kid integer;