-- Shift seed events back 1 day: DB inserted with UTC CURRENT_DATE,
-- but app queries by local date (one day behind UTC for US timezones).
UPDATE public.calendar_events
SET date = date - INTERVAL '1 day'
WHERE date >= '2026-08-13' AND date <= '2026-08-17';
