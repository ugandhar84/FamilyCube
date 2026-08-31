-- Logged QA gap, directly extending the "parents don't need to choose
-- private" fix shipped earlier this session to the other half of the same
-- principle: a kid or teen's own personal event (e.g. "Study with
-- friends") had no default privacy at all — fully visible to every
-- sibling and the whole family unless a parent or the kid/teen explicitly
-- flagged it private, Medical, or Ride. Only events already caught by
-- those three explicit triggers got any privacy treatment; an ordinary,
-- unflagged personal plan belonging to a kid/teen did not.
--
-- Scoped narrowly: only a SINGLE-subject event (member_id set, member_ids
-- empty/null — not a multi-person shared family event, which is
-- inherently visible to everyone already on it) whose subject is a
-- kid/teen-role member is now treated as sensitive by default, same
-- carve-outs as everything else already sensitive: the subject themselves
-- always sees it in full, a parent always does, the named
-- driver/helper always does, and it can still be explicitly shared with
-- siblings via the existing shared_with_siblings flag.
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
      or (
        member_id is not null
        and (member_ids is null or member_ids = '[]'::jsonb)
        and exists (
          select 1 from public.members
          where members.id = calendar_events.member_id and members.role in ('child', 'kid', 'teenager')
        )
      )
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
