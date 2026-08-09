-- Notification deduplication: one in-app notification slot per action per object.
--
-- dedup_key rules:
--   Like:     'like:<post_id>'                           → upserted on like, deleted on unlike
--   Follow:   'follow:<follower_pet_id>:<target_pet_id>' → upserted on follow, deleted on unfollow
--   Chat msg: 'chat:<chat_id>'                           → latest message replaces previous unread
--
-- Rows WITHOUT a dedup_key (NULL) are unconstrained (NULL != NULL in Postgres UNIQUE).
-- Run once: psql $DATABASE_URL < supabase/migration_notification_dedup.sql

ALTER TABLE notification_logs
  ADD COLUMN IF NOT EXISTS dedup_key text;

ALTER TABLE notification_logs
  DROP CONSTRAINT IF EXISTS uniq_notification_user_dedup;

ALTER TABLE notification_logs
  ADD CONSTRAINT uniq_notification_user_dedup
  UNIQUE (user_id, dedup_key);
