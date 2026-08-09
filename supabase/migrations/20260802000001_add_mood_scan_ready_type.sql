-- Add mood_scan_ready to the notification_logs type CHECK constraint.
-- This type is fired as a local notification when the user navigates away
-- mid-scan; it is future-proofed here so any edge-function logging of it
-- won't fail silently.
-- All other previously missing types were covered in 20260729000001.

ALTER TABLE notification_logs DROP CONSTRAINT IF EXISTS notification_logs_type_check;

ALTER TABLE notification_logs
  ADD CONSTRAINT notification_logs_type_check CHECK (type IN (
    -- Health & appointments
    'lost_alert', 'pet_found', 'found_pet',
    'appointment_reminder', 'appointment_complete_prompt',
    'vaccine_reminder', 'medication_reminder', 'health_alert',
    -- Feeding
    'feeding_reminder',
    -- Activity reminders
    'walk_reminder', 'mood_reminder',
    -- Mood scan
    'mood_scan_ready',
    -- Medication compliance
    'med_missed_dose', 'med_monthly_nudge', 'med_monthly_followup',
    -- Symptom scan
    'symptom_scan_ready',
    -- Family
    'invite', 'invite_accepted', 'family_invite', 'family_invite_sent', 'family_update',
    -- Social feed
    'post_like', 'post_comment', 'follow', 'mention', 'new_post',
    -- Playdates
    'playdate_request', 'playdate_resend', 'playdate_accepted', 'playdate_declined',
    'playdate_withdrawal', 'playdate_proposal', 'playdate_counter_proposal',
    'playdate_confirmed', 'playdate_cancelled', 'playdate_rescheduled',
    'playdate_expired', 'playdate_completion', 'playdate_reminder',
    'playdate_proposal_declined', 'playdate_proposal_cancelled',
    -- Chat
    'chat_message', 'playdate_message', 'playdate_chat_message',
    -- Events
    'event_rsvp', 'event_update',
    -- Daily / milestones
    'birthday_notif', 'memorial_notif', 'daily_tip', 'daily_care',
    -- Upgrade
    'upgrade_nudge',
    -- Lost pet owner check-ins
    'lost_owner_checkin',
    -- Broadcast
    'broadcast',
    -- System
    'system'
  ));
