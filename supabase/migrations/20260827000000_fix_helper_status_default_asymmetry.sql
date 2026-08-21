-- helper_status carried a stray DB-level DEFAULT 'pending' while its sibling
-- column driver_status (added in 20260817000001_calendar_events_driver.sql)
-- has never had one — both columns are treated identically by app code
-- (eventStore.ts's toRow() writes `ev.helperStatus ?? null` and
-- `ev.driverStatus ?? null` symmetrically; claimHelperSlot()'s
-- compare-and-swap claim uses `.is(dbStatusCol, null)` for BOTH roles to
-- detect an unclaimed slot). Any insert path that omits helper_status
-- (an edge function insert, a seed script, a raw INSERT) would silently get
-- 'pending' instead of NULL, permanently breaking claimHelperSlot's CAS for
-- that row — it would see the slot as already-claimed and the 0-row update
-- would look like "someone else won" forever. driver_status's no-default
-- behavior is the correct, original intent; removing helper_status's
-- default brings it back in line.
alter table public.calendar_events
  alter column helper_status drop default;
