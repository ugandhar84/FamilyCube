-- Enforces the real invariant: one auth account may CREATE at most one
-- family. Joining additional families (e.g. a grandparent invited into two
-- of their kids' households) stays unlimited — that's members.auth_user_id,
-- a separate column with no uniqueness constraint, deliberately, per
-- 20260904100000's own reasoning. This migration only constrains
-- families.created_by, which records who ran the ONE-TIME "Create Family"
-- flow, not who belongs to a family.
--
-- SetupFamilyScreen.tsx already has a client-side guard (check for an
-- existing members row before showing the create form) but that only
-- catches the common case — it doesn't stop a stale-cache tap-through, a
-- race between two concurrent create attempts, or a direct API call. A DB
-- constraint is the actual backstop; the client guard stays as the fast
-- path that avoids ever reaching this constraint in the UI.
--
-- Diagnostic first: how many accounts currently have duplicate created
-- families. If this returns rows, the unique index below will fail to
-- create — surfacing exactly which accounts need cleanup before the
-- invariant can be enforced, rather than silently skipping the constraint.
do $$
declare
  dup_count integer;
begin
  select count(*) into dup_count
  from (
    select created_by
    from public.families
    where created_by is not null
    group by created_by
    having count(*) > 1
  ) dupes;

  if dup_count > 0 then
    raise notice 'Found % auth account(s) with more than one created family — see admin_list_duplicate_family_creators() after this migration runs to identify and clean them up before the unique constraint can be added.', dup_count;
  end if;
end $$;

-- Admin-only diagnostic RPC: which accounts created more than one family,
-- and which family ids, so the admin console (or a one-off manual query)
-- can decide which duplicate to keep vs. delete/merge before re-running
-- the constraint migration.
create or replace function public.admin_list_duplicate_family_creators()
returns table (
  creator_email text,
  created_by    uuid,
  family_ids    uuid[],
  family_names  text[],
  family_count  bigint
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select u.email, f.created_by, array_agg(f.id order by f.created_at), array_agg(f.name order by f.created_at), count(*)
  from public.families f
  join auth.users u on u.id = f.created_by
  where public.is_app_admin()
  group by u.email, f.created_by
  having count(*) > 1
  order by count(*) desc;
$$;

revoke all on function public.admin_list_duplicate_family_creators() from public;
grant execute on function public.admin_list_duplicate_family_creators() to authenticated;

-- The actual unique-index constraint is added in a FOLLOW-UP migration
-- (20260925098000_add_families_created_by_unique_constraint.sql), not
-- here — this project already has at least one account (confirmed via the
-- diagnostic above, at authoring time: ugandhar.nellore@gmail.com, 2
-- created families) with duplicate created families, almost certainly
-- from repeated admin/dev testing of the onboarding flow. The constraint
-- can't be added until those are resolved (deleted or reassigned), so it
-- ships separately so this migration (the diagnostic tooling) can land
-- immediately without blocking on manual cleanup.
