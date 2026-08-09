-- Global summary RPC — aggregates across ALL pets owned by a user.
-- Used on the home screen summary card (multi-pet mode).
-- One round-trip instead of N per-pet calls.
CREATE OR REPLACE FUNCTION get_global_summary(
  p_user_id  uuid,
  p_date     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_date  date := COALESCE(p_date::date, CURRENT_DATE);
BEGIN
  RETURN jsonb_build_object(

    -- Aggregated activity counts across all user's pets today
    'counts', jsonb_build_object(
      'notes',    COALESCE((SELECT COUNT(*) FROM pet_notes    n JOIN pets p ON p.id = n.pet_id WHERE p.owner_id = p_user_id AND p.status != 'memorial' AND (n.noted_at::date = v_date OR n.created_at::date = v_date)), 0),
      'moods',    COALESCE((SELECT COUNT(*) FROM mood_logs    m JOIN pets p ON p.id = m.pet_id WHERE p.owner_id = p_user_id AND p.status != 'memorial' AND m.date = v_date), 0),
      'meals',    COALESCE((SELECT COUNT(*) FROM feeding_logs f JOIN pets p ON p.id = f.pet_id WHERE p.owner_id = p_user_id AND p.status != 'memorial' AND f.date = v_date), 0),
      'grooming', COALESCE((SELECT COUNT(*) FROM grooming_logs g JOIN pets p ON p.id = g.pet_id WHERE p.owner_id = p_user_id AND p.status != 'memorial' AND g.done_at = v_date), 0),
      'weight',   COALESCE((SELECT COUNT(*) FROM weight_logs  w JOIN pets p ON p.id = w.pet_id WHERE p.owner_id = p_user_id AND p.status != 'memorial' AND w.logged_at::date = v_date), 0),
      'vet',      COALESCE((SELECT COUNT(*) FROM vet_visits   v JOIN pets p ON p.id = v.pet_id WHERE p.owner_id = p_user_id AND p.status != 'memorial' AND v.visit_date = v_date), 0)
    ),

    -- Total tasks done / total tasks today across all pets
    'tasks_done',  COALESCE((
      SELECT COUNT(*) FROM daily_checklist dc
      JOIN pets p ON p.id = dc.pet_id
      WHERE p.owner_id = p_user_id AND p.status != 'memorial' AND dc.date = v_date AND dc.completed = true
    ), 0),
    'tasks_total', COALESCE((
      SELECT COUNT(*) FROM daily_checklist dc
      JOIN pets p ON p.id = dc.pet_id
      WHERE p.owner_id = p_user_id AND p.status != 'memorial' AND dc.date = v_date
    ), 0),

    -- Total mood scans today across all pets
    'scan_count', COALESCE((
      SELECT SUM(dsc.count) FROM daily_scan_counts dsc
      JOIN pets p ON p.id = dsc.pet_id
      WHERE p.owner_id = p_user_id AND dsc.date = v_date
    ), 0),

    -- Earliest upcoming vet appointment across all pets
    'next_vet', (
      SELECT a.scheduled_at::text
      FROM appointments a
      JOIN pets p ON p.id = a.pet_id
      WHERE p.owner_id = p_user_id
        AND a.status IN ('scheduled', 'upcoming')
        AND a.type IN ('vet', 'checkup', 'vaccination')
        AND a.scheduled_at > now()
      ORDER BY a.scheduled_at ASC
      LIMIT 1
    ),

    -- Most recent completed vet appointment across all pets
    'last_vet', (
      SELECT row_to_json(r) FROM (
        SELECT a.scheduled_at::text AS date, a.type, a.title, p.name AS pet_name
        FROM appointments a
        JOIN pets p ON p.id = a.pet_id
        WHERE p.owner_id = p_user_id
          AND a.status = 'completed'
          AND a.type IN ('vet', 'checkup', 'vaccination')
        ORDER BY a.scheduled_at DESC
        LIMIT 1
      ) r
    ),

    -- Per-pet mood logs today (for mood tile rotation)
    'pet_moods', COALESCE((
      SELECT jsonb_agg(row_to_json(r) ORDER BY r.created_at DESC)
      FROM (
        SELECT ml.pet_id, ml.mood_label, ml.mood_score, ml.date, ml.photo_url, ml.created_at,
               p.name AS pet_name
        FROM mood_logs ml
        JOIN pets p ON p.id = ml.pet_id
        WHERE p.owner_id = p_user_id
          AND ml.date = v_date
      ) r
    ), '[]'::jsonb),

    -- Per-pet streaks from pets table (care_streak column)
    'pet_streaks', COALESCE((
      SELECT jsonb_object_agg(p.id::text, COALESCE(p.care_streak, 0))
      FROM pets p
      WHERE p.owner_id = p_user_id AND p.status != 'memorial'
    ), '{}'::jsonb)

  );
END;
$$;
