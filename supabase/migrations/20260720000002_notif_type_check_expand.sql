-- Expand notification_logs type CHECK to include all types used by edge functions and client.
ALTER TABLE notification_logs
  DROP CONSTRAINT IF EXISTS notification_logs_type_check;

ALTER TABLE notification_logs
  ADD CONSTRAINT notification_logs_type_check CHECK (type IN (
    -- Health & appointments
    'lost_alert', 'pet_found', 'found_pet',
    'appointment_reminder', 'vaccine_reminder', 'medication_reminder', 'health_alert',
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
    -- Broadcast (admin push to all — user_id may be null for aggregate log row)
    'broadcast',
    -- System
    'system'
  ));
