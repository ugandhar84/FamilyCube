-- Recurring events (E5-E13 from docs/event_lifecycle_matrix.html) — the
-- Calendar had zero recurrence support: a weekly school class or recurring
-- activity had to be re-created by hand every single week. Follows the same
-- "materialized rows, rolling window" model chores already use for their own
-- recurrence, rather than a virtual-expansion model — one real row per
-- occurrence keeps every existing screen (Month grid, Week, Agenda, the
-- call-reminder sweeper, multi-member visibility filtering) working
-- unchanged, since each occurrence is just an ordinary calendar_events row.
--
-- series_id links every occurrence generated from the same recurring
-- event together (the first-created row's own id is reused as the
-- series_id anchor). recurrence_rule stores the pattern (frequency +
-- weekday selection) only on that anchor row — occurrence rows carry
-- series_id so they can be found/regenerated/bulk-edited, but do not
-- duplicate the rule itself.

alter table public.calendar_events
  add column if not exists series_id text,
  add column if not exists recurrence_rule jsonb,
  add column if not exists is_series_anchor boolean not null default false;

create index if not exists calendar_events_series_id_idx
  on public.calendar_events (series_id)
  where series_id is not null;
