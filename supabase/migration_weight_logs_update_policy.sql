-- Allow users with health-logging rights to update their own pet's weight logs.
-- The INSERT and DELETE policies already use can_log_health(); UPDATE was missing,
-- causing updateWeightLog() to silently fail or throw for all users.
--
-- Run once: psql $DATABASE_URL < supabase/migration_weight_logs_update_policy.sql

DROP POLICY IF EXISTS "weight_logs: health roles can update" ON weight_logs;
CREATE POLICY "weight_logs: health roles can update" ON weight_logs
  FOR UPDATE
  USING (can_log_health(pet_id))
  WITH CHECK (can_log_health(pet_id));
