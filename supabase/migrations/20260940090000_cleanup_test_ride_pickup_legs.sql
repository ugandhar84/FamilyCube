-- Follow-up to 20260940080000: that cleanup matched the DROP-OFF leg's
-- title text ('test schedule'/'dance class'/'drop off jas'/'drop jaswi')
-- and soft-deleted it — but forkRideLegs.ts links each leg to its
-- opposite via linked_leg_id, and the PICKUP leg (titled "<original
-- title> — Pickup", which doesn't itself contain any of those matched
-- phrases) was left untouched, still visible (live-reported: "i still
-- see data for pickup legs"). This pass instead follows linked_leg_id
-- from every event ALREADY soft-deleted by that migration, so it
-- precisely catches this test data's actual pickup legs (or any other
-- linked opposite leg) rather than guessing at title text. Soft delete
-- only — reversible by clearing deleted_at back to null.
update calendar_events
set deleted_at = now(), deleted_by = null
where deleted_at is null
  and id in (
    select linked_leg_id from calendar_events
    where deleted_at is not null
      and linked_leg_id is not null
      and (title ilike '%test schedule%'
        or title ilike '%dance class%'
        or title ilike '%drop off jas%'
        or title ilike '%drop jaswi%')
  );
