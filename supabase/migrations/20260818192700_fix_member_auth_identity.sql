-- Fixes the root cause behind every "row violates row-level security policy"
-- error across the app: RLS policies check `members.id = auth.uid()::text`,
-- but NOTHING in the codebase ever makes members.id equal auth.uid() — not
-- even for the founding parent (SetupFamilyScreen generates a fresh
-- crypto.randomUUID() for the member row, unrelated to their real auth
-- session). current_user_family_id() — the helper every other RLS policy
-- calls — is built on this same broken check, so it has always silently
-- returned NULL/no-rows. The only reason the app functions at all is that
-- family/member creation and invite-code joins run through service-role
-- edge functions that bypass RLS entirely.
--
-- Real device model (confirmed): every device reaches FamilyCube's onboarding
-- (setup-family / join-family) only AFTER completing a real Supabase Auth
-- session (see app/_layout.tsx's session gate) — so a genuine auth.uid()
-- always exists by the time a member row is created. What's missing is
-- recording it. Kids/grandparents typically join via invite code with no
-- authentication of their own — they ride on whichever auth.uid() created
-- them (the inviting device's session). Teens/other parents CAN be the ones
-- who personally run the join flow on their own device, getting their own
-- distinct auth_user_id. Either way, PIN-based profile switching (see
-- setActiveMember in familyStore.ts) never touches supabase.auth — it's
-- pure client state — so RLS must authorize by "which auth.uid() created/
-- owns this member-slot's family," never by "which profile is active."

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_members_auth_user_id ON public.members (auth_user_id);

-- Returns every member row this auth session is entitled to act as — the
-- member(s) created by/joined-as this exact auth.uid(). Usually one row,
-- but nothing stops a household from reusing one device/session across
-- multiple no-auth joins (e.g. a parent completing join-family on behalf of
-- a grandparent that didn't have their own device at signup time).
CREATE OR REPLACE FUNCTION public.current_user_member_ids()
RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.members WHERE auth_user_id = auth.uid();
$$;

-- Family-scoping helper, rebuilt on auth_user_id instead of the broken
-- id = auth.uid()::text check. SECURITY DEFINER for the same self-
-- referential-RLS reason as the original (20260817170000).
CREATE OR REPLACE FUNCTION public.current_user_family_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT family_id FROM public.members WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- members' own policies additionally need "is this MY row" to mean
-- "auth_user_id = auth.uid()", not "id = auth.uid()::text" (always false).
DROP POLICY IF EXISTS "members_select" ON public.members;
DROP POLICY IF EXISTS "members_insert" ON public.members;
DROP POLICY IF EXISTS "members_update" ON public.members;

CREATE POLICY "members_select"
  ON public.members FOR SELECT
  USING (
    auth_user_id = auth.uid()
    OR family_id = public.current_user_family_id()
  );

CREATE POLICY "members_insert"
  ON public.members FOR INSERT
  WITH CHECK (
    auth_user_id = auth.uid()
    OR family_id = public.current_user_family_id()
  );

CREATE POLICY "members_update"
  ON public.members FOR UPDATE
  USING (
    auth_user_id = auth.uid()
    OR family_id = public.current_user_family_id()
  )
  WITH CHECK (
    auth_user_id = auth.uid()
    OR family_id = public.current_user_family_id()
  );
