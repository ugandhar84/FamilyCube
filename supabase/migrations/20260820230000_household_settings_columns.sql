-- Household Settings (store/choreStore.ts HouseholdSettings) have never
-- actually synced across devices — updateHouseholdSettings has always
-- attempted to write points_to_fiat_ratio, spend/save/give_allocation_pct,
-- allow_child_allocation_override, auto_approve_timeout_hours, and
-- min_cashout_points to the `families` table, but that table (confirmed
-- via information_schema) only ever had id/name/created_by/created_at/
-- home_lat/home_lng/home_address — none of these settings columns exist,
-- so every write has silently failed (caught, console.warn only) since
-- this feature's inception. loadFromStorage also never reads from the DB
-- at all — it's AsyncStorage-only on both sides. The practical effect: if
-- Parent-1 changes the household's Spend/Save/Give split, cash-out
-- minimum, or auto-approve timeout on their own device, Parent-2's device
-- never sees the change — each device silently keeps its own local copy
-- (or the hardcoded defaults, if that device never set it locally either).
--
-- Found while wiring the new teen_reward_cosign_threshold column (scenario
-- 1.13) — rather than let that one new setting join five already-broken
-- ones, this adds all six real columns so the whole HouseholdSettings
-- object can finally persist and sync for real.

ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS points_to_fiat_ratio double precision NOT NULL DEFAULT 0.01,
  ADD COLUMN IF NOT EXISTS spend_allocation_pct integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS save_allocation_pct integer NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS give_allocation_pct integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS allow_child_allocation_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_approve_timeout_hours integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS min_cashout_points integer NOT NULL DEFAULT 100;
