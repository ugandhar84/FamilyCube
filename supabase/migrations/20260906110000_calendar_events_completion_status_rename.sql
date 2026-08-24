-- Corrects 20260906100000_calendar_events_status_completion_sweep.sql —
-- calendar_events already had a real, unrelated `status` column in
-- production (every existing row is 'approved', an approval-workflow
-- value with no migration history in this repo — it predates the tracked
-- migrations entirely). That prior migration's `ADD COLUMN IF NOT EXISTS
-- status ...` silently no-op'd against it, so the CHECK/default never
-- applied and nothing was actually added. Using a distinct column name
-- here instead of touching the existing status column at all.

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS completion_status text NOT NULL DEFAULT 'scheduled'
    CHECK (completion_status IN ('scheduled', 'completed'));
