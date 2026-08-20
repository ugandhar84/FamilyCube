-- Scenario 1.13 — Teen Reward Co-Sign Threshold.
--
-- families.teen_reward_cosign_threshold: household-configured coin ceiling
-- above which a Teen self-created quest's reward requires a parent's
-- Approve/Adjust/Decline before it pays out. Mirrors the existing
-- min_cashout_points / auto_approve_timeout_hours settings columns on this
-- table (see store/choreStore.ts updateHouseholdSettings).
--
-- chore_tasks.reward_pending_review: set on a chore at creation when its
-- creator is a 'teen' member and coins_reward (+ bonus_coins) exceeds the
-- household's threshold. The chore itself stays fully workable — status is
-- unaffected — only the coin payout is gated in submitChore/resubmitChore/
-- approveChore while this is true, cleared by a parent via
-- approveTeenReward / adjustTeenReward / declineTeenReward.

ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS teen_reward_cosign_threshold integer NOT NULL DEFAULT 100;

ALTER TABLE public.chore_tasks
  ADD COLUMN IF NOT EXISTS reward_pending_review boolean NOT NULL DEFAULT false;
