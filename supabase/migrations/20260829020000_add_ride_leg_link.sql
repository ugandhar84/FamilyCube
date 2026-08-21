-- A both-ways ride request forks into 2 fully independent calendar_events
-- rows (Drop-off leg + Pickup leg, see rideLegs.ts's forkRideLegs) with no
-- field linking them beyond a title suffix — every calendar surface
-- (Month/Week/Agenda/Day, and any role who wasn't around when the fork
-- happened) renders them as two unrelated cards with no indication a
-- companion leg exists elsewhere (QA sweep UI pass, High Finding #4).
-- linked_leg_id points each leg at the other's id — nullable, only ever
-- set by forkRideLegs at fork time.
alter table public.calendar_events
  add column if not exists linked_leg_id text;

create index if not exists calendar_events_linked_leg_idx
  on public.calendar_events (linked_leg_id)
  where linked_leg_id is not null;
