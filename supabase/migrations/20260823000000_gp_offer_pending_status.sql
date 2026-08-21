-- Scenario 1.6 — GP offer requires parent Accept/Decline gate.
--
-- A grandparent/senior tapping "I'll Handle It" on an openToGP chore used to
-- claim it outright (assigned_to_id + status:'in_progress') with zero parent
-- involvement and no way to withdraw. It now records an OFFER instead: the
-- chore moves to a new 'gp_offer_pending' status with gp_offer_by_id set to
-- the offering GP's member id, and stays unassigned until a parent Accepts
-- (assigned_to_id + 'in_progress', gp_offer_by_id cleared) or Declines
-- (back to 'todo', gp_offer_by_id cleared) — or the GP withdraws their own
-- offer (also back to 'todo'). See store/choreStore.ts's claimGPErrand /
-- acceptGPOffer / declineGPOffer / withdrawGPOffer.

ALTER TABLE public.chore_tasks
  ADD COLUMN IF NOT EXISTS gp_offer_by_id text;

ALTER TABLE public.chore_tasks
  DROP CONSTRAINT IF EXISTS chore_tasks_status_check;

ALTER TABLE public.chore_tasks
  ADD CONSTRAINT chore_tasks_status_check
  CHECK (status = ANY (ARRAY[
    'todo',
    'claimed',
    'in_progress',
    'pending_approval',
    'pending_grandparent_approval',
    'pending_parent_approval',
    'gp_offer_pending',
    'approved',
    'auto_approved',
    'done',
    'completed',
    'declined',
    'redo_requested',
    'archived',
    'cancelled',
    'expired'
  ]));

COMMENT ON COLUMN public.chore_tasks.gp_offer_by_id IS
  'memberId of the grandparent/senior who offered to handle this chore while status = gp_offer_pending (scenario 1.6). Cleared on accept/decline/withdraw.';
