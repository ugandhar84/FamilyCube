-- Targeted, one-time repair: Ugandhar (member de318aa9-41d2-49f3-a622-
-- ad8485218b1f) self-assigned as driver/helper on rides created before the
-- forkRideLegs/SmartTaskComposer self-check fixes landed (this session,
-- 2026-09-24) and got permanently stuck at driver_status/helper_status =
-- 'pending' with no way to auto-confirm. Self-assignment is always
-- confirmed immediately — see CLAUDE.md's Push/Call/Notification Rules #5.
--
-- Deliberately scoped to this ONE known member id rather than a broad
-- heuristic across all families — there is no reliable "who actually
-- assigned this" actor column on calendar_events to safely infer self-
-- assignment for other members after the fact without risking wrongly
-- auto-confirming someone else's genuine still-pending request.
-- calendar_events_update_guard (20260930460000) requires
-- resolve_active_member_id() to be non-null before driver_status/
-- helper_status can change — correct for normal app traffic (that's what
-- it exists to gate), but this is a one-time admin data repair with no
-- request-header session to resolve a member from. Its own service_role
-- exemption (auth.role() = 'service_role') doesn't fire in a plain
-- migration's connection context, so the trigger is disabled for just this
-- transaction instead — standard, narrowly-scoped pattern for an admin
-- backfill; re-enabled immediately after, unconditionally, even if the
-- updates below fail (transaction rollback restores it either way, but the
-- explicit re-enable makes the intent unambiguous to any future reader).
alter table public.calendar_events disable trigger calendar_events_update_guard;

update public.calendar_events
set driver_status = 'confirmed', updated_at = now(), updated_by = 'de318aa9-41d2-49f3-a622-ad8485218b1f'
where driver_status = 'pending'
  and driver_id = 'de318aa9-41d2-49f3-a622-ad8485218b1f';

update public.calendar_events
set helper_status = 'confirmed', updated_at = now(), updated_by = 'de318aa9-41d2-49f3-a622-ad8485218b1f'
where helper_status = 'pending'
  and helper_id = 'de318aa9-41d2-49f3-a622-ad8485218b1f';

alter table public.calendar_events enable trigger calendar_events_update_guard;
