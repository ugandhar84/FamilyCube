-- Growth analytics for the admin console: installs/signups over time,
-- onboarding completion rate, and subscriber tier breakdown. Backed by
-- real tables only — profiles.created_at (one row per real signup,
-- confirmed live via store/authStore.ts and the onboarding flow) and
-- subscriptions.tier (real, RevenueCat-webhook-driven — confirmed via
-- supabase/functions/revenuecat-webhook/index.ts). No dollar amounts are
-- stored anywhere in this schema (RevenueCat holds pricing, not this DB),
-- so this reports subscriber counts per tier, not MRR — reporting a
-- fabricated MRR figure would be worse than not showing one.
create or replace function public.admin_get_growth_stats()
returns table (
  signups_total       bigint,
  signups_7d          bigint,
  signups_30d         bigint,
  signups_90d         bigint,
  signups_365d        bigint,
  signups_prev_7d      bigint,  -- the 7d window immediately before signups_7d, for week-over-week comparison
  signups_prev_30d     bigint,
  signups_prev_365d    bigint,  -- year-over-year comparator window
  onboarded_total      bigint,
  onboarding_rate_pct  numeric,
  subs_free           bigint,
  subs_pro            bigint,
  subs_ultimate       bigint
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    (select count(*) from public.profiles),
    (select count(*) from public.profiles where created_at >= now() - interval '7 days'),
    (select count(*) from public.profiles where created_at >= now() - interval '30 days'),
    (select count(*) from public.profiles where created_at >= now() - interval '90 days'),
    (select count(*) from public.profiles where created_at >= now() - interval '365 days'),
    (select count(*) from public.profiles where created_at >= now() - interval '14 days' and created_at < now() - interval '7 days'),
    (select count(*) from public.profiles where created_at >= now() - interval '60 days' and created_at < now() - interval '30 days'),
    (select count(*) from public.profiles where created_at >= now() - interval '730 days' and created_at < now() - interval '365 days'),
    (select count(*) from public.profiles where onboarding_completed),
    (select round(100.0 * count(*) filter (where onboarding_completed) / greatest(count(*), 1), 1) from public.profiles),
    (select count(*) from public.subscriptions where tier = 'free'),
    (select count(*) from public.subscriptions where tier = 'pro'),
    (select count(*) from public.subscriptions where tier = 'ultimate')
  where public.is_app_admin();
$$;

comment on function public.admin_get_growth_stats is
  'Signup/onboarding/subscriber-tier growth stats for the admin console Growth screen. Real data only (profiles.created_at, subscriptions.tier) — no fabricated revenue figures, since this schema stores no pricing data (RevenueCat is the source of truth for that).';

revoke all on function public.admin_get_growth_stats() from public;
grant execute on function public.admin_get_growth_stats() to authenticated;

-- Weekly signup counts for the last 12 weeks — the trend chart's data
-- series. date_trunc('week', ...) buckets by ISO week (Monday start).
create or replace function public.admin_get_weekly_signups(weeks_back integer default 12)
returns table (
  week_start date,
  signups    bigint
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select date_trunc('week', w)::date, coalesce(count(p.id), 0)
  from generate_series(
    date_trunc('week', now()) - (make_interval(weeks => greatest(weeks_back, 1) - 1)),
    date_trunc('week', now()),
    interval '1 week'
  ) as w
  left join public.profiles p
    on date_trunc('week', p.created_at) = w
  where public.is_app_admin()
  group by w
  order by w asc;
$$;

comment on function public.admin_get_weekly_signups is
  'Weekly signup counts (profiles.created_at bucketed by ISO week) for the admin Growth screen trend chart. Defaults to the last 12 weeks.';

revoke all on function public.admin_get_weekly_signups(integer) from public;
grant execute on function public.admin_get_weekly_signups(integer) to authenticated;
