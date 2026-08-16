-- The original FOR ALL policy had only USING (...), no WITH CHECK (...).
-- Postgres evaluates WITH CHECK for INSERT/UPDATE; with none defined it
-- defaults to false, so every insert into parent_quest_assignments was
-- rejected with "new row violates row-level security policy".

DROP POLICY IF EXISTS "family members can manage assignments" ON public.parent_quest_assignments;

CREATE POLICY "family members can manage assignments"
  ON public.parent_quest_assignments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM chore_tasks ct
      WHERE ct.id = parent_quest_assignments.chore_id
        AND ct.family_id = (
          SELECT family_id FROM family_members WHERE owner_id = auth.uid() LIMIT 1
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chore_tasks ct
      WHERE ct.id = parent_quest_assignments.chore_id
        AND ct.family_id = (
          SELECT family_id FROM family_members WHERE owner_id = auth.uid() LIMIT 1
        )
    )
  );
