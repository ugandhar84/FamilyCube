-- Adds a `wallet` column to `redemptions` so a declined/cancelled reward
-- redemption can be refunded to the correct coin jar (mainCoins vs gpCoins).
--
-- Context: store/rewardStore.ts's redeemReward() calls deductCoins()
-- immediately at *request* time (not at approval time), so a pending
-- redemption that is later rejected or cancelled must refund the same
-- wallet it was debited from. Previously there was no way to know which
-- wallet a given redemption came from, so rejectRedemption/cancelRedemption
-- could only restore `stock`, never the coins — the kid's balance was
-- permanently reduced even for a declined request. See
-- docs/requirements_vs_code_gaps.html, scenario 8.3.
--
-- Note: this migration only adds the column; it does not change the fact
-- that store/rewardStore.ts's redemption mutators (redeemReward,
-- approveRedemption, rejectRedemption, cancelRedemption, deleteRedemption)
-- do not currently write to this table at all (only `syncFromDB` reads it).
-- That is a separate, larger pre-existing gap, not addressed by this
-- migration — see the gaps doc for details.

alter table if exists public.redemptions
  add column if not exists wallet text check (wallet in ('mainCoins', 'gpCoins'));
