-- Live-requested: backfill the new "confirm once, apply to future
-- occurrences" behavior (store/eventStore.ts's applySeriesConfirmation,
-- added this session) onto any EXISTING recurring series that already has
-- a confirmed driver/helper on one occurrence but not on its other future
-- occurrences — those existing series predate the new auto-apply logic,
-- which only fires going forward on a fresh confirmation action.
--
-- Scoped identically to the live logic itself: same series_id only (never
-- crosses into a linked pickup/drop-off counterpart series), future
-- occurrences only (date > current_date), and never overwrites an
-- occurrence that already has ITS OWN confirmed driver/helper.
--
-- Note: calendar_events was fully wiped earlier this session (explicit
-- user-confirmed hard delete), so this runs against whatever real events
-- exist AT THE TIME this migration is applied, not against the deleted
-- historical data — if no series-with-confirmed-driver existed at that
-- moment, both updates below are simple no-ops.

-- calendar_events_update_guard (20260930460000) raises "no authenticated
-- member session" for any write touching driver_name/driver_status/
-- helper_name/helper_status etc. outside a real PostgREST request (it
-- resolves the caller from an x-active-member-id request header, which
-- doesn't exist in a migration's direct psql connection, and this
-- connection's auth.role() isn't 'service_role' either, so the trigger's
-- own service_role bypass doesn't apply). This is exactly the sensitive-
-- column set this one-off admin backfill needs to write — safe to disable
-- the trigger for the scope of this migration only (re-enabled
-- immediately after) rather than weakening the guard itself, which stays
-- fully in effect for every real app request.
alter table public.calendar_events disable trigger calendar_events_update_guard;

-- Driver-confirmed leg (Ride/rideRequired categories use driver_name/driver_status).
with confirmed_driver_series as (
  select distinct series_id, driver_name, driver_id
  from public.calendar_events
  where series_id is not null
    and driver_status = 'confirmed'
    and deleted_at is null
)
update public.calendar_events ce
set driver_name = cds.driver_name,
    driver_id = cds.driver_id,
    driver_status = 'confirmed',
    ride_required = true
from confirmed_driver_series cds
where ce.series_id = cds.series_id
  and ce.date > current_date::text
  and coalesce(ce.driver_status, '') <> 'confirmed'
  and ce.deleted_at is null;

-- Helper-confirmed leg (Medical/Sports/Study use helper_name/helper_status).
with confirmed_helper_series as (
  select distinct series_id, helper_name, helper_id
  from public.calendar_events
  where series_id is not null
    and helper_status = 'confirmed'
    and deleted_at is null
)
update public.calendar_events ce
set helper_name = chs.helper_name,
    helper_id = chs.helper_id,
    helper_status = 'confirmed'
from confirmed_helper_series chs
where ce.series_id = chs.series_id
  and ce.date > current_date::text
  and coalesce(ce.helper_status, '') <> 'confirmed'
  and ce.deleted_at is null;

alter table public.calendar_events enable trigger calendar_events_update_guard;
