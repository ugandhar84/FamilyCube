-- No-show/abandonment sweep (QA punch list #1 — master flow spec's "Gone
-- quiet, still on?" exit branch) needs a way to tell "claimed a while ago,
-- never touched since" apart from "just claimed a second ago" — chore_tasks
-- had no timestamp at all for when a single-slot claim happened (only
-- bounty_claims.claimed_at exists, for multi-slot bounties). Added here so
-- the sweep edge function (chore-noshow-sweep) can filter on it directly.
--
-- Deliberately NOT reusing updated_at: that column is bumped by many
-- unrelated mutations (reassigns, coin edits, etc), so "time since
-- updated_at" would reset every time a parent touches the chore for any
-- reason, masking genuine claim-then-silence. claimed_at is set exactly
-- once, when a chore transitions into 'in_progress' via a claim, and
-- cleared if it's ever released back to the pool — see choreStore.ts's
-- claimPoolQuest/reassignChore/requestRedo for the write sites.

ALTER TABLE public.chore_tasks
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

COMMENT ON COLUMN public.chore_tasks.claimed_at IS
  'Set when a single-slot chore transitions to in_progress via a claim; cleared when released back to the pool. Used by chore-noshow-sweep to detect claimed-then-abandoned chores.';
