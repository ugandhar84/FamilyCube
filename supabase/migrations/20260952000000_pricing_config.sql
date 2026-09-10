-- Admin-editable pricing DISPLAY config — [live-requested: "admin should
-- be able to change the price in future both monthly and yearly with
-- discount showing" / "I would be able to edit the display price of our
-- plan monthly and yearly (with discounted strike value to show)"].
--
-- IMPORTANT — this table has ZERO effect on what Apple/Google actually
-- charge a customer. Real billing amounts are set in App Store Connect /
-- Google Play Console and mirrored into RevenueCat as a "package"; there
-- is no API this app (or RevenueCat) exposes to override that. This table
-- only drives: (a) the paywall's PRE-LOAD fallback price text (shown for
-- the brief moment before RevenueCat's real offering loads, or if it
-- fails to load at all), and (b) a NEW discount badge/strikethrough the
-- paywall has never had (PaywallSheet.tsx currently shows no discount UI
-- at all). The real StoreKit price always wins once loaded.
create table if not exists public.pricing_config (
  plan_key                 text primary key default 'family_plan',
  monthly_price_display     text not null default '$3.99',
  yearly_price_display      text not null default '$47.88',
  -- Optional "was" prices — when set, the paywall renders them
  -- strikethrough next to the current price. Purely display copy; does
  -- not need to be mathematically consistent with yearly_discount_pct
  -- (an admin may want to show a "was" price without computing a %, or
  -- vice versa).
  monthly_was_price_display text,
  yearly_was_price_display  text,
  yearly_discount_pct       numeric,
  yearly_discount_badge_text text,
  updated_by                text references public.members(id) on delete set null,
  updated_at                timestamptz not null default now()
);

alter table public.pricing_config enable row level security;

-- Every authenticated user can read — this is what the paywall shows.
drop policy if exists pricing_config_select_all on public.pricing_config;
create policy pricing_config_select_all
  on public.pricing_config for select
  to authenticated
  using (true);

-- Writes are app-admin-only, same is_app_admin() gate as the rest of the
-- admin console.
drop policy if exists pricing_config_write_admin on public.pricing_config;
create policy pricing_config_write_admin
  on public.pricing_config for all
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

comment on table public.pricing_config is
  'Admin-editable pricing DISPLAY text for the paywall (fallback price + discount badge/strikethrough). Does NOT control real charged amounts — those live in App Store Connect/RevenueCat.';

insert into public.pricing_config (plan_key, monthly_price_display, yearly_price_display)
values ('family_plan', '$3.99', '$47.88')
on conflict (plan_key) do nothing;
