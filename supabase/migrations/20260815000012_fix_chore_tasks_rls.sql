-- Fix chore_tasks RLS so parents can actually read parent_only_quest rows.
-- The old policy used members.id = auth.uid() which fails because members.id
-- is a custom text ID, not a Supabase auth UUID.
-- New policy: scope by family_id via family_members table (owner_id = auth.uid()).

ALTER TABLE public.chore_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parent_quest_isolation_policy ON public.chore_tasks;
DROP POLICY IF EXISTS "chore_tasks family access"   ON public.chore_tasks;
DROP POLICY IF EXISTS "family members chore_tasks"  ON public.chore_tasks;

-- All family members can read non-private chores
CREATE POLICY "chore_tasks family read"
  ON public.chore_tasks FOR SELECT
  USING (
    family_id IN (
      SELECT family_id::text FROM public.family_members WHERE owner_id = auth.uid()
    )
    AND (
      category_type IS DISTINCT FROM 'parent_only_quest'
      OR EXISTS (
        SELECT 1 FROM public.family_members
        WHERE owner_id = auth.uid()
          AND role = 'parent'
          AND family_id::text = chore_tasks.family_id
      )
    )
  );

-- All family members can insert / update / delete their own family's chores
CREATE POLICY "chore_tasks family write"
  ON public.chore_tasks FOR ALL
  USING (
    family_id IN (
      SELECT family_id::text FROM public.family_members WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    family_id IN (
      SELECT family_id::text FROM public.family_members WHERE owner_id = auth.uid()
    )
  );
