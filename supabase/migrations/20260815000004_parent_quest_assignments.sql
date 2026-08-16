CREATE TABLE IF NOT EXISTS parent_quest_assignments (
  id             text PRIMARY KEY,
  chore_id       text NOT NULL REFERENCES chore_tasks(id) ON DELETE CASCADE,
  assigned_by    text NOT NULL,
  assigned_to    text NOT NULL,
  mode           text NOT NULL DEFAULT 'DIRECT',
  status         text NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING','ACCEPTED','IN_PROGRESS','COMPLETED','PARKED','DECLINED','SNOOZED')),
  is_locked      boolean NOT NULL DEFAULT false,
  note           text,
  completed_at   timestamptz,
  updated_at     timestamptz DEFAULT now(),
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE parent_quest_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "family members can manage assignments" ON parent_quest_assignments;
CREATE POLICY "family members can manage assignments"
  ON parent_quest_assignments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM chore_tasks ct
      WHERE ct.id = parent_quest_assignments.chore_id
        AND ct.family_id = (
          SELECT family_id FROM family_members WHERE owner_id = auth.uid() LIMIT 1
        )
    )
  );
