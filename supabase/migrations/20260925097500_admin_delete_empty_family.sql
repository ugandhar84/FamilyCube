-- Lets an admin delete an EMPTY family (zero members) from the admin
-- console — the cleanup path for exactly the kind of duplicate-created,
-- abandoned test family found by admin_list_duplicate_family_creators().
-- Deliberately narrow: refuses (raises) if the family still has any
-- members row, rather than cascading — a family with real people/data in
-- it is never a one-click admin delete, only a genuinely empty shell is.
-- families.family_invites also has no ON DELETE CASCADE (schema-level,
-- confirmed), so any pending invite rows are cleared explicitly first.
create or replace function public.admin_delete_empty_family(target_family_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  member_cnt integer;
begin
  if not public.is_app_admin() then
    raise exception 'Not authorized';
  end if;

  select count(*) into member_cnt from public.members where family_id = target_family_id;
  if member_cnt > 0 then
    raise exception 'Family has % member(s) — only an empty family can be deleted this way', member_cnt;
  end if;

  delete from public.family_invites where family_id = target_family_id;
  delete from public.families where id = target_family_id;
end;
$$;

comment on function public.admin_delete_empty_family is
  'Admin-only cleanup for an empty (zero-member) family, e.g. a duplicate created during onboarding testing. Refuses to delete a family that still has members. See admin_list_duplicate_family_creators() for how these are typically found.';

revoke all on function public.admin_delete_empty_family(uuid) from public;
grant execute on function public.admin_delete_empty_family(uuid) to authenticated;
