-- Fixes a real bug: admin_list_users() left-joined members directly on
-- auth_user_id, which fans out into one row per membership for any
-- account that belongs to more than one family (a legitimate, intentional
-- case — see 20260904100000_add_member_email_invite_support.sql, e.g. a
-- grandparent invited into two of their kids' households). The admin
-- Users screen surfaced this as literal duplicate rows for the same
-- account (caught live: React key collision on a real account with two
-- memberships). Fix: pick exactly one membership per profile — the most
-- recently active one — via a lateral join instead of a plain left join,
-- so admin_list_users always returns at most one row per auth account.
drop function if exists public.admin_list_users(text, text, text, integer, integer);

create or replace function public.admin_list_users(
  search        text default null,
  filter_key    text default 'all',  -- 'all' | 'new7d' | 'onboarded' | 'not_onboarded' | 'admin' | 'blocked'
  sort_key      text default 'newest',
  page_offset   integer default 0,
  page_limit    integer default 50
)
returns table (
  auth_user_id         uuid,
  email                text,
  full_name            text,
  created_at           timestamptz,
  onboarding_completed boolean,
  is_admin             boolean,
  family_id            uuid,
  family_name          text,
  member_role          text,
  subscription_tier    text,
  blocked_at           timestamptz,
  blocked_reason       text,
  other_family_count   integer
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_app_admin() then
    return;
  end if;

  return query
  select
    p.id, p.email, p.full_name, p.created_at, p.onboarding_completed, p.is_admin,
    f.id, f.name, m.role, s.tier, p.blocked_at, p.blocked_reason,
    greatest(mc.family_count - 1, 0)
  from public.profiles p
  left join lateral (
    select mm.role, mm.family_id
    from public.members mm
    where mm.auth_user_id = p.id
    order by mm.last_active desc nulls last, mm.created_at desc
    limit 1
  ) m on true
  left join public.families f on f.id = m.family_id
  left join public.subscriptions s on s.user_id = p.id
  left join lateral (
    select count(distinct mm2.family_id) as family_count
    from public.members mm2
    where mm2.auth_user_id = p.id
  ) mc on true
  where
    (search is null or search = '' or p.email ilike '%' || search || '%' or p.full_name ilike '%' || search || '%')
    and (
      filter_key = 'all'
      or (filter_key = 'new7d' and p.created_at >= now() - interval '7 days')
      or (filter_key = 'onboarded' and p.onboarding_completed)
      or (filter_key = 'not_onboarded' and not p.onboarding_completed)
      or (filter_key = 'admin' and p.is_admin)
      or (filter_key = 'blocked' and p.blocked_at is not null)
    )
  order by
    case when sort_key = 'newest' then p.created_at end desc,
    case when sort_key = 'oldest' then p.created_at end asc
  offset page_offset
  limit page_limit;
end;
$$;

comment on function public.admin_list_users is
  'Searchable/filterable/paginated user directory for the admin console Users screen. Exactly one row per auth account (most-recently-active membership picked via lateral join) — other_family_count shows how many ADDITIONAL families the account belongs to, for accounts with legitimate multi-family membership (e.g. a grandparent in two households).';

revoke all on function public.admin_list_users(text, text, text, integer, integer) from public;
grant execute on function public.admin_list_users(text, text, text, integer, integer) to authenticated;
