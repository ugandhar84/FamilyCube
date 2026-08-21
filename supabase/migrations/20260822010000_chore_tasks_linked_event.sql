-- Spec 8.2 — a quest/chore can optionally be tied to a calendar event it
-- logistically supports (e.g. "Pack for the trip" quest linked to the
-- "Family Trip" event). Display-only association: no cascade/bidirectional
-- sync, just a pointer the quest card can resolve the event's title from.
alter table public.chore_tasks
  add column if not exists linked_event_id text
    references public.calendar_events(id) on delete set null;

comment on column public.chore_tasks.linked_event_id is
  'Optional calendar_events.id this quest is logistically tied to (spec 8.2). Nullable, display-only — no cascading behavior.';
