-- supabase/migration_chore_system.sql was only ever applied in part: chore_tasks
-- and parent_quest_assignments landed, but point_transactions, user_badges and
-- grandparent_matches never did. choreStore writes to all three, so every point
-- award, badge unlock and grandparent match has been failing silently since.
--
-- PKs are text, not uuid: choreStore's genId() falls back to
-- `${Date.now()}-${random}` on React Native, which is not a valid uuid.

CREATE TABLE IF NOT EXISTS public.point_transactions (
  id                text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id           text NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  chore_instance_id text REFERENCES public.chore_tasks(id) ON DELETE SET NULL,
  amount            integer NOT NULL,
  transaction_type  text NOT NULL CHECK (transaction_type IN (
                      'EARNED','CASH_OUT','SAVED','SPENT','GIVEN',
                      'GRANDPARENT_MATCH','STREAK_FREEZE','ADMIN_ADJUSTMENT')),
  spend_allocation  integer DEFAULT 0,
  save_allocation   integer DEFAULT 0,
  give_allocation   integer DEFAULT 0,
  notes             text,
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS point_transactions_user_id_idx    ON public.point_transactions(user_id);
CREATE INDEX IF NOT EXISTS point_transactions_created_at_idx ON public.point_transactions(created_at);

CREATE TABLE IF NOT EXISTS public.user_badges (
  id                text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id           text NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  badge_key         text NOT NULL,
  tier              text DEFAULT 'STANDARD' CHECK (tier IN ('STANDARD','SILVER','GOLD','DIAMOND')),
  progress          integer DEFAULT 0,
  progress_target   integer,
  unlocked_at       timestamptz,
  visual_url        text,
  bonus_perk_active boolean DEFAULT true,
  created_at        timestamptz DEFAULT now(),
  UNIQUE (user_id, badge_key, tier)
);
CREATE INDEX IF NOT EXISTS user_badges_user_id_idx ON public.user_badges(user_id);

CREATE TABLE IF NOT EXISTS public.grandparent_matches (
  id                       text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  family_id                uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  grandparent_id           text NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  child_id                 text NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  match_type               text NOT NULL CHECK (match_type IN ('FIXED_PERCENTAGE','FIXED_AMOUNT','GOAL_PLEDGE')),
  match_value              numeric(10,2),
  match_jar                text CHECK (match_jar IN ('SPEND','SAVE','GIVE')),
  goal_target              integer,
  max_monthly_contribution numeric(10,2),
  monthly_contributed_ytd  numeric(10,2) DEFAULT 0,
  is_active                boolean DEFAULT true,
  created_at               timestamptz DEFAULT now(),
  UNIQUE (grandparent_id, child_id, match_type)
);
CREATE INDEX IF NOT EXISTS grandparent_matches_family_id_idx ON public.grandparent_matches(family_id);

ALTER TABLE public.point_transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grandparent_matches  ENABLE ROW LEVEL SECURITY;

-- Signed-in access, matching how chore_tasks already behaves in this project.
-- NOTE: this is household-wide, not family-scoped — see the parent_quest_assignments
-- comment below for why a members/auth.uid() predicate is not safe to use yet.
DROP POLICY IF EXISTS "signed-in family access" ON public.point_transactions;
CREATE POLICY "signed-in family access" ON public.point_transactions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "signed-in family access" ON public.user_badges;
CREATE POLICY "signed-in family access" ON public.user_badges
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "signed-in family access" ON public.grandparent_matches;
CREATE POLICY "signed-in family access" ON public.grandparent_matches
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── parent_quest_assignments: replace a predicate that denies everyone ──────
-- The original policy tested
--   ct.family_id = (SELECT family_id FROM family_members WHERE owner_id = auth.uid())
-- but family_members is empty and has no family_id column, so the subquery is
-- NULL, the EXISTS is false, and every read AND insert was rejected. (Adding a
-- WITH CHECK in 20260817000003 copied the same false predicate, so it did not
-- help.) Gate on the chore being visible instead — chore_tasks already carries
-- the family's own RLS, so visibility there is the right authority.
DROP POLICY IF EXISTS "family members can manage assignments" ON public.parent_quest_assignments;
CREATE POLICY "family members can manage assignments"
  ON public.parent_quest_assignments
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.chore_tasks ct WHERE ct.id = parent_quest_assignments.chore_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.chore_tasks ct WHERE ct.id = parent_quest_assignments.chore_id)
  );
