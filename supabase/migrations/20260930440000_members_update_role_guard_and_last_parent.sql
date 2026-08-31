-- Real, serious gap found by direct QA trace of family setup & member
-- management: members_update's RLS policy is
--   (auth_user_id = auth.uid()) OR (family_id = current_user_family_id())
-- with no role check at all, and RLS can only allow/deny a whole row, not
-- individual columns. In practice this means ANY authenticated member of a
-- family — a kid's own session, not just a parent's — can UPDATE any
-- column on any OTHER member's row in that family, including role, pin,
-- coins, and deleted_at. Every parent-only gate on PIN reset, role
-- changes, and removal in the app's own screens is real and respected by
-- every screen, but it's screen-deep only: a session talking to the
-- database directly instead of through those screens isn't stopped by
-- anything.
--
-- RLS can't express "these specific columns need a role check, the rest
-- don't" — that needs a trigger comparing OLD vs NEW. This adds one, split
-- by column sensitivity:
--   - role / pin / deleted_at / auth_user_id / family_id on someone ELSE's
--     row: strictly parent-only. No legitimate RPC in this schema touches
--     these on another member's row outside the app's already-parent-gated
--     screens.
--   - coins / main_coins / gp_coins / xp on someone else's row: matches
--     award_coins()'s real authority model instead (is_approver(), which
--     includes temporary_approvers grants, not just role='parent' — plus a
--     grandparent is separately allowed for gp_coins specifically), since
--     award_coins legitimately credits a kid's wallet from a
--     non-parent-only set of callers.
--   - service_role (edge functions / crons) bypasses entirely, same
--     carve-out award_coins() itself already uses.
-- Editing your OWN row is always allowed, unchanged from today.
--
-- Same migration also closes a directly related gap: nothing anywhere
-- blocked a family from having zero parent-role members — reproduced live
-- (demoting every member of a 2-parent test family succeeded
-- unconditionally). A parentless family has no one left who can approve
-- anything or re-promote someone through the legitimate UI. Blocked here
-- at the same trigger, since it's the same "role changed" moment.
create or replace function public.guard_members_update()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_active_member_id text;
  v_caller_role text;
  v_caller_is_approver boolean;
  v_identity_changed boolean;
  v_wallet_changed boolean;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  v_active_member_id := public.resolve_active_member_id();

  if v_active_member_id is not null and v_active_member_id = old.id then
    -- Self-edit: always allowed, unchanged from today. Still subject to
    -- the last-parent guard below (a parent can self-demote just as
    -- easily as demoting someone else).
    null;
  else
    v_identity_changed :=
      old.role is distinct from new.role
      or old.pin is distinct from new.pin
      or old.deleted_at is distinct from new.deleted_at
      or old.auth_user_id is distinct from new.auth_user_id
      or old.family_id is distinct from new.family_id;

    v_wallet_changed :=
      old.coins is distinct from new.coins
      or old.main_coins is distinct from new.main_coins
      or old.gp_coins is distinct from new.gp_coins
      or old.xp is distinct from new.xp;

    if v_identity_changed then
      if v_active_member_id is null or not exists (
        select 1 from public.members where id = v_active_member_id and role = 'parent'
      ) then
        raise exception 'only a parent can change role/pin/deleted_at/auth_user_id/family_id on another member''s row';
      end if;
    end if;

    if v_wallet_changed then
      select role into v_caller_role from public.members where id = v_active_member_id;
      v_caller_is_approver := public.is_approver();
      if v_active_member_id is null or not (v_caller_is_approver or v_caller_role = 'grandparent') then
        raise exception 'caller lacks approval or grant authority to change coins/xp on another member''s row';
      end if;
    end if;
  end if;

  -- Last-parent guard: block a write that would leave the family with zero
  -- parent-role members, whether it's a role-change away from parent or a
  -- soft-delete (deleted_at set) of a parent.
  if old.role = 'parent' and old.family_id is not null
     and ((new.role is distinct from 'parent') or (new.deleted_at is not null and old.deleted_at is null))
  then
    if not exists (
      select 1 from public.members
      where family_id = old.family_id
        and role = 'parent'
        and deleted_at is null
        and id <> old.id
    ) then
      raise exception 'cannot remove the last parent from a family';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists members_update_guard on public.members;
create trigger members_update_guard
  before update on public.members
  for each row
  execute function public.guard_members_update();
