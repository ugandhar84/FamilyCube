-- The live `subscriptions` table (id, user_id, tier, rc_customer_id,
-- expires_at, created_at, updated_at) was created outside the tracked
-- migration history — it does not match 20260706000001_subscriptions.sql
-- (which defines tier/status/product_id/platform/revenuecat_app_user_id/
-- fallback_tier) at all, and predates today's single-tier reconciliation
-- work. revenuecat-webhook, sync-subscription, and subscriptionStore.ts all
-- read/write status, product_id, platform, and revenuecat_app_user_id —
-- against the REAL live table as it stood before this migration, every one
-- of those writes would have failed outright (unknown column).
--
-- Reconciling the live table up to match the code (rather than stripping
-- the code down to the live table's narrower shape) preserves status
-- tracking (active/expired/cancelled/grace_period) — without it, a
-- billing-issue grace period is indistinguishable from a real cancellation,
-- which matters for not locking out a family over a temporary card decline.
alter table public.subscriptions
  add column if not exists status text not null default 'active',
  add column if not exists product_id text,
  add column if not exists platform text,
  add column if not exists revenuecat_app_user_id text;

alter table public.subscriptions drop constraint if exists subscriptions_status_check;
alter table public.subscriptions add constraint subscriptions_status_check
  check (status in ('active', 'expired', 'cancelled', 'grace_period'));

alter table public.subscriptions drop constraint if exists subscriptions_tier_check;
alter table public.subscriptions add constraint subscriptions_tier_check
  check (tier in ('free', 'premium'));

-- rc_customer_id (already on the live table, unused by any current code
-- path) is left in place rather than dropped — no harm keeping a column
-- nothing writes to, and dropping it isn't needed for anything in this
-- reconciliation.

create unique index if not exists subscriptions_user_id_idx on public.subscriptions(user_id);

alter table public.subscriptions enable row level security;

drop policy if exists "Users can read own subscription" on public.subscriptions;
create policy "Users can read own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

drop policy if exists "Service role can manage subscriptions" on public.subscriptions;
create policy "Service role can manage subscriptions"
  on public.subscriptions for all
  using (auth.role() = 'service_role');
