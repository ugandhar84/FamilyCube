-- Ride requests (category:'Ride' or rideRequired:true) now count as
-- sensitive events by default (isEventSensitive), so a sibling kid/teen no
-- longer sees another sibling's ride request on their Schedule tab's "All"
-- view unless a parent explicitly opts a specific event into sibling
-- sharing — the delegation path for "parent asks an older sibling to help
-- with a younger one's ride" (explicit user direction; previously any
-- sibling could see every other sibling's ride details with no opt-out).
alter table public.calendar_events
  add column if not exists shared_with_siblings boolean not null default false;
