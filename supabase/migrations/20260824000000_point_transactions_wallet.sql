-- awardPoints (store/choreStore.ts) and requestCashOut have always included a
-- `wallet` field ('mainCoins' | 'gpCoins') in every point_transactions insert,
-- but the live table never had this column — confirmed via a live-DB QA audit
-- that every single coin-award/cash-out transaction-ledger insert has been
-- silently failing (dbInsert only console.warns on error, never surfaced).
-- The member's actual coin balance still updates correctly (a separate
-- award_coins RPC call), but the transaction history/ledger row backing
-- PiggyBankSheet and any reporting view was never actually being written.

alter table public.point_transactions
  add column if not exists wallet text;

comment on column public.point_transactions.wallet is
  'Which sub-wallet this transaction moves: mainCoins or gpCoins. Nullable/defaults to mainCoins for legacy rows written before this column existed.';
