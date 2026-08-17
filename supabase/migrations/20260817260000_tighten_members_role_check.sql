-- The previous migration (20260817250000) widened this constraint to
-- ['parent','child','kid','teenager','grandparent','senior'] as a quick
-- unblock. The real fix was correcting the app-layer translation
-- (familyStore.toRow and RosterTab's saveMember both now map
-- 'senior' -> 'grandparent' before writing, matching the one existing
-- canonical DB vocabulary already used by fromRow/RLS/edge functions
-- everywhere else in this app) — so 'senior' is no longer written at all
-- and doesn't need to be a valid DB value. Tightening back down. 'kid' is
-- kept only because nothing has ever proven it's unused in older rows;
-- 'senior' is dropped since it was never correct.
alter table public.members drop constraint if exists members_role_check;
alter table public.members add constraint members_role_check
  check (role = any (array['parent','child','kid','teenager','grandparent']));
