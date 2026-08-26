-- Admin Users screen: a real, searchable/filterable/paginated roster of
-- every signed-up account (profiles), not just aggregate counts. Backed
-- by profiles directly (email, created_at, onboarding_completed,
-- is_admin — all real, live columns, confirmed via schema_familycube.sql
-- and store/authStore.ts's own usage), plus each account's family (via
-- members.auth_user_id) and subscription tier where they exist. This is
-- the "who signed up, when, did they finish onboarding, what family are
-- they in" tool the admin console was missing — Analytics/Growth only
-- gave aggregate counts, this gives the underlying rows.
create or replace function public.admin_list_users(
  search        text default null,
  filter_key    text default 'all',  -- 'all' | 'new7d' | 'onboarded' | 'not_onboarded' | 'admin'
  sort_key      text default 'newest', -- 'newest' | 'oldest'
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
  subscription_tier    text
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
    f.id, f.name, m.role, s.tier
  from public.profiles p
  left join public.members m on m.auth_user_id = p.id
  left join public.families f on f.id = m.family_id
  left join public.subscriptions s on s.user_id = p.id
  where
    (search is null or search = '' or p.email ilike '%' || search || '%' or p.full_name ilike '%' || search || '%')
    and (
      filter_key = 'all'
      or (filter_key = 'new7d' and p.created_at >= now() - interval '7 days')
      or (filter_key = 'onboarded' and p.onboarding_completed)
      or (filter_key = 'not_onboarded' and not p.onboarding_completed)
      or (filter_key = 'admin' and p.is_admin)
    )
  order by
    case when sort_key = 'newest' then p.created_at end desc,
    case when sort_key = 'oldest' then p.created_at end asc
  offset page_offset
  limit page_limit;
end;
$$;

comment on function public.admin_list_users is
  'Searchable/filterable/paginated user directory for the admin console Users screen. Admin-gated via is_app_admin() — returns zero rows for a non-admin caller (checked explicitly since this is plpgsql, not a WHERE-filtered SQL function).';

revoke all on function public.admin_list_users(text, text, text, integer, integer) from public;
grant execute on function public.admin_list_users(text, text, text, integer, integer) to authenticated;
