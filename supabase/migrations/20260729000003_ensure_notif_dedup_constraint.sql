-- Ensure the dedup unique constraint actually exists on the live DB.
-- Idempotent: drops first so it can be re-run safely.
-- This underpins the upsert in handleNotify — without it every like/comment
-- fires a plain INSERT and creates duplicate notification rows.

ALTER TABLE notification_logs DROP CONSTRAINT IF EXISTS uniq_notification_user_dedup;
ALTER TABLE notification_logs ADD CONSTRAINT  uniq_notification_user_dedup UNIQUE (user_id, dedup_key);
