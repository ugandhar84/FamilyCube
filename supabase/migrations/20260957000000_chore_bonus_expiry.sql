-- Flash-bonus expiration was confirmed dead: bonus_coins exists on
-- chore_tasks and renders live via FlashBonusBadge.tsx (a fully-built
-- countdown UI with its own ticking clock and auto-hide-at-zero
-- behavior), but there is no expiry column, no UI to set one, and no
-- cron logic to ever clear/penalize an expired bonus — the badge shows
-- indefinitely with no real countdown behind it (live-reported: a chore
-- overdue since Sep 5 still showing "+10 bonus" with no expiration).
--
-- bonus_expires_at is set to now() + 24h at bonus-activation time
-- (fixed 24h window, no custom picker). bonus_expired_notified_at is a
-- one-shot cron guard, same pattern as pool_urgent_notified_at — though
-- nulling bonus_expires_at itself after processing is also a natural
-- guard, this column additionally distinguishes "never had a bonus"
-- from "bonus already expired and was processed" for any future
-- auditing/debugging need.
alter table public.chore_tasks
  add column if not exists bonus_expires_at timestamptz,
  add column if not exists bonus_expired_notified_at timestamptz;
