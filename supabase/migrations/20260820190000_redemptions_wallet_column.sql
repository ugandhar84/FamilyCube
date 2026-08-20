-- Adds a `wallet` column to `reward_redemptions` so a declined/cancelled
-- reward redemption can be refunded to the correct coin jar (mainCoins vs
-- gpCoins).
--
-- CORRECTED: the original version of this migration targeted a table named
-- `redemptions`, which does not exist in this database — the real table,
-- confirmed via information_schema, is `reward_redemptions`. Because the
-- table name didn't exist, `alter table if exists` silently no-op'd on
-- first deploy; this migration replaces that no-op with the real fix.
--
-- Also discovered while fixing this: store/rewardStore.ts's redemption
-- mutators (redeemReward, approveRedemption, rejectRedemption,
-- cancelRedemption) never wrote to the database at all — only local
-- Zustand/AsyncStorage state — and syncFromDB's read was pointed at the
-- same nonexistent `redemptions` table name, so it always silently
-- returned nothing. That is fixed in the same pass as this migration (see
-- store/rewardStore.ts) — redemptions now actually persist and sync across
-- the family for the first time. See docs/requirements_vs_code_gaps.html,
-- scenario 8.3.

alter table if exists public.reward_redemptions
  add column if not exists wallet text check (wallet in ('mainCoins', 'gpCoins'));
