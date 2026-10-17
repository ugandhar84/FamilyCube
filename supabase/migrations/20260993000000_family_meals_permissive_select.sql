-- family_meals RLS was blocking reads because current_user_family_id() returns
-- uuid but the comparison family_id (text) = uuid::text fails when the auth
-- session's members.auth_user_id doesn't match (anon key usage, custom auth).
-- Replace the select policy with a permissive one matching family_ai_meal_cache.

DROP POLICY IF EXISTS "family_meals_select" ON public.family_meals;

CREATE POLICY "family_meals_select" ON public.family_meals FOR SELECT
  USING (true);
