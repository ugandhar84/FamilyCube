-- Real, serious gap found by direct user report: calendar_events' SELECT
-- policy only ever checked family_id — a Medical appointment, a Ride, a
-- privacy_level='private' event, or any other sensitive event was fully
-- readable by every family member's authenticated session, regardless of
-- role or sharing flags. The full/busy-block/hidden 3-tier visibility
-- logic verified correct in this session's QA trace
-- (canViewSensitiveEventDetail, store/eventStore.ts) was ONLY ever a
-- client-side presentation layer — never a real security boundary. A
-- modified or inspected client could read every private/Medical event in
-- the family outright.
--
-- This policy encodes the exact same rule canViewSensitiveEventDetail
-- already implements client-side, faithfully:
--   - An ordinary (non-sensitive) event stays visible to the whole
--     family, unchanged from today.
--   - A sensitive event (privacy_level='private', category='Medical' or
--     'Ride', or ride_required) is visible in full only to:
--       - any parent (always full, both legal guardians)
--       - the event's own subject (member_id or member_ids)
--       - the actual assigned driver/helper (matched by display name,
--         same as the client — these columns store names, not ids)
--       - a grandparent, but ONLY if shared_with_gp_for_care is set
--         (otherwise they get nothing at the row level here — the
--         client's own "busy-block" stripped placeholder still needs a
--         separate, narrower view/RPC to work with full RLS; this
--         migration closes the "read everything" hole first, the
--         busy-block-for-GP nuance is a smaller follow-up)
--       - a sibling kid/teen, but ONLY if shared_with_siblings is set
--
-- NOTE: this necessarily removes the GP "busy block" case's ability to
-- read even the stripped fields via a plain SELECT * — the client already
-- never renders those fields for a busy-block anyway, but a future pass
-- may want a dedicated view exposing only date/time/title:'Busy' for that
-- narrower case so a GP's calendar can still show a placeholder without
-- needing full-row access. Flagged, not built here, since it's a genuine
-- product/UX question (does a GP's app need a real placeholder row from
-- the server, or does the client already handle "no row = nothing shown"
-- acceptably for that specific case) rather than a security decision.
drop policy if exists "calendar_events_select" on public.calendar_events;

create policy "calendar_events_select" on public.calendar_events
for select
using (
  family_id = (current_user_family_id())::text
  and (
    -- Not sensitive at all — visible to everyone in the family, as before.
    not (
      privacy_level = 'private'
      or category = 'Medical'
      or category = 'Ride'
      or coalesce(ride_required, false)
    )
    -- Any parent always sees everything in their own family.
    or exists (
      select 1 from public.members
      where members.id = resolve_active_member_id() and members.role = 'parent'
    )
    -- The event's own subject.
    or member_id = resolve_active_member_id()
    or (member_ids is not null and member_ids ? resolve_active_member_id())
    -- The actual assigned driver/helper, matched by display name (these
    -- columns store names, not ids, same as the client-side check).
    or exists (
      select 1 from public.members
      where members.id = resolve_active_member_id()
        and (members.name = calendar_events.helper_name or members.name = calendar_events.driver_name)
    )
    -- A grandparent explicitly shared in for care.
    or (
      coalesce(shared_with_gp_for_care, false)
      and exists (
        select 1 from public.members
        where members.id = resolve_active_member_id() and members.role = 'grandparent'
      )
    )
    -- A sibling explicitly shared in.
    or coalesce(shared_with_siblings, false)
  )
);
