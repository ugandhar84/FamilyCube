-- One-off data fix: a Medical appointment's free-text "Accompanied by"
-- field (HelperAssignmentSection.tsx) let a parent type their OWN name
-- instead of using the MemberPicker above it, leaving helper_id null while
-- helper_status was still written as 'pending'. That broke both
-- auto-confirm-on-self-assign and the "Confirm I'll do it" button (every
-- confirm/reassign RPC requires helper_id to find the row) [live-reported].
-- The form-side gap is fixed separately (HelperAssignmentSection.tsx /
-- EventFormModal.tsx now resolve a real member id on an exact name match);
-- this repairs the one specific event already stuck in that state.
-- calendar_events_update_guard requires an authenticated member session for
-- any sensitive-column change, which a migration run doesn't have —
-- disable it for this one statement, same as any other privileged
-- data-only fix.
alter table public.calendar_events disable trigger calendar_events_update_guard;

update public.calendar_events
  set helper_id = 'de318aa9-41d2-49f3-a622-ad8485218b1f', helper_status = 'confirmed'
  where id = 'ev1789698542938';

alter table public.calendar_events enable trigger calendar_events_update_guard;
