-- One-time cleanup: soft-deletes the "Drop off/Add test schedule ... Jas
-- ... dance class" test events created during this session's kiosk/ride
-- QA work, so a fresh recurring ride can be created and tested cleanly
-- against the pickup-fork series fix. Soft delete only (deleted_at/
-- deleted_by), exactly what the app's own Delete button does — reversible
-- by clearing deleted_at back to null if needed.
update calendar_events
set deleted_at = now(), deleted_by = null
where deleted_at is null
  and (title ilike '%test schedule%' or title ilike '%dance class%' or title ilike '%drop off jas%' or title ilike '%drop jaswi%');
