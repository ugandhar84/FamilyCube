-- Backfills auth_user_id for members created before migration
-- 20260818192700 (i.e. every existing member — the column didn't exist
-- until that migration). Matches each member to their family's founding
-- parent (families.created_by, a real auth.users id set at family-creation
-- time by SetupFamilyScreen) since that's the one real auth.uid() every
-- existing family is guaranteed to have, regardless of whether individual
-- members joined via invite code or were the founding parent themselves.
--
-- Safe to re-run: only touches rows where auth_user_id IS NULL.

UPDATE public.members m
SET auth_user_id = f.created_by
FROM public.families f
WHERE m.family_id = f.id
  AND m.auth_user_id IS NULL
  AND f.created_by IS NOT NULL;
