-- Allow authenticated users to insert notifications for other users.
-- Required for client-side like/comment/follow notifications written from the app
-- (insertNotification / upsertNotification in lib/db/posts.ts).
-- Edge functions use service-role and bypass RLS, so playdate notifications
-- already work without this policy. Social notifications do not go through an
-- edge function and were silently dropped before this migration.
--
-- Run once: psql $DATABASE_URL < supabase/migration_notification_insert_policy.sql

-- Expand the type CHECK constraint to cover all notification types the app uses.
-- The original schema only allowed 5 types; social + playdate types were missing.
ALTER TABLE notification_logs
  DROP CONSTRAINT IF EXISTS notification_logs_type_check;

ALTER TABLE notification_logs
  ADD CONSTRAINT notification_logs_type_check CHECK (type IN (
    -- Health & appointments
    'lost_alert', 'pet_found', 'found_pet',
    'appointment_reminder', 'vaccine_reminder', 'medication_reminder', 'health_alert',
    -- Family
    'invite', 'invite_accepted', 'family_invite', 'family_update',
    -- Social
    'post_like', 'post_comment', 'follow', 'mention',
    -- Playdates
    'playdate_request', 'playdate_resend', 'playdate_accepted', 'playdate_declined',
    'playdate_withdrawal', 'playdate_proposal', 'playdate_counter_proposal',
    'playdate_confirmed', 'playdate_cancelled', 'playdate_rescheduled',
    'playdate_expired', 'playdate_completion', 'playdate_reminder',
    -- Chat
    'chat_message', 'playdate_message', 'playdate_chat_message',
    -- Events
    'event_rsvp', 'event_update',
    -- Daily / milestones
    'birthday_notif', 'memorial_notif', 'daily_tip', 'daily_care',
    -- Trailing stops (stock alerts — Panora integration)
    'trail_sl',
    -- System
    'system'
  ));

-- Allow any signed-in user to insert a notification row.
-- Inserting for yourself is harmless; inserting for another user (likes, comments,
-- follows) is the intended use case. The app never inserts spam — rows are gated
-- by recipientAllowsNotif() before this insert runs.
DROP POLICY IF EXISTS "notification_logs: authenticated users can insert" ON notification_logs;
CREATE POLICY "notification_logs: authenticated users can insert" ON notification_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
