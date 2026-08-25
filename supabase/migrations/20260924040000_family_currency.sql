-- Household currency for coin-to-fiat display (StoreScreen.tsx already
-- shows `${(coins * points_to_fiat_ratio).toFixed(2)}` hardcoded to a
-- dollar sign) — per user request, parents should be able to set both the
-- ratio (already existed, points_to_fiat_ratio) AND which local currency
-- symbol that number is displayed in.
alter table public.families
  add column if not exists currency_code text not null default 'USD',
  add column if not exists currency_symbol text not null default '$';
