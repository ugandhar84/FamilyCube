-- A kid/teen's savings goal (shown on their own Piggy Bank sheet and on
-- the parent-facing Perks page) was previously always auto-derived as
-- "whichever reward you're closest to affording" — the kid never actually
-- chose it. This lets them pick a specific reward as their goal from the
-- Perks Store.

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS goal_reward_id text;
