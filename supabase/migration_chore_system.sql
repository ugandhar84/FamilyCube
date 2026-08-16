-- Chore System Migration
-- Adds points economy, three-jar system, badges, and parent-only quests
-- Created: 2026-08-15

-- ───────────────────────────────────────────────────────────────────────────────
-- 1. EXTEND MEMBERS TABLE — Add points economy fields
-- ───────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.members
ADD COLUMN IF NOT EXISTS spend_balance INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS save_balance INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS give_balance INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_points_earned INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS streak_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS streak_last_completed_date DATE,
ADD COLUMN IF NOT EXISTS streak_frozen_dates DATE[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS chore_category_preference VARCHAR(50);

-- ───────────────────────────────────────────────────────────────────────────────
-- 2. EXTEND FAMILIES TABLE — Add household chore settings
-- ───────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.families
ADD COLUMN IF NOT EXISTS points_to_fiat_ratio DECIMAL(10, 4) DEFAULT 0.0100,
ADD COLUMN IF NOT EXISTS spend_allocation_pct INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS save_allocation_pct INTEGER DEFAULT 40,
ADD COLUMN IF NOT EXISTS give_allocation_pct INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS allow_child_allocation_override BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS auto_approve_timeout_hours INTEGER DEFAULT 24,
ADD COLUMN IF NOT EXISTS min_cashout_points INTEGER DEFAULT 100,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- ───────────────────────────────────────────────────────────────────────────────
-- 3. ENHANCE CHORE_TASKS TABLE — Add new fields for extended functionality
-- ───────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.chore_tasks
ADD COLUMN IF NOT EXISTS category_type VARCHAR(30) DEFAULT 'routine'
  CHECK (category_type IN ('citizenship', 'routine', 'bounty', 'grandparent_quest', 'parent_only_quest')),
ADD COLUMN IF NOT EXISTS base_points INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS requires_photo_proof BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS recurrence_rule JSONB DEFAULT '{"frequency": "once"}'::jsonb,
ADD COLUMN IF NOT EXISTS sponsor_user_id TEXT,
ADD COLUMN IF NOT EXISTS is_private_parent BOOLEAN GENERATED ALWAYS AS (category_type = 'parent_only_quest') STORED,
ADD COLUMN IF NOT EXISTS instance_date DATE,
ADD COLUMN IF NOT EXISTS redo_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS proof_notes TEXT,
ADD COLUMN IF NOT EXISTS family_id UUID,
ADD COLUMN IF NOT EXISTS approval_window_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE,
CONSTRAINT chore_tasks_sponsor_user_id_fkey FOREIGN KEY (sponsor_user_id) REFERENCES public.members(id),
CONSTRAINT chore_tasks_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id);

CREATE INDEX IF NOT EXISTS chore_tasks_family_id_idx ON public.chore_tasks(family_id);
CREATE INDEX IF NOT EXISTS chore_tasks_category_type_idx ON public.chore_tasks(category_type);
CREATE INDEX IF NOT EXISTS chore_tasks_status_idx ON public.chore_tasks(status);
CREATE INDEX IF NOT EXISTS chore_tasks_instance_date_idx ON public.chore_tasks(instance_date);

-- ───────────────────────────────────────────────────────────────────────────────
-- 4. NEW TABLE: point_transactions — Ledger of all point movements
-- ───────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.point_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  chore_instance_id TEXT REFERENCES public.chore_tasks(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL,
  transaction_type VARCHAR(30) NOT NULL CHECK (transaction_type IN (
    'EARNED',
    'CASH_OUT',
    'SAVED',
    'SPENT',
    'GIVEN',
    'GRANDPARENT_MATCH',
    'STREAK_FREEZE',
    'ADMIN_ADJUSTMENT'
  )),
  spend_allocation INTEGER DEFAULT 0,
  save_allocation INTEGER DEFAULT 0,
  give_allocation INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS point_transactions_user_id_idx ON public.point_transactions(user_id);
CREATE INDEX IF NOT EXISTS point_transactions_transaction_type_idx ON public.point_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS point_transactions_created_at_idx ON public.point_transactions(created_at);

-- ───────────────────────────────────────────────────────────────────────────────
-- 5. NEW TABLE: user_badges — Track badge unlocks per user
-- ───────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  badge_key VARCHAR(50) NOT NULL,
  tier VARCHAR(20) DEFAULT 'STANDARD' CHECK (tier IN ('STANDARD', 'SILVER', 'GOLD', 'DIAMOND')),
  progress INTEGER DEFAULT 0,
  progress_target INTEGER,
  unlocked_at TIMESTAMP WITH TIME ZONE,
  visual_url TEXT,
  bonus_perk_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, badge_key, tier)
);

CREATE INDEX IF NOT EXISTS user_badges_user_id_idx ON public.user_badges(user_id);
CREATE INDEX IF NOT EXISTS user_badges_unlocked_at_idx ON public.user_badges(unlocked_at);

-- ───────────────────────────────────────────────────────────────────────────────
-- 6. NEW TABLE: parent_quest_assignments — Track co-parent task assignments
-- ───────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.parent_quest_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chore_id TEXT NOT NULL REFERENCES public.chore_tasks(id) ON DELETE CASCADE,
  assigned_by TEXT NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  assigned_to TEXT NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING',
    'ACCEPTED',
    'IN_PROGRESS',
    'COMPLETED',
    'PARKED',
    'DECLINED',
    'SNOOZED'
  )),
  snooze_until TIMESTAMP WITH TIME ZONE,
  bounce_count INTEGER DEFAULT 0,
  is_locked BOOLEAN DEFAULT FALSE,
  actionable_pushback VARCHAR(50),
  pushback_details TEXT,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS parent_quest_assignments_assigned_to_idx ON public.parent_quest_assignments(assigned_to);
CREATE INDEX IF NOT EXISTS parent_quest_assignments_status_idx ON public.parent_quest_assignments(status);

-- ───────────────────────────────────────────────────────────────────────────────
-- 7. NEW TABLE: grandparent_matches — Grandparent contribution rules
-- ───────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.grandparent_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  grandparent_id TEXT NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  child_id TEXT NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  match_type VARCHAR(20) NOT NULL CHECK (match_type IN (
    'FIXED_PERCENTAGE',
    'FIXED_AMOUNT',
    'GOAL_PLEDGE'
  )),
  match_value DECIMAL(10, 2),
  match_jar VARCHAR(20) CHECK (match_jar IN ('SPEND', 'SAVE', 'GIVE')),
  goal_target INTEGER,
  max_monthly_contribution DECIMAL(10, 2),
  monthly_contributed_ytd DECIMAL(10, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(grandparent_id, child_id, match_type)
);

CREATE INDEX IF NOT EXISTS grandparent_matches_family_id_idx ON public.grandparent_matches(family_id);
CREATE INDEX IF NOT EXISTS grandparent_matches_child_id_idx ON public.grandparent_matches(child_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- 8. ROW-LEVEL SECURITY — Enforce Parent-Only Quest privacy
-- ───────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.chore_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY parent_quest_isolation_policy ON public.chore_tasks
  FOR ALL
  USING (
    category_type != 'parent_only_quest'
    OR (
      SELECT role FROM public.members WHERE members.id = auth.uid()
    ) = 'parent'
  );

-- ───────────────────────────────────────────────────────────────────────────────
-- 9. VIEWS — For convenience queries
-- ───────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.child_dashboard_chores AS
SELECT
  ct.id,
  ct.title,
  ct.description,
  ct.category_type,
  ct.base_points,
  ct.status,
  ct.assigned_to_id,
  ct.instance_date,
  ct.requires_photo_proof,
  ct.family_id,
  ct.created_at
FROM public.chore_tasks ct
WHERE ct.category_type IN ('citizenship', 'routine', 'bounty', 'grandparent_quest')
  AND ct.is_private_parent = FALSE
ORDER BY ct.category_type, ct.created_at DESC;

CREATE OR REPLACE VIEW public.parent_quest_dashboard AS
SELECT
  ct.id,
  ct.title,
  ct.description,
  ct.status,
  ct.created_by_id,
  ct.family_id,
  pqa.assigned_to,
  pqa.status AS assignment_status,
  pqa.bounce_count,
  pqa.is_locked,
  ct.created_at
FROM public.chore_tasks ct
LEFT JOIN public.parent_quest_assignments pqa ON ct.id = pqa.chore_id
WHERE ct.category_type = 'parent_only_quest'
ORDER BY ct.created_at DESC;

-- ───────────────────────────────────────────────────────────────────────────────
-- 10. SAMPLE DATA (Optional — remove if not needed)
-- ───────────────────────────────────────────────────────────────────────────────

-- Reset sequences if using serial IDs (not applicable with UUIDs, keeping for reference)
-- TRUNCATE TABLE public.chore_tasks CASCADE;
-- SELECT setval('chore_tasks_id_seq', 1, false);

COMMIT;
