-- Multi-family membership — a grandparent's PIN is kept in sync across
-- ALL of their family member rows (one PIN to remember, not one per
-- family — live product decision). familyStore.ts's setMemberPin already
-- writes the PIN to the row being changed via the normal client-side
-- update (covered by members_update's existing RLS: the actor either OWNS
-- that row, or is a parent in THAT row's family). The gap this closes:
-- when a PARENT resets the grandparent's PIN on their behalf, that
-- parent's own session has no RLS authority to ALSO write to the
-- grandparent's OTHER family row (a family the parent isn't a member of
-- at all) — the client-side sync attempt silently fails there, leaving
-- the two PINs out of sync again. This SECURITY DEFINER function performs
-- that cross-family half on the server, where it can legitimately act
-- regardless of who initiated the original change, but ONLY after
-- independently re-verifying the CALLER had real authority over the
-- ORIGINAL row being changed — never trusts the client's own claim of
-- "I already changed this member's PIN."
create or replace function public.sync_grandparent_pin_across_families(
  p_member_id text, p_new_pin text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_caller_id text;
  v_target record;
  v_authorized boolean;
begin
  v_caller_id := public.resolve_active_member_id();
  if v_caller_id is null then
    raise exception 'caller could not be resolved';
  end if;

  select id, family_id, role, auth_user_id into v_target
  from public.members where id = p_member_id;
  if v_target.id is null then
    raise exception 'member % not found', p_member_id;
  end if;

  -- Only ever syncs a GRANDPARENT's pin — a parent/kid/teen is
  -- single-family by definition and this function must never touch them.
  if v_target.role is distinct from 'senior' then
    raise exception 'sync_grandparent_pin_across_families only applies to grandparent members';
  end if;

  -- Re-derive authorization independently — never trust that the client
  -- already legitimately changed this row's PIN. Same rule
  -- members_update's own RLS already enforces for the ORIGINAL write:
  -- the caller either IS this member, or is a parent within THIS
  -- member's OWN family (the family being reset FROM, not the other one
  -- being synced TO).
  select
    (v_caller_id = p_member_id)
    or exists (
      select 1 from public.members
      where id = v_caller_id and family_id = v_target.family_id and role = 'parent'
    )
    into v_authorized;

  if not v_authorized then
    raise exception 'caller % is not authorized to change member %''s pin', v_caller_id, p_member_id;
  end if;

  -- Update every OTHER family row for this same real person — same
  -- auth_user_id, a different member row (a different family). A
  -- grandparent with no auth_user_id at all (never set up a real login of
  -- their own) has no other rows to find here regardless; this is a
  -- silent no-op for them, not an error.
  if v_target.auth_user_id is not null then
    update public.members
    set pin = p_new_pin
    where auth_user_id = v_target.auth_user_id
      and role = 'senior'
      and id != p_member_id;
  end if;
end;
$function$;
