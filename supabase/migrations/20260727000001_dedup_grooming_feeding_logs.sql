-- Deduplicate grooming_logs: keep only the latest row per (pet_id, type, done_at).
-- Nails × 14 on the same day = 13 rows deleted, 1 kept.
DELETE FROM grooming_logs
WHERE id NOT IN (
  SELECT DISTINCT ON (pet_id, type, done_at) id
  FROM grooming_logs
  ORDER BY pet_id, type, done_at,
    COALESCE(done_at_time::text, done_at::text) DESC
);

-- Deduplicate feeding_logs: keep only the latest row per (pet_id, meal_type, date).
-- Two Dinner entries on the same day = 1 deleted, 1 kept.
DELETE FROM feeding_logs
WHERE id NOT IN (
  SELECT DISTINCT ON (pet_id, meal_type, date) id
  FROM feeding_logs
  ORDER BY pet_id, meal_type, date,
    COALESCE(fed_at::text, date::text) DESC
);
