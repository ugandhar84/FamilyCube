-- ── Expand notification_logs type CHECK constraint ───────────────────────────
-- Original only had 5 types. App sends many more (post_like, post_comment,
-- chat_message, playdate_*, trail_sl, etc). Drop and recreate with full list.

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
    'playdate_withdrawal', 'playdate_proposal', 'playdate_confirmed',
    'playdate_proposal_declined', 'playdate_proposal_cancelled',
    'playdate_reminder',
    -- chat
    'chat_message',
    -- positions / trading alerts (PanoraTradeApp cross-use)
    'trail_sl',
    -- catch-all for future types added via edge functions
    'general'
  ));

-- ── increment_post_likes RPC ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_post_likes(p_post_id uuid, p_delta integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE social_posts
  SET    likes_count = GREATEST(0, COALESCE(likes_count, 0) + p_delta)
  WHERE  id = p_post_id;
END;
$$;
GRANT EXECUTE ON FUNCTION increment_post_likes(uuid, integer) TO authenticated;

-- ── increment_post_comments RPC (idempotent) ─────────────────────────────────
CREATE OR REPLACE FUNCTION increment_post_comments(p_post_id uuid, p_delta integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE social_posts
  SET    comments_count = GREATEST(0, COALESCE(comments_count, 0) + p_delta)
  WHERE  id = p_post_id;
END;
$$;
GRANT EXECUTE ON FUNCTION increment_post_comments(uuid, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
