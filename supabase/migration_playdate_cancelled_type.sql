-- Add playdate_cancelled notification type
-- Separates chat/confirmed-playdate cancellation from request-stage decline (playdate_declined).
-- playdate_declined  = B rejects the initial request
-- playdate_cancelled = either party exits an active chat or cancels a confirmed playdate

ALTER TABLE notification_logs
  DROP CONSTRAINT IF EXISTS notification_logs_type_check;

ALTER TABLE notification_logs
  ADD CONSTRAINT notification_logs_type_check CHECK (type IN (
    -- original
    'lost_alert', 'pet_found', 'appointment_reminder', 'medication_reminder',
    'invite', 'family_update', 'system',
    -- social
    'post_like', 'post_comment', 'follow', 'mention',
    -- playdates
    'playdate_request', 'playdate_resend', 'playdate_accepted', 'playdate_declined',
    'playdate_cancelled',
    'playdate_withdrawal', 'playdate_proposal', 'playdate_confirmed',
    'playdate_proposal_declined', 'playdate_proposal_cancelled',
    'playdate_reminder',
    -- chat
    'chat_message',
    -- positions / trading alerts (PanoraTradeApp cross-use)
    'trail_sl',
    -- catch-all
    'general'
  ));

NOTIFY pgrst, 'reload schema';
