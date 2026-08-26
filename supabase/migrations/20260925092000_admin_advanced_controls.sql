-- Advanced admin controls: platform-wide analytics + cross-family
-- family/member visibility for the admin console. Both are read-only,
-- security-definer RPCs gated by is_app_admin() — deliberately NOT an
-- OR-clause added to members/families' existing RLS SELECT policies,
-- since that would risk quietly weakening the family-scoped policy real
-- users rely on. An RPC keeps the admin bypass in one auditable place,
-- callable only by is_app_admin() callers, and returns data shaped for
-- the admin screens rather than raw table access.

-- ─── Platform analytics ─────────────────────────────────────────────────────
-- Aggregate counts only — no per-family or per-member rows, so this alone
-- can't be used to enumerate family data even by an admin who shouldn't
-- have gone further than dashboard numbers.
create or replace function public.admin_get_platform_stats()
returns table (
  total_families        bigint,
  total_members         bigint,
  total_parents         bigint,
  total_kids            bigint,
  total_chores          bigint,
  chores_completed      bigint,
  total_events          bigint,
  total_chat_messages   bigint,
  total_kid_requests    bigint,
  kid_requests_pending  bigint
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    (select count(*) from public.families),
    (select count(*) from public.members),
    (select count(*) from public.members where role = 'parent'),
    (select count(*) from public.members where role in ('kid', 'child')),
    (select count(*) from public.chore_tasks),
    (select count(*) from public.chore_tasks where status = 'completed'),
    (select count(*) from public.calendar_events),
    (select count(*) from public.chat_messages),
    (select count(*) from public.kid_requests),
    (select count(*) from public.kid_requests where status = 'pending')
  where public.is_app_admin();
$$;

comment on function public.admin_get_platform_stats is
  'Platform-wide aggregate counts for the admin console analytics screen. Aggregates only, no row-level data. Returns zero rows for a non-admin caller (WHERE is_app_admin() filters the single row out rather than raising).';

revoke all on function public.admin_get_platform_stats() from public;
grant execute on function public.admin_get_platform_stats() to authenticated;

-- ─── Cross-family family/member directory ───────────────────────────────────
-- SELECT-only, admin-gated. Returns one row per family with a member count
-- and the family's created_at — enough for the admin console's family list
-- without exposing member-level PII (names/pins/etc) at this tier; a
-- second RPC (below) drills into one family's member list on demand.
create or replace function public.admin_list_families()
returns table (
  family_id    uuid,
  family_name  text,
  member_count bigint,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select f.id, f.name, count(m.id), f.created_at
  from public.families f
  left join public.members m on m.family_id = f.id
  where public.is_app_admin()
  group by f.id, f.name, f.created_at
  order by f.created_at desc;
$$;

comment on function public.admin_list_families is
  'Cross-family directory for the admin console (family list, member counts). Admin-gated via is_app_admin(); returns no rows for a non-admin caller.';

revoke all on function public.admin_list_families() from public;
grant execute on function public.admin_list_families() to authenticated;

create or replace function public.admin_list_family_members(target_family_id uuid)
returns table (
  member_id    text,
  name         text,
  role         text,
  coins        integer,
  level        integer,
  last_active  timestamptz,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select m.id, m.name, m.role, m.coins, m.level, m.last_active, m.created_at
  from public.members m
  where public.is_app_admin()
    and m.family_id = target_family_id
  order by m.created_at asc;
$$;

comment on function public.admin_list_family_members is
  'Member roster for one family, for the admin console family-detail drill-in. Admin-gated via is_app_admin(); returns no rows for a non-admin caller or for a family_id that does not exist.';

revoke all on function public.admin_list_family_members(uuid) from public;
grant execute on function public.admin_list_family_members(uuid) to authenticated;

-- ─── send-broadcast admin check ─────────────────────────────────────────────
-- The existing supabase/functions/send-broadcast edge function checks
-- profiles.is_admin (PawBond-era). It runs with the service-role key so it
-- bypasses RLS entirely and can't call is_app_admin() (a SQL function
-- resolved against auth.uid(), which the service-role client has none of)
-- — instead it must query app_admins directly by the caller's own user id,
-- which the function already extracts via auth.getUser(). No schema change
-- needed here; the function source itself is updated separately to query
-- app_admins instead of profiles.
