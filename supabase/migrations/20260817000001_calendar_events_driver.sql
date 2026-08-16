-- Separate "who tutors/escorts/coaches" (helper) from "who drives" for events
-- where a kid can fill in an external tutor/escort/coach name while transport
-- is still a separate, parent-decided need (e.g. Ms. Rao tutors, Dad drives).

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS ride_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS driver_name   text,
  ADD COLUMN IF NOT EXISTS driver_status text;
