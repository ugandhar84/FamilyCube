-- Quest Participants
-- One row per (quest, member) pair — tracks each kid's independent journey
-- through a quest regardless of whether it was multi-assigned or a pool bounty.

-- ── New columns on quests ─────────────────────────────────────────────────────
ALTER TABLE public.quests
  ADD COLUMN IF NOT EXISTS is_multi_assign  boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_claimants    int               DEFAULT 1;
-- max_claimants: null = unlimited (any number of kids can claim a pool quest)
--                1    = first-come-first-served (default for chore pool quests)
--                N    = up to N kids can each claim and earn

-- ── quest_participants ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quest_participants (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id         uuid        NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  member_id        text        NOT NULL,

  status           text        NOT NULL DEFAULT 'todo'
                               CHECK (status IN (
                                 'todo','in_progress','pending_approval',
                                 'approved','declined','cancelled'
                               )),

  -- timestamps
  claimed_at       timestamptz,
  submitted_at     timestamptz,
  approved_at      timestamptz,
  declined_at      timestamptz,
  cancelled_at     timestamptz,

  -- approval / decline
  approved_by_id   text,
  decline_reason   text,
  decline_reason_code text,

  -- proof
  photo_url        text,
  photo_urls       text[]      NOT NULL DEFAULT '{}',
  completion_note  text,

  -- reward — recorded at approval time (coins may have bonus at that moment)
  coins_awarded    int,

  created_at       timestamptz NOT NULL DEFAULT now(),

  -- one record per kid per quest
  UNIQUE (quest_id, member_id)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_qp_quest_id   ON public.quest_participants (quest_id);
CREATE INDEX IF NOT EXISTS idx_qp_member_id  ON public.quest_participants (member_id);
CREATE INDEX IF NOT EXISTS idx_qp_status     ON public.quest_participants (status);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.quest_participants ENABLE ROW LEVEL SECURITY;

-- Authenticated users in the same family can read all participant rows.
-- (Family scoping is handled at the quests level; participants inherit it.)
CREATE POLICY "quest_participants_select"
  ON public.quest_participants FOR SELECT
  TO authenticated
  USING (true);

-- Insert: authenticated users (quest store creates rows on assign/claim)
CREATE POLICY "quest_participants_insert"
  ON public.quest_participants FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Update: authenticated users (approve, decline, submit all call UPDATE)
CREATE POLICY "quest_participants_update"
  ON public.quest_participants FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Delete: authenticated users (reassign or cancel)
CREATE POLICY "quest_participants_delete"
  ON public.quest_participants FOR DELETE
  TO authenticated
  USING (true);
