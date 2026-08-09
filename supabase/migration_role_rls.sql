-- ─────────────────────────────────────────────────────────────────────────────
-- Role-aware RLS helpers
-- Adds three security-definer functions that check pet_family.role, then
-- replaces the blanket is_pet_member policies with role-split policies.
-- ─────────────────────────────────────────────────────────────────────────────

-- Returns true if caller can log daily care for this pet
-- (owner, caretaker, or caregiver)
CREATE OR REPLACE FUNCTION can_log_daily_care(p_pet_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM pets      WHERE id = p_pet_id AND owner_id = auth.uid()
    UNION ALL
    SELECT 1 FROM pet_family WHERE pet_id = p_pet_id AND user_id = auth.uid()
      AND role IN ('caretaker', 'caregiver')
  );
$$;

-- Returns true if caller can log health records for this pet
-- (owner or caretaker only)
CREATE OR REPLACE FUNCTION can_log_health(p_pet_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM pets      WHERE id = p_pet_id AND owner_id = auth.uid()
    UNION ALL
    SELECT 1 FROM pet_family WHERE pet_id = p_pet_id AND user_id = auth.uid()
      AND role = 'caretaker'
  );
$$;

-- Returns true if caller can read this pet's data (any member including viewer)
CREATE OR REPLACE FUNCTION can_read_pet(p_pet_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM pets      WHERE id = p_pet_id AND owner_id = auth.uid()
    UNION ALL
    SELECT 1 FROM pet_family WHERE pet_id = p_pet_id AND user_id = auth.uid()
  );
$$;

-- ── mood_logs ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Pet members can manage mood_logs" ON mood_logs;

CREATE POLICY "mood_logs: members can read"
  ON mood_logs FOR SELECT USING (can_read_pet(pet_id));

CREATE POLICY "mood_logs: daily care roles can insert"
  ON mood_logs FOR INSERT WITH CHECK (can_log_daily_care(pet_id));

CREATE POLICY "mood_logs: daily care roles can update"
  ON mood_logs FOR UPDATE USING (can_log_daily_care(pet_id));

CREATE POLICY "mood_logs: daily care roles can delete"
  ON mood_logs FOR DELETE USING (can_log_daily_care(pet_id));

-- ── feeding_logs ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Pet members can manage feeding_logs" ON feeding_logs;

CREATE POLICY "feeding_logs: members can read"
  ON feeding_logs FOR SELECT USING (can_read_pet(pet_id));

CREATE POLICY "feeding_logs: daily care roles can write"
  ON feeding_logs FOR INSERT WITH CHECK (can_log_daily_care(pet_id));

CREATE POLICY "feeding_logs: daily care roles can delete"
  ON feeding_logs FOR DELETE USING (can_log_daily_care(pet_id));

-- ── grooming_logs ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Pet members can manage grooming_logs" ON grooming_logs;

CREATE POLICY "grooming_logs: members can read"
  ON grooming_logs FOR SELECT USING (can_read_pet(pet_id));

CREATE POLICY "grooming_logs: daily care roles can write"
  ON grooming_logs FOR INSERT WITH CHECK (can_log_daily_care(pet_id));

CREATE POLICY "grooming_logs: daily care roles can delete"
  ON grooming_logs FOR DELETE USING (can_log_daily_care(pet_id));

-- ── daily_checklist ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Pet members can manage daily_checklist" ON daily_checklist;

CREATE POLICY "daily_checklist: members can read"
  ON daily_checklist FOR SELECT USING (can_read_pet(pet_id));

CREATE POLICY "daily_checklist: daily care roles can write"
  ON daily_checklist FOR INSERT WITH CHECK (can_log_daily_care(pet_id));

CREATE POLICY "daily_checklist: daily care roles can update"
  ON daily_checklist FOR UPDATE USING (can_log_daily_care(pet_id));

CREATE POLICY "daily_checklist: daily care roles can delete"
  ON daily_checklist FOR DELETE USING (can_log_daily_care(pet_id));

-- ── vet_visits ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Pet members can manage vet_visits" ON vet_visits;

CREATE POLICY "vet_visits: members can read"
  ON vet_visits FOR SELECT USING (can_read_pet(pet_id));

CREATE POLICY "vet_visits: health roles can write"
  ON vet_visits FOR INSERT WITH CHECK (can_log_health(pet_id));

CREATE POLICY "vet_visits: health roles can update"
  ON vet_visits FOR UPDATE USING (can_log_health(pet_id));

CREATE POLICY "vet_visits: health roles can delete"
  ON vet_visits FOR DELETE USING (can_log_health(pet_id));

-- ── vaccines ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Pet members can manage vaccines" ON vaccines;

CREATE POLICY "vaccines: members can read"
  ON vaccines FOR SELECT USING (can_read_pet(pet_id));

CREATE POLICY "vaccines: health roles can write"
  ON vaccines FOR INSERT WITH CHECK (can_log_health(pet_id));

CREATE POLICY "vaccines: health roles can update"
  ON vaccines FOR UPDATE USING (can_log_health(pet_id));

CREATE POLICY "vaccines: health roles can delete"
  ON vaccines FOR DELETE USING (can_log_health(pet_id));

-- ── medications ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Pet members can manage medications" ON medications;

CREATE POLICY "medications: members can read"
  ON medications FOR SELECT USING (can_read_pet(pet_id));

CREATE POLICY "medications: health roles can write"
  ON medications FOR INSERT WITH CHECK (can_log_health(pet_id));

CREATE POLICY "medications: health roles can update"
  ON medications FOR UPDATE USING (can_log_health(pet_id));

CREATE POLICY "medications: health roles can delete"
  ON medications FOR DELETE USING (can_log_health(pet_id));

-- ── weight_logs ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Pet members can manage weight_logs" ON weight_logs;

CREATE POLICY "weight_logs: members can read"
  ON weight_logs FOR SELECT USING (can_read_pet(pet_id));

CREATE POLICY "weight_logs: health roles can write"
  ON weight_logs FOR INSERT WITH CHECK (can_log_health(pet_id));

CREATE POLICY "weight_logs: health roles can delete"
  ON weight_logs FOR DELETE USING (can_log_health(pet_id));

-- ── milestones ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Pet members can manage milestones" ON milestones;

CREATE POLICY "milestones: members can read"
  ON milestones FOR SELECT USING (can_read_pet(pet_id));

CREATE POLICY "milestones: caretaker+ can write"
  ON milestones FOR INSERT WITH CHECK (can_log_health(pet_id));

CREATE POLICY "milestones: caretaker+ can delete"
  ON milestones FOR DELETE USING (can_log_health(pet_id));

-- ── lost_alerts ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Pet members can manage lost_alerts" ON lost_alerts;

CREATE POLICY "lost_alerts: members can read"
  ON lost_alerts FOR SELECT USING (can_read_pet(pet_id));

CREATE POLICY "lost_alerts: caretaker+ can write"
  ON lost_alerts FOR INSERT WITH CHECK (can_log_health(pet_id));

CREATE POLICY "lost_alerts: caretaker+ can update"
  ON lost_alerts FOR UPDATE USING (can_log_health(pet_id));

-- ── social_posts ──────────────────────────────────────────────────────────────
-- Only caretakers and owners can post; anyone can read public posts
DROP POLICY IF EXISTS "Pet members can manage posts" ON social_posts;
DROP POLICY IF EXISTS "Members can manage pet posts" ON social_posts;
DROP POLICY IF EXISTS "Authors can manage own posts" ON social_posts;
DROP POLICY IF EXISTS "Anyone can update likes" ON social_posts;

CREATE POLICY "social_posts: public read"
  ON social_posts FOR SELECT
  USING (is_public = true OR can_read_pet(pet_id));

CREATE POLICY "social_posts: caretaker+ can insert"
  ON social_posts FOR INSERT
  WITH CHECK (can_log_health(pet_id));

-- Authors can update their own posts (captions, likes_count)
CREATE POLICY "social_posts: author can update"
  ON social_posts FOR UPDATE
  USING (author_id = auth.uid());

-- Authors or pet owner/caretaker can delete
CREATE POLICY "social_posts: caretaker+ can delete"
  ON social_posts FOR DELETE
  USING (author_id = auth.uid() OR can_log_health(pet_id));

-- ── daily_scan_counts ─────────────────────────────────────────────────────────
-- Already uses is_pet_member via previous migration; upgrade to can_read_pet
-- (same set, just cleaner naming — RPCs are SECURITY DEFINER so they bypass this)
DROP POLICY IF EXISTS "pet members can manage scan counts" ON daily_scan_counts;
DROP POLICY IF EXISTS "owner can manage scan counts" ON daily_scan_counts;

CREATE POLICY "daily_scan_counts: members can read"
  ON daily_scan_counts FOR SELECT USING (can_read_pet(pet_id));

-- Writes go through SECURITY DEFINER RPCs only; block direct inserts/updates
CREATE POLICY "daily_scan_counts: no direct writes"
  ON daily_scan_counts FOR INSERT WITH CHECK (false);

CREATE POLICY "daily_scan_counts: no direct updates"
  ON daily_scan_counts FOR UPDATE USING (false);
