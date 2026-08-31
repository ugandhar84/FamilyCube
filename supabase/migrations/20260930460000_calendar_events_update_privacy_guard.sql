-- Real gap found by the deeper P2P schedule/calendar QA trace: this
-- session's calendar_events_select policy (migration 20260930410000) added
-- real privacy gating for SELECT, but calendar_events_update/_delete were
-- never touched — both are still just `family_id = current_user_family_id()`
-- with no role/subject check at all. Every legitimate event-assignment
-- flow (confirm/decline/reassign/claim/passenger add-remove) already runs
-- through SECURITY DEFINER RPCs with their own identity checks, so they
-- bypass RLS's UPDATE policy entirely and are UNAFFECTED by tightening it.
-- What the open UPDATE policy actually exposes is the plain direct
-- `.update()` path (store/eventStore.ts's updateEvent/updateEventScoped) —
-- any family member's session, kid included, could write ANY column on
-- ANY event via that path, including privacy_level/shared_with_siblings/
-- shared_with_gp_for_care/driver_name/helper_name. Concretely, this let a
-- kid's own session flip shared_with_siblings=true on their sibling's
-- private Medical event to unlock it via the SELECT policy's own
-- sharing-flag carve-out — using the UPDATE hole to defeat the SELECT
-- privacy fix that was just shipped. Same shape as the members-table gap
-- already fixed this session (migration 20260930440000).
--
-- Fix: a trigger, not a broader RLS predicate (RLS can't express
-- per-column rules) — self-edits and ordinary fields (title/date/time/
-- notes/location/etc.) stay exactly as open as before; only a specific
-- sensitive-column set now requires the caller to be a parent OR the
-- event's current named driver/helper (matched the same way the SELECT
-- policy already matches them, by name).
create or replace function public.guard_calendar_events_update()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_active_member_id text;
  v_caller_is_parent boolean;
  v_caller_is_assignee boolean;
  v_sensitive_changed boolean;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  v_active_member_id := public.resolve_active_member_id();

  v_sensitive_changed :=
    old.privacy_level is distinct from new.privacy_level
    or old.shared_with_siblings is distinct from new.shared_with_siblings
    or old.shared_with_gp_for_care is distinct from new.shared_with_gp_for_care
    or old.driver_name is distinct from new.driver_name
    or old.helper_name is distinct from new.helper_name
    or old.driver_status is distinct from new.driver_status
    or old.helper_status is distinct from new.helper_status
    or old.member_id is distinct from new.member_id
    or old.member_ids is distinct from new.member_ids
    or old.family_id is distinct from new.family_id;

  if v_sensitive_changed then
    if v_active_member_id is null then
      raise exception 'no authenticated member session';
    end if;

    select exists (
      select 1 from public.members
      where id = v_active_member_id and role = 'parent'
    ) into v_caller_is_parent;

    select exists (
      select 1 from public.members
      where id = v_active_member_id
        and (name = old.helper_name or name = old.driver_name or name = new.helper_name or name = new.driver_name)
    ) into v_caller_is_assignee;

    if not (v_caller_is_parent or v_caller_is_assignee) then
      raise exception 'only a parent or the event''s assigned driver/helper can change privacy or assignment fields on this event';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists calendar_events_update_guard on public.calendar_events;
create trigger calendar_events_update_guard
  before update on public.calendar_events
  for each row
  execute function public.guard_calendar_events_update();
