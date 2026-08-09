-- ── Fix 1: push_tokens — enforce one token per device, not one per (user,token) ──
-- The old UNIQUE(user_id, token) allowed the SAME Expo push token to be stored
-- for multiple user_ids. On a shared/test device this caused every user's cron
-- notifications to land on the same phone.
-- New: UNIQUE(token) — a token belongs to exactly one user at a time.

ALTER TABLE push_tokens DROP CONSTRAINT IF EXISTS push_tokens_user_id_token_key;
ALTER TABLE push_tokens DROP CONSTRAINT IF EXISTS push_tokens_token_key;

-- Remove any duplicate rows keeping only the most-recently-updated one per token
DELETE FROM push_tokens a
USING push_tokens b
WHERE a.token = b.token
  AND a.updated_at < b.updated_at;

ALTER TABLE push_tokens ADD CONSTRAINT push_tokens_token_key UNIQUE (token);

-- ── Fix 2: notification_logs — add missing types to CHECK constraint ──────────
-- 'mood_reminder' and 'walk_reminder' were absent, causing dedup INSERTs to fail
-- silently and allowing repeated pushes across cron runs.

ALTER TABLE notification_logs
  DROP CONSTRAINT IF EXISTS notification_logs_type_check;

ALTER TABLE notification_logs
  ADD CONSTRAINT notification_logs_type_check CHECK (type IN (
    -- Health & appointments
    'lost_alert', 'pet_found', 'found_pet',
    'appointment_reminder', 'vaccine_reminder', 'medication_reminder', 'health_alert',
    -- Feeding
    'feeding_reminder',
    -- Activity reminders
    'walk_reminder', 'mood_reminder',
    -- Medication compliance
    'med_missed_dose', 'med_monthly_nudge', 'med_monthly_followup',
    -- Symptom scan
    'symptom_scan_ready',
    -- Family
    'invite', 'invite_accepted', 'family_invite', 'family_update',
    -- Social feed
    'post_like', 'post_comment', 'follow', 'mention', 'new_post',
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
    -- Upgrade
    'upgrade_nudge',
    -- Broadcast
    'broadcast',
    -- System
    'system'
  ));
