-- Appointment status cleanup
-- Introduces: completed, cancelled, upcoming as canonical statuses
-- 'scheduled' remains valid (alias for upcoming — not changed for old rows)
-- Run once: psql $DATABASE_URL < supabase/migration_appointment_status.sql

-- 1. Back-fill: past appointments that are still 'scheduled' → 'completed'
UPDATE appointments
   SET status = 'completed'
 WHERE scheduled_at < now()
   AND status = 'scheduled';

-- 2. Future-proof: daily cron to auto-complete newly-past appointments
--    (runs at 00:05 UTC every day)
SELECT cron.schedule(
  'auto-complete-past-appointments',
  '5 0 * * *',
  $$
    UPDATE appointments
       SET status = 'completed'
     WHERE scheduled_at < now()
       AND status IN ('scheduled', 'upcoming');
  $$
);
