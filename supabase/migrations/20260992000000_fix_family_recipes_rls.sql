-- Fix family_recipes RLS to use current_user_family_id() instead of auth.uid().
-- The original policies joined through members.id = auth.uid()::text which fails
-- because the app uses custom member IDs, not Supabase auth UIDs.
-- Pattern matches family_meals, family_ai_meal_cache, and all other working tables.

DROP POLICY IF EXISTS "family members can read recipes"    ON public.family_recipes;
DROP POLICY IF EXISTS "family members can add recipes"     ON public.family_recipes;
DROP POLICY IF EXISTS "creator or parent can update recipes" ON public.family_recipes;
DROP POLICY IF EXISTS "creator or parent can delete recipes" ON public.family_recipes;

CREATE POLICY "family_recipes_select" ON public.family_recipes FOR SELECT
  USING (family_id = public.current_user_family_id()::text);

CREATE POLICY "family_recipes_insert" ON public.family_recipes FOR INSERT
  WITH CHECK (family_id = public.current_user_family_id()::text);

CREATE POLICY "family_recipes_update" ON public.family_recipes FOR UPDATE
  USING (family_id = public.current_user_family_id()::text);

CREATE POLICY "family_recipes_delete" ON public.family_recipes FOR DELETE
  USING (family_id = public.current_user_family_id()::text);
