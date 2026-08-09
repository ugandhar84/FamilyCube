-- Performance indexes for high-traffic tables.
-- Run once: psql $DATABASE_URL < supabase/migration_perf_indexes.sql
-- All use CREATE INDEX IF NOT EXISTS so re-running is safe.

-- ── Journal tables ────────────────────────────────────────────────────────────
-- Chat messages: most common query is "all messages for chat ordered by time"
CREATE INDEX IF NOT EXISTS idx_chat_msgs_chat_time
  ON playdate_chat_messages (chat_id, created_at DESC);

-- Notification logs: most common query is "unread for user"
CREATE INDEX IF NOT EXISTS idx_notif_user_unread
  ON notification_logs (user_id, read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notif_type
  ON notification_logs (type, user_id, read);

-- Weight logs: per-pet time series
CREATE INDEX IF NOT EXISTS idx_weight_pet_time
  ON weight_logs (pet_id, logged_at DESC);

-- Mood logs: per-pet calendar queries
CREATE INDEX IF NOT EXISTS idx_mood_pet_date
  ON mood_logs (pet_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_mood_pet_created
  ON mood_logs (pet_id, created_at DESC);

-- Feeding logs
CREATE INDEX IF NOT EXISTS idx_feeding_pet_time
  ON feeding_logs (pet_id, fed_at DESC);

CREATE INDEX IF NOT EXISTS idx_feeding_pet_date
  ON feeding_logs (pet_id, date DESC);

-- Grooming logs
CREATE INDEX IF NOT EXISTS idx_groom_pet_date
  ON grooming_logs (pet_id, done_at DESC);

-- Daily checklist: most common = completed items for a pet on a date
CREATE INDEX IF NOT EXISTS idx_checklist_pet_date
  ON daily_checklist (pet_id, date DESC, completed);

CREATE INDEX IF NOT EXISTS idx_checklist_pet_completed
  ON daily_checklist (pet_id, completed, completed_at DESC);

-- Pet photos (memories): per-pet, newest first
CREATE INDEX IF NOT EXISTS idx_pet_photos_pet_time
  ON pet_photos (pet_id, taken_at DESC);

-- Milestones
CREATE INDEX IF NOT EXISTS idx_milestones_pet
  ON milestones (pet_id, achieved_at DESC);

-- Vet visits
CREATE INDEX IF NOT EXISTS idx_vet_visits_pet_date
  ON vet_visits (pet_id, visit_date DESC);

-- Appointments: upcoming filter (status + scheduled_at)
CREATE INDEX IF NOT EXISTS idx_appts_pet_upcoming
  ON appointments (pet_id, status, scheduled_at ASC);

-- Vaccines: per-pet, next due
CREATE INDEX IF NOT EXISTS idx_vaccines_pet_due
  ON vaccines (pet_id, next_due ASC NULLS LAST);

-- Medications: per-pet, active first
CREATE INDEX IF NOT EXISTS idx_meds_pet_active
  ON medications (pet_id, is_active DESC, created_at DESC);

-- Social posts: feed query (public posts ordered by time — already exists but add updated_at)
CREATE INDEX IF NOT EXISTS idx_social_posts_updated
  ON social_posts (updated_at DESC NULLS LAST, created_at DESC);

-- Pet follows: for "following" feed filter
CREATE INDEX IF NOT EXISTS idx_pet_follows_composite
  ON pet_follows (follower_id, following_pet_id);

-- Playdate chats: per-pet queries (added in recent work)
CREATE INDEX IF NOT EXISTS idx_chats_from_pet
  ON playdate_chats (from_pet_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chats_to_pet
  ON playdate_chats (to_pet_id, created_at DESC);
