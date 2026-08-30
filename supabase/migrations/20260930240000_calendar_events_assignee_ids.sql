-- Real member-id columns for driver/helper assignment, alongside the
-- existing driver_name/helper display-name text columns.
--
-- Root cause of a live-reproduced bug: classifyEventUrgency.ts (the Hub's
-- "is this event assigned to ME" check) compares by NAME STRING
-- (`a.name === viewer.name`) because no id column existed to compare
-- against instead — user explicitly flagged this as wrong ("None should
-- match on name strings - it is always a uuid"). A name-string compare is
-- fragile (breaks on a rename, two members sharing a first name, or any
-- drift between what's stored and the member's current display name) and
-- was never the intended design — event_participants.member_id already
-- proves the real design intent is id-based; calendar_events' legacy
-- driver_name/helper fields simply never got an id sibling when they
-- were first added.
--
-- Backfilled from existing data (best-effort name match against members
-- in the same family) so already-assigned events don't lose their
-- assignee id on this migration.
alter table public.calendar_events
  add column if not exists driver_id text references public.members(id) on delete set null,
  add column if not exists helper_id text references public.members(id) on delete set null;

update public.calendar_events ce
set driver_id = m.id
from public.members m
where ce.driver_id is null
  and ce.driver_name is not null
  and m.family_id::text = ce.family_id
  and m.name = ce.driver_name;

update public.calendar_events ce
set helper_id = m.id
from public.members m
where ce.helper_id is null
  and ce.helper_name is not null
  and m.family_id::text = ce.family_id
  and m.name = ce.helper_name;

comment on column public.calendar_events.driver_id is 'Real member id for the driver assignment — compare against this, not driver_name, for "is this assigned to me" checks. driver_name stays as the display string (also covers an external non-member driver with no id).';
comment on column public.calendar_events.helper_id is 'Real member id for the helper assignment — compare against this, not helper_name, for "is this assigned to me" checks. helper_name stays as the display string (also covers an external non-member helper with no id).';
