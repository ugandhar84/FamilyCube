-- ── Expand notification_logs type CHECK constraint (v2) ──────────────────────
-- Previous migration missed many types used by edge functions and client-side
-- social code, causing those INSERT calls to fail with a constraint violation.
-- The push still fired (functions continued past the error), but no row was
-- inserted — so mood_reminder, walk_reminder, and many others never appeared
-- in the in-app notifications page.
--
-- Run once: psql $DATABASE_URL < supabase/migration_notification_types_v2.sql

ALTER TABLE notification_logs
  DROP CONSTRAINT IF EXISTS notification_logs_type_check;

ALTER TABLE notification_logs
  ADD CONSTRAINT notification_logs_type_check CHECK (type IN (
    -- Alerts / SOS
    'lost_alert', 'pet_found', 'lost_owner_checkin',

    -- Health
    'appointment_reminder', 'appointment_complete_prompt',
    'medication_reminder', 'med_missed_dose', 'med_monthly_nudge', 'med_monthly_followup',
    'vaccine_reminder', 'symptom_scan_ready',

    -- Care reminders
    'walk_reminder', 'feeding_reminder', 'mood_reminder',
    'birthday_notif', 'memorial_notif', 'daily_tip',

    -- Social — posts & follows
    'post_like', 'post_comment', 'follow', 'mention', 'new_post',

    -- Social — playdates
    'playdate_request', 'playdate_resend', 'playdate_proposal', 'playdate_counter_proposal',
    'playdate_accepted', 'playdate_confirmed', 'playdate_declined',
    'playdate_proposal_declined', 'playdate_proposal_cancelled',
    'playdate_withdrawal', 'playdate_cancelled', 'playdate_rescheduled',
    'playdate_reminder', 'playdate_completion', 'playdate_expired',
    'playdate_chat_message', 'playdate_message',

    -- Chat
    'chat_message',

    -- Family
    'invite', 'family_invite', 'family_invite_sent', 'invite_accepted', 'family_update',

    -- Events
    'event_rsvp', 'event_update',

    -- System / misc
    'upgrade_nudge', 'broadcast', 'account_deletion_scheduled',
    'trail_sl', 'reengagement', 'streak_recovery',
    'system', 'general'
  ));

NOTIFY pgrst, 'reload schema';
