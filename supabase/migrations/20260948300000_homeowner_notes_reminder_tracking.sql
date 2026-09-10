-- Tracks which reminder pushes have already gone out for a homeowner note
-- so the daily sweeper (homeowner-notes-sweeper) doesn't re-send the same
-- "due in a week"/"due today" push every time it runs on the same day
-- [live-requested: "a week before and on the day"].
alter table public.homeowner_notes add column if not exists week_before_notified_at timestamptz;
alter table public.homeowner_notes add column if not exists due_day_notified_at timestamptz;
