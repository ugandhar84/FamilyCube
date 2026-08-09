-- RLS for pet_timelines, timeline_shares, timeline_generations
-- Run: psql $DATABASE_URL < supabase/migration_timeline_rls.sql

ALTER TABLE pet_timelines        ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeline_shares      ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeline_generations ENABLE ROW LEVEL SECURITY;

-- ─── pet_timelines ────────────────────────────────────────────────────────────
CREATE POLICY "pet_timelines_select" ON pet_timelines
  FOR SELECT USING (is_pet_member(pet_id));

CREATE POLICY "pet_timelines_insert" ON pet_timelines
  FOR INSERT WITH CHECK (is_pet_member(pet_id));

CREATE POLICY "pet_timelines_update" ON pet_timelines
  FOR UPDATE USING (is_pet_member(pet_id));

CREATE POLICY "pet_timelines_delete" ON pet_timelines
  FOR DELETE USING (is_pet_member(pet_id));

-- ─── timeline_shares ──────────────────────────────────────────────────────────
CREATE POLICY "timeline_shares_select" ON timeline_shares
  FOR SELECT USING (created_by = auth.uid());

CREATE POLICY "timeline_shares_insert" ON timeline_shares
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND is_pet_member(pet_id)
  );

CREATE POLICY "timeline_shares_update" ON timeline_shares
  FOR UPDATE USING (created_by = auth.uid());

CREATE POLICY "timeline_shares_delete" ON timeline_shares
  FOR DELETE USING (created_by = auth.uid());

-- ─── timeline_generations ─────────────────────────────────────────────────────
CREATE POLICY "timeline_generations_select" ON timeline_generations
  FOR SELECT USING (generated_by = auth.uid());

-- Edge function uses service-role key (bypasses RLS) for inserts
CREATE POLICY "timeline_generations_insert" ON timeline_generations
  FOR INSERT WITH CHECK (generated_by = auth.uid());
