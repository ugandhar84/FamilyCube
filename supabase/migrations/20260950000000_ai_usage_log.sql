-- Per-call AI usage log — foundation for the admin console's "how many AI
-- calls is each user making, per service" view
-- [live-requested: "how many call we are using per user and total per day
-- week month year stats"]. One row per call (not a pre-aggregated rollup)
-- so the admin console can group by any time window (day/week/month/year)
-- and by user/service after the fact, without needing a second aggregate
-- table to keep in sync.
--
-- Server-side insert only — see _shared/logAiUsage.ts. No client-side
-- insert policy: a user's own client must never be able to write its own
-- usage rows (trivially spoofable, defeats the point of a cost/usage
-- dashboard for admins).
create table if not exists public.ai_usage_log (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  member_id          text references public.members(id) on delete set null,
  family_id          text,
  service            text not null check (service in (
    'ask_cube', 'family_ai', 'flyer_parse', 'parse_prescription',
    'grocery_receipt_parse', 'analyze_medical_record',
    'analyze_appointment_recording', 'grocery_ai_suggest', 'moderate_message'
  )),
  provider           text not null,
  model              text not null,
  prompt_tokens      integer,
  completion_tokens  integer,
  total_tokens       integer,
  success            boolean not null default true,
  error_message      text,
  latency_ms         integer
);

create index if not exists ai_usage_log_member_created_idx on public.ai_usage_log(member_id, created_at desc);
create index if not exists ai_usage_log_service_created_idx on public.ai_usage_log(service, created_at desc);
create index if not exists ai_usage_log_family_created_idx on public.ai_usage_log(family_id, created_at desc);
create index if not exists ai_usage_log_created_idx on public.ai_usage_log(created_at desc);

alter table public.ai_usage_log enable row level security;

-- No SELECT policy for regular users — this is admin-only visibility of
-- usage/cost data, not user-facing. Reads happen only via the
-- security-definer RPCs below (same is_app_admin() gate as the rest of
-- the admin console). No INSERT policy either — writes happen only from
-- edge functions using the service-role key, which bypasses RLS entirely.

comment on table public.ai_usage_log is
  'One row per AI model call across every AI-calling edge function, for the admin console AI usage dashboard. Written server-side only (service-role); read only via admin-gated security-definer RPCs.';

-- ── Admin RPCs ────────────────────────────────────────────────────────────

create or replace function public.admin_get_ai_usage_summary(days integer default 30)
returns table (
  service text,
  call_count bigint,
  success_count bigint,
  total_tokens bigint
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    l.service,
    count(*) as call_count,
    count(*) filter (where l.success) as success_count,
    coalesce(sum(l.total_tokens), 0) as total_tokens
  from public.ai_usage_log l
  where public.is_app_admin()
    and l.created_at >= now() - make_interval(days => days)
  group by l.service
  order by call_count desc;
$$;

comment on function public.admin_get_ai_usage_summary is
  'Per-service AI call/token totals over the last N days. Returns zero rows for a non-admin caller.';

create or replace function public.admin_get_ai_usage_by_user(days integer default 30, result_limit integer default 50)
returns table (
  member_id text,
  member_name text,
  family_id text,
  call_count bigint,
  total_tokens bigint
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    l.member_id,
    m.name as member_name,
    l.family_id,
    count(*) as call_count,
    coalesce(sum(l.total_tokens), 0) as total_tokens
  from public.ai_usage_log l
  left join public.members m on m.id = l.member_id
  where public.is_app_admin()
    and l.created_at >= now() - make_interval(days => days)
    and l.member_id is not null
  group by l.member_id, m.name, l.family_id
  order by call_count desc
  limit result_limit;
$$;

comment on function public.admin_get_ai_usage_by_user is
  'Heaviest AI users over the last N days, most calls first. Returns zero rows for a non-admin caller.';

create or replace function public.admin_get_ai_usage_for_user(target_member_id text)
returns table (
  service text,
  call_count bigint,
  total_tokens bigint,
  last_used_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    l.service,
    count(*) as call_count,
    coalesce(sum(l.total_tokens), 0) as total_tokens,
    max(l.created_at) as last_used_at
  from public.ai_usage_log l
  where public.is_app_admin()
    and l.member_id = target_member_id
  group by l.service
  order by call_count desc;
$$;

comment on function public.admin_get_ai_usage_for_user is
  'One member''s AI usage broken down by service, all-time. Returns zero rows for a non-admin caller.';

-- Time-bucketed totals (day/week/month/year) for the admin dashboard's
-- trend view — one row per bucket, all services combined. The admin
-- screen can call this once per granularity the toggle needs, rather than
-- pulling raw rows and bucketing client-side.
create or replace function public.admin_get_ai_usage_trend(bucket text default 'day', days integer default 90)
returns table (
  bucket_start timestamptz,
  call_count bigint,
  total_tokens bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if bucket not in ('hour', 'day', 'week', 'month', 'year') then
    raise exception 'invalid bucket: %', bucket;
  end if;
  return query execute format(
    'select date_trunc(%L, l.created_at) as bucket_start,
            count(*) as call_count,
            coalesce(sum(l.total_tokens), 0) as total_tokens
     from public.ai_usage_log l
     where public.is_app_admin()
       and l.created_at >= now() - make_interval(days => %L)
     group by 1
     order by 1',
    bucket, days
  );
end;
$$;

comment on function public.admin_get_ai_usage_trend is
  'Call/token counts bucketed by hour/day/week/month/year, for the admin dashboard trend chart. Returns zero rows for a non-admin caller.';

revoke all on function public.admin_get_ai_usage_summary(integer) from public;
grant execute on function public.admin_get_ai_usage_summary(integer) to authenticated;
revoke all on function public.admin_get_ai_usage_by_user(integer, integer) from public;
grant execute on function public.admin_get_ai_usage_by_user(integer, integer) to authenticated;
revoke all on function public.admin_get_ai_usage_for_user(text) from public;
grant execute on function public.admin_get_ai_usage_for_user(text) to authenticated;
revoke all on function public.admin_get_ai_usage_trend(text, integer) from public;
grant execute on function public.admin_get_ai_usage_trend(text, integer) to authenticated;
