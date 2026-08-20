-- Scenario 4.7 — Disputed Approval (two parents disagree).
--
-- chore_tasks gains a dispute/reversal audit trail: a parent who disagrees
-- with an already-approved-and-paid chore can flag it for discussion
-- (no financial effect) or request a full reversal. A reversal never
-- executes silently — it either needs the ORIGINAL approving parent's
-- co-sign (default) or, if the household has explicitly opted into
-- families.allow_unilateral_reversal, the requesting parent can execute it
-- immediately, but every reversal (co-signed or unilateral) always leaves
-- a visible audit note (dispute_reason/disputed_by_id/reversed_by_id) —
-- see store/choreStore.ts's flagApprovalForDiscussion / standByApproval /
-- requestApprovalReversal / coSignReversal / _executeReversal.

ALTER TABLE public.chore_tasks
  ADD COLUMN IF NOT EXISTS dispute_status  text,
  ADD COLUMN IF NOT EXISTS dispute_reason  text,
  ADD COLUMN IF NOT EXISTS disputed_by_id  text,
  ADD COLUMN IF NOT EXISTS disputed_at     timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_at     timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by_id  text;

ALTER TABLE public.chore_tasks
  DROP CONSTRAINT IF EXISTS chore_tasks_dispute_status_check;
ALTER TABLE public.chore_tasks
  ADD CONSTRAINT chore_tasks_dispute_status_check
  CHECK (dispute_status IS NULL OR dispute_status IN ('flagged', 'reversal_requested'));

ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS allow_unilateral_reversal boolean NOT NULL DEFAULT false;
