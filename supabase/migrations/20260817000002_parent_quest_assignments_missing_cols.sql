-- choreStore writes bounce_count/snooze_until/actionable_pushback/pushback_details
-- to parent_quest_assignments (Two-Bounce Rule pushback flow) but the table was
-- never given those columns — every insert/update has been silently failing.

ALTER TABLE public.parent_quest_assignments
  ADD COLUMN IF NOT EXISTS bounce_count        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS snooze_until         timestamptz,
  ADD COLUMN IF NOT EXISTS actionable_pushback  text,
  ADD COLUMN IF NOT EXISTS pushback_details     text;
