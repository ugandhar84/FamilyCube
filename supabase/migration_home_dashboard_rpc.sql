-- Drop the old date-typed overload before creating the text version
DROP FUNCTION IF EXISTS get_home_dashboard(uuid, uuid, date);

-- Single RPC for all home screen data on startup.
-- Replaces: 6× HEAD count queries + GET vet_visits + GET daily_scan_counts
-- + GET mood_logs (latest) + GET milestones + GET daily_checklist
-- Called once after auth resolves — everything the home tab needs in one round trip.
CREATE OR REPLACE FUNCTION get_home_dashboard(
  p_pet_id   uuid,
  p_user_id  uuid,
  p_date     text DEFAULT NULL   -- accept as text to avoid client coercion issues
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  result  jsonb;
  v_date  date := COALESCE(p_date::date, CURRENT_DATE);
BEGIN
  SELECT jsonb_build_object(
    -- Today's activity counts (replaces 6 HEAD queries)
    'counts', jsonb_build_object(
      'notes',     (SELECT COUNT(*) FROM pet_notes    WHERE pet_id = p_pet_id AND (noted_at::date = v_date OR created_at::date = v_date)),
      'moods',     (SELECT COUNT(*) FROM mood_logs    WHERE pet_id = p_pet_id AND date = v_date),
      'meals',     (SELECT COUNT(*) FROM feeding_logs WHERE pet_id = p_pet_id AND date = v_date),
      'grooming',  (SELECT COUNT(*) FROM grooming_logs WHERE pet_id = p_pet_id AND done_at = v_date),
      'weight',    (SELECT COUNT(*) FROM weight_logs  WHERE pet_id = p_pet_id AND logged_at::date = v_date),
      'vet',       (SELECT COUNT(*) FROM vet_visits   WHERE pet_id = p_pet_id AND visit_date = v_date)
    ),
    -- Next upcoming vet appointment (vet/checkup/vaccination only — not grooming)
    'next_vet', (
      SELECT scheduled_at::text
        FROM appointments
       WHERE pet_id = p_pet_id
         AND status IN ('scheduled', 'upcoming')
         AND type IN ('vet', 'checkup', 'vaccination')
         AND scheduled_at > now()
       ORDER BY scheduled_at ASC
       LIMIT 1
    ),
    -- Most recent completed vet appointment (for "Last Visit" fallback)
    'last_vet', (
      SELECT row_to_json(r) FROM (
        SELECT scheduled_at::text AS date, type, title
          FROM appointments
         WHERE pet_id = p_pet_id
           AND status = 'completed'
           AND type IN ('vet', 'checkup', 'vaccination')
         ORDER BY scheduled_at DESC
         LIMIT 1
      ) r
    ),
    -- Today's scan count (replaces GET daily_scan_counts)
    'scan_count', COALESCE((
      SELECT count FROM daily_scan_counts
      WHERE pet_id = p_pet_id AND date = v_date
    ), 0),
    -- Latest mood (replaces GET mood_logs)
    'latest_mood', (
      SELECT row_to_json(r) FROM (
        SELECT mood_label, mood_score, date, created_at
        FROM mood_logs WHERE pet_id = p_pet_id
        ORDER BY created_at DESC LIMIT 1
      ) r
    ),
    -- Today's checklist (replaces GET daily_checklist)
    'checklist', COALESCE((
      SELECT jsonb_agg(row_to_json(r)) FROM (
        SELECT id, label, type, date, completed, completed_at, completed_by
        FROM daily_checklist
        WHERE pet_id = p_pet_id AND date = v_date
        ORDER BY created_at
      ) r
    ), '[]'::jsonb),
    -- Notification counts (replaces 2× HEAD notification_logs)
    'notif_general', (
      SELECT COUNT(*) FROM notification_logs
      WHERE user_id = p_user_id AND read = false
        AND type NOT IN (
          'post_like','post_comment','follow','mention',
          'playdate_request','playdate_resend','playdate_accepted','playdate_declined',
          'playdate_withdrawal','playdate_proposal','playdate_counter_proposal',
          'playdate_confirmed','playdate_proposal_declined','playdate_proposal_cancelled',
          'playdate_cancelled','playdate_reminder','playdate_rescheduled',
          'playdate_expired','playdate_completion','playdate_chat_message',
          'chat_message'
        )
    ),
    'notif_social', (
      SELECT COUNT(*) FROM notification_logs
      WHERE user_id = p_user_id AND read = false
        AND type IN (
          'post_like','post_comment','follow','mention',
          'playdate_request','playdate_resend','playdate_accepted','playdate_declined',
          'playdate_withdrawal','playdate_proposal','playdate_counter_proposal',
          'playdate_confirmed','playdate_proposal_declined','playdate_proposal_cancelled',
          'playdate_cancelled','playdate_reminder','playdate_rescheduled',
          'playdate_expired','playdate_completion','playdate_chat_message',
          'chat_message'
        )
    )
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_home_dashboard(uuid, uuid, text) TO authenticated;
