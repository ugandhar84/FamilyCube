-- Real gap found by a direct QA trace of onboarding, a genuinely new
-- finding distinct from the earlier members_update_guard fix (migration
-- 20260930440000): that trigger only ever fired on UPDATE, never INSERT.
-- members_insert's RLS policy is the same permissive
-- (auth_user_id = auth.uid()) OR (family_id = current_user_family_id())
-- shape — meaning any authenticated family member could INSERT a brand
-- new row with role='parent' directly, creating a fake second parent for
-- themselves (or anyone), completely bypassing the real onboarding flow
-- and the invite-code system's identity checks.
--
-- The legitimate insert paths, read directly from the app's own code:
--   - SetupFamilyScreen.tsx: the very first parent inserts their OWN row
--     with auth_user_id = auth.uid() (the caller's real, server-verified
--     Supabase Auth identity) immediately after creating the family.
--   - familyStore.addPendingMember: a parent pre-creates a PENDING row for
--     a kid/teen/grandparent/second-parent with NO auth_user_id at all —
--     it's claimed later via the invite-code redemption flow
--     (join-family), not at insert time.
--
-- Complication checked directly against the app's own onboarding UI:
-- role='parent' is a genuinely legitimate choice in addPendingMember's own
-- invite-role picker (inviting a second parent/spouse) — so a role='parent'
-- pending row with no auth_user_id yet is a REAL, intended case, not just
-- the self-registration case. The actual rule that distinguishes
-- legitimate from spoofed: either (a) the caller is claiming their OWN
-- parent row right now (auth_user_id = auth.uid()), or (b) the caller
-- ALREADY has standing as a parent in this family (pre-creating a pending
-- invite for a second parent). A kid or teen — who has neither — can do
-- neither, closing the actual gap without breaking the real second-parent
-- invite flow.
create or replace function public.guard_members_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_active_member_id text;
  v_caller_is_parent boolean;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.role <> 'parent' then
    return new;
  end if;

  if new.auth_user_id is not distinct from auth.uid() and auth.uid() is not null then
    return new;
  end if;

  v_active_member_id := public.resolve_active_member_id();
  select exists (
    select 1 from public.members
    where id = v_active_member_id and role = 'parent'
  ) into v_caller_is_parent;

  if not v_caller_is_parent then
    raise exception 'only an existing parent can create another parent-role member';
  end if;

  return new;
end;
$function$;

drop trigger if exists members_insert_guard on public.members;
create trigger members_insert_guard
  before insert on public.members
  for each row
  execute function public.guard_members_insert();
