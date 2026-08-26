-- Same-named families are otherwise indistinguishable in the admin
-- Families list ("Smith Family" vs "Smith Family"). Adds the creator's
-- auth email (families.created_by -> auth.users.id) so the admin can tell
-- them apart at a glance without opening each one. security definer
-- already lets this function read auth.users; is_app_admin() still gates
-- the whole result set to admin callers only.
drop function if exists public.admin_list_families();

create or replace function public.admin_list_families()
returns table (
  family_id      uuid,
  family_name    text,
  member_count   bigint,
  created_at     timestamptz,
  is_solo_family boolean,
  creator_email  text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select f.id, f.name, count(m.id), f.created_at, count(m.id) <= 1, u.email
  from public.families f
  left join public.members m on m.family_id = f.id
  left join auth.users u on u.id = f.created_by
  where public.is_app_admin()
  group by f.id, f.name, f.created_at, u.email
  order by (count(m.id) <= 1) desc, f.created_at desc;
$$;

revoke all on function public.admin_list_families() from public;
grant execute on function public.admin_list_families() to authenticated;
