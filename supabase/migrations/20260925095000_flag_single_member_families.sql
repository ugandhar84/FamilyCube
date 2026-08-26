-- Surfaces "solo" families — exactly one member, i.e. a parent who signed
-- up but never added a kid or co-parent. Either stuck mid-onboarding or a
-- genuinely single-adult household; either way a distinct
-- engagement/support segment worth the admin being able to see at a
-- glance, not just a low-usage family buried in the list.
--
-- Replaces both admin_get_platform_stats() and admin_list_families() from
-- 20260925092000_admin_advanced_controls.sql (already applied) with
-- versions that add this count/flag — create or replace, not a fresh
-- function, so callers don't need to change which RPC they call.
drop function if exists public.admin_get_platform_stats();

create or replace function public.admin_get_platform_stats()
returns table (
  total_families          bigint,
  total_members           bigint,
  total_parents           bigint,
  total_kids              bigint,
  total_chores            bigint,
  chores_completed        bigint,
  total_events            bigint,
  total_chat_messages     bigint,
  total_kid_requests      bigint,
  kid_requests_pending    bigint,
  single_member_families  bigint
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
    (select count(*) from public.kid_requests where status = 'pending'),
    (select count(*) from (
      select family_id from public.members
      group by family_id
      having count(*) = 1
    ) solo)
  where public.is_app_admin();
$$;

drop function if exists public.admin_list_families();

create or replace function public.admin_list_families()
returns table (
  family_id      uuid,
  family_name    text,
  member_count   bigint,
  created_at     timestamptz,
  is_solo_family boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select f.id, f.name, count(m.id), f.created_at, count(m.id) <= 1
  from public.families f
  left join public.members m on m.family_id = f.id
  where public.is_app_admin()
  group by f.id, f.name, f.created_at
  order by (count(m.id) <= 1) desc, f.created_at desc;
$$;

revoke all on function public.admin_get_platform_stats() from public;
grant execute on function public.admin_get_platform_stats() to authenticated;
revoke all on function public.admin_list_families() from public;
grant execute on function public.admin_list_families() to authenticated;
