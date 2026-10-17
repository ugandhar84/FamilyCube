-- A family admin removing someone is deliberate: that person's own login must stop reaching the family's data, and the app
-- must not quietly restore them when they open it. Self-deletion keeps its 7-day undo (removed_by stays null there).
alter table public.members add column if not exists removed_by text;

create or replace function public.current_user_family_id()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select family_id from public.members
  where id = public.resolve_active_member_id()
    and not (deleted_at is not null and removed_by is not null)
  limit 1;
$$;

-- The same rule for "which members is this login": a removed member is no longer one of them.
create or replace function public.current_user_member_ids()
returns setof text
language sql
stable
security definer
set search_path to 'public'
as $$
  select id from public.members where auth_user_id = auth.uid() and not (deleted_at is not null and removed_by is not null);
$$;
