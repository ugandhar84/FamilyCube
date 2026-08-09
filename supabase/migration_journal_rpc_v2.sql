-- v2: adds cursor-based pagination so the journal can load pages as the user scrolls.
-- cursor = ISO timestamp of the oldest entry on the current page (null = first page).
-- Each sub-query only returns rows older than the cursor, keeping DB work minimal.
CREATE OR REPLACE FUNCTION get_pet_journal(
  p_pet_id  uuid,
  p_limit   int DEFAULT 60,
  p_cursor  timestamptz DEFAULT NULL   -- null → first page; set to oldest timestamp for next page
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
  -- If no cursor, use far future so all rows qualify
  v_before timestamptz := COALESCE(p_cursor, '9999-12-31'::timestamptz);
BEGIN
  SELECT jsonb_build_object(
    'notes', COALESCE((
      SELECT jsonb_agg(row_to_json(r)) FROM (
        SELECT id, content, is_private, noted_at, created_at, updated_at, author_id
        FROM pet_notes
        WHERE pet_id = p_pet_id AND COALESCE(noted_at::timestamptz, created_at::timestamptz) < v_before
        ORDER BY noted_at DESC LIMIT p_limit
      ) r), '[]'::jsonb),

    'moods', COALESCE((
      SELECT jsonb_agg(row_to_json(r)) FROM (
        SELECT id, mood_label, mood_score, happy_pct, playful_pct, tired_pct, anxious_pct,
               photo_url, notes, situation, advice, date, created_at, scanned_by
        FROM mood_logs
        WHERE pet_id = p_pet_id AND created_at < v_before
        ORDER BY created_at DESC LIMIT p_limit
      ) r), '[]'::jsonb),

    'meals', COALESCE((
      SELECT jsonb_agg(row_to_json(r)) FROM (
        SELECT id, meal_type, amount_grams, food_type, date, fed_at, fed_by, photo_url
        FROM feeding_logs
        WHERE pet_id = p_pet_id AND fed_at < v_before
        ORDER BY fed_at DESC LIMIT p_limit
      ) r), '[]'::jsonb),

    'grooming', COALESCE((
      SELECT jsonb_agg(row_to_json(r)) FROM (
        SELECT id, type, done_at, done_at_time, done_at_ts, done_by, notes, photo_url
        FROM grooming_logs
        WHERE pet_id = p_pet_id
          AND COALESCE(done_at_ts, done_at_time::timestamptz, done_at::timestamptz) < v_before
        ORDER BY COALESCE(done_at_ts, done_at::timestamptz) DESC LIMIT p_limit
      ) r), '[]'::jsonb),

    'vet_visits', COALESCE((
      SELECT jsonb_agg(row_to_json(r)) FROM (
        SELECT id, visit_date, visit_ts, vet_name, clinic_name, reason, diagnosis
        FROM vet_visits
        WHERE pet_id = p_pet_id AND COALESCE(visit_ts, visit_date::timestamptz) < v_before
        ORDER BY COALESCE(visit_ts, visit_date::timestamptz) DESC LIMIT 30
      ) r), '[]'::jsonb),

    'weights', COALESCE((
      SELECT jsonb_agg(row_to_json(r)) FROM (
        SELECT id, weight_kg, logged_at, logged_at_time, notes, logged_by
        FROM weight_logs
        WHERE pet_id = p_pet_id AND COALESCE(logged_at_time, logged_at::timestamptz) < v_before
        ORDER BY COALESCE(logged_at_time, logged_at::timestamptz) DESC LIMIT 30
      ) r), '[]'::jsonb),

    'milestones', COALESCE((
      SELECT jsonb_agg(row_to_json(r)) FROM (
        SELECT id, day_count, title, achieved_at
        FROM milestones
        WHERE pet_id = p_pet_id AND achieved_at::timestamptz < v_before
        ORDER BY achieved_at DESC LIMIT 20
      ) r), '[]'::jsonb),

    'medications', COALESCE((
      SELECT jsonb_agg(row_to_json(r)) FROM (
        SELECT id, name, dosage, frequency, start_date, is_active, created_at
        FROM medications
        WHERE pet_id = p_pet_id AND created_at < v_before
        ORDER BY created_at DESC LIMIT 50
      ) r), '[]'::jsonb),

    'vaccines', COALESCE((
      SELECT jsonb_agg(row_to_json(r)) FROM (
        SELECT id, name, last_given, next_due, vet_name, clinic
        FROM vaccines
        WHERE pet_id = p_pet_id
          AND last_given IS NOT NULL
          AND last_given::timestamptz < v_before
        ORDER BY last_given DESC NULLS LAST LIMIT 30
      ) r), '[]'::jsonb),

    'appointments', COALESCE((
      SELECT jsonb_agg(row_to_json(r)) FROM (
        SELECT id, title, scheduled_at, vet_name, clinic_name, status, notes
        FROM appointments
        WHERE pet_id = p_pet_id AND scheduled_at::timestamptz < v_before
        ORDER BY scheduled_at DESC LIMIT 30
      ) r), '[]'::jsonb),

    'health_records', COALESCE((
      SELECT jsonb_agg(row_to_json(r)) FROM (
        SELECT id, file_name, doc_type, ai_summary,
               extracted_data,
               processed_at, created_at
        FROM health_records
        WHERE pet_id = p_pet_id
          AND status = 'done'
          AND extracted_data IS NOT NULL
          AND created_at < v_before
        ORDER BY created_at DESC LIMIT 20
      ) r), '[]'::jsonb),

    'tasks', COALESCE((
      SELECT jsonb_agg(row_to_json(r)) FROM (
        SELECT id, label, type, date, completed_at, completed_by, photo_url, notes
        FROM daily_checklist
        WHERE pet_id = p_pet_id
          AND completed = true
          AND COALESCE(completed_at, (date::text || 'T12:00:00')::timestamptz) < v_before
        ORDER BY completed_at DESC LIMIT p_limit
      ) r), '[]'::jsonb),

    'profiles', COALESCE((
      SELECT jsonb_agg(row_to_json(r)) FROM (
        SELECT DISTINCT p.id, p.full_name
        FROM profiles p
        WHERE p.id IN (
          SELECT author_id    FROM pet_notes       WHERE pet_id = p_pet_id AND author_id IS NOT NULL
          UNION ALL
          SELECT scanned_by   FROM mood_logs        WHERE pet_id = p_pet_id AND scanned_by IS NOT NULL
          UNION ALL
          SELECT fed_by       FROM feeding_logs     WHERE pet_id = p_pet_id AND fed_by IS NOT NULL
          UNION ALL
          SELECT done_by      FROM grooming_logs    WHERE pet_id = p_pet_id AND done_by IS NOT NULL
          UNION ALL
          SELECT completed_by FROM daily_checklist  WHERE pet_id = p_pet_id AND completed_by IS NOT NULL
          UNION ALL
          SELECT logged_by    FROM weight_logs      WHERE pet_id = p_pet_id AND logged_by IS NOT NULL
        )
      ) r), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_pet_journal(uuid, int, timestamptz) TO authenticated;
