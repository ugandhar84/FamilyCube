-- Single RPC that returns all journal entries for a pet in one round trip.
-- Replaces 10+ individual table queries + a profiles lookup.
CREATE OR REPLACE FUNCTION get_pet_journal(p_pet_id uuid, p_limit int DEFAULT 60)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'notes', COALESCE((
      SELECT jsonb_agg(row_to_json(r)) FROM (
        SELECT id, content, is_private, noted_at, created_at, updated_at, author_id
        FROM pet_notes WHERE pet_id = p_pet_id
        ORDER BY noted_at DESC LIMIT p_limit
      ) r), '[]'::jsonb),

    'moods', COALESCE((
      SELECT jsonb_agg(row_to_json(r)) FROM (
        SELECT id, mood_label, mood_score, happy_pct, playful_pct, tired_pct, anxious_pct,
               photo_url, notes, situation, advice, date, created_at, scanned_by
        FROM mood_logs WHERE pet_id = p_pet_id
        ORDER BY created_at DESC LIMIT p_limit
      ) r), '[]'::jsonb),

    'meals', COALESCE((
      SELECT jsonb_agg(row_to_json(r)) FROM (
        SELECT id, meal_type, amount_grams, food_type, date, fed_at, fed_by, photo_url
        FROM feeding_logs WHERE pet_id = p_pet_id
        ORDER BY fed_at DESC LIMIT p_limit
      ) r), '[]'::jsonb),

    'grooming', COALESCE((
      SELECT jsonb_agg(row_to_json(r)) FROM (
        SELECT id, type, done_at, done_at_time, done_by, notes, photo_url
        FROM grooming_logs WHERE pet_id = p_pet_id
        ORDER BY done_at DESC LIMIT p_limit
      ) r), '[]'::jsonb),

    'vet_visits', COALESCE((
      SELECT jsonb_agg(row_to_json(r)) FROM (
        SELECT id, visit_date, vet_name, clinic_name, reason, diagnosis
        FROM vet_visits WHERE pet_id = p_pet_id
        ORDER BY visit_date DESC LIMIT 30
      ) r), '[]'::jsonb),

    'weights', COALESCE((
      SELECT jsonb_agg(row_to_json(r)) FROM (
        SELECT id, weight_kg, logged_at, notes, logged_by
        FROM weight_logs WHERE pet_id = p_pet_id
        ORDER BY logged_at DESC LIMIT 30
      ) r), '[]'::jsonb),

    'milestones', COALESCE((
      SELECT jsonb_agg(row_to_json(r)) FROM (
        SELECT id, day_count, title, achieved_at
        FROM milestones WHERE pet_id = p_pet_id
        ORDER BY achieved_at DESC LIMIT 20
      ) r), '[]'::jsonb),

    'medications', COALESCE((
      SELECT jsonb_agg(row_to_json(r)) FROM (
        SELECT id, name, dosage, frequency, start_date, is_active, created_at
        FROM medications WHERE pet_id = p_pet_id
        ORDER BY created_at DESC LIMIT 50
      ) r), '[]'::jsonb),

    'vaccines', COALESCE((
      SELECT jsonb_agg(row_to_json(r)) FROM (
        SELECT id, name, last_given, next_due, vet_name, clinic
        FROM vaccines WHERE pet_id = p_pet_id AND last_given IS NOT NULL
        ORDER BY last_given DESC NULLS LAST LIMIT 30
      ) r), '[]'::jsonb),

    'appointments', COALESCE((
      SELECT jsonb_agg(row_to_json(r)) FROM (
        SELECT id, title, scheduled_at, vet_name, clinic_name, status, notes
        FROM appointments WHERE pet_id = p_pet_id AND status = 'completed'
        ORDER BY scheduled_at DESC LIMIT 30
      ) r), '[]'::jsonb),

    'tasks', COALESCE((
      SELECT jsonb_agg(row_to_json(r)) FROM (
        SELECT id, label, type, date, completed_at, completed_by, photo_url, notes
        FROM daily_checklist WHERE pet_id = p_pet_id AND completed = true
        ORDER BY completed_at DESC LIMIT p_limit
      ) r), '[]'::jsonb),

    'profiles', COALESCE((
      SELECT jsonb_agg(row_to_json(r)) FROM (
        SELECT DISTINCT p.id, p.full_name
        FROM profiles p
        WHERE p.id IN (
          SELECT author_id  FROM pet_notes       WHERE pet_id = p_pet_id AND author_id IS NOT NULL
          UNION
          SELECT scanned_by FROM mood_logs        WHERE pet_id = p_pet_id AND scanned_by IS NOT NULL
          UNION
          SELECT fed_by     FROM feeding_logs     WHERE pet_id = p_pet_id AND fed_by IS NOT NULL
          UNION
          SELECT done_by    FROM grooming_logs    WHERE pet_id = p_pet_id AND done_by IS NOT NULL
          UNION
          SELECT completed_by FROM daily_checklist WHERE pet_id = p_pet_id AND completed_by IS NOT NULL
          UNION
          SELECT logged_by  FROM weight_logs      WHERE pet_id = p_pet_id AND logged_by IS NOT NULL
        )
      ) r), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

-- Allow authenticated users to call it
GRANT EXECUTE ON FUNCTION get_pet_journal(uuid, int) TO authenticated;
