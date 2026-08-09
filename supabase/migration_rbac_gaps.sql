-- Migration: fix role-based access control gaps
-- 1. Appointments: tighten from is_pet_member() → can_log_health()
--    Caregiver and viewer could previously add/edit appointments via direct API.
-- 2. Pet photos DELETE: restrict from any member → owner only.
--    Any family member could previously delete photos they didn't own.
-- Run once: psql $DATABASE_URL < supabase/migration_rbac_gaps.sql

-- ── 1. Appointments — require caretaker+ role to write ────────────────────────
DROP POLICY IF EXISTS "Pet members can manage appointments" ON appointments;

-- SELECT: any member can view appointments
CREATE POLICY "appointments: members can read"
  ON appointments FOR SELECT
  USING (is_pet_member(pet_id));

-- INSERT / UPDATE / DELETE: owner or caretaker only (can_log_health)
CREATE POLICY "appointments: health roles can write"
  ON appointments FOR INSERT
  WITH CHECK (can_log_health(pet_id));

CREATE POLICY "appointments: health roles can update"
  ON appointments FOR UPDATE
  USING (can_log_health(pet_id));

CREATE POLICY "appointments: health roles can delete"
  ON appointments FOR DELETE
  USING (can_log_health(pet_id));

-- ── 2. Pet photos DELETE — owner only ────────────────────────────────────────
DROP POLICY IF EXISTS "Pet members can delete photos" ON pet_photos;

CREATE POLICY "pet_photos: owner can delete"
  ON pet_photos FOR DELETE
  USING (
    pet_id IN (
      SELECT id FROM pets WHERE owner_id = auth.uid()
    )
  );
