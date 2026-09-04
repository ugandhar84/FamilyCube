-- Live-reported: "Confirm I'll do it" failed with "Couldn't confirm —
-- please try again" on a recurring Ride series ("Drop Jaswi for her dance
-- class"). Root cause found in EventFormModal.tsx's submit(): the
-- auto-assign-to-other-parent convenience (a parent creates a Ride with
-- no explicit helper picked, and there's exactly one other parent it
-- could be) set helper_name to that parent's display name but never set
-- helper_id alongside it — confirm_event_assignment's legacy fallback
-- (20260930290000) requires helper_id = p_member_id to find the row at
-- all, so an auto-assigned ride like this one could NEVER be confirmed by
-- anyone. Fixed going forward in EventFormModal.tsx (helperIdOverride);
-- this migration repairs the rows already created that way.
--
-- Only backfills where the match is unambiguous: exactly one member in
-- the same family shares that helper_name. A family with two members of
-- the same display name (two "Grandma"s, say) is left untouched rather
-- than guessing wrong — those rows still show "Couldn't confirm" until
-- someone re-picks the helper explicitly from the edit form, which is a
-- rename/re-save on their part, not a data-loss risk.
update public.calendar_events ce
set helper_id = m.id
from (
  select family_id, name, min(id) as id, count(*) as name_count
  from public.members
  group by family_id, name
) m
where ce.helper_name is not null
  and ce.helper_id is null
  and ce.deleted_at is null
  and m.family_id = ce.family_id::uuid
  and m.name = ce.helper_name
  and m.name_count = 1;
