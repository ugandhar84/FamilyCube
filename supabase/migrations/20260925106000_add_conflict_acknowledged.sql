-- Lets a parent dismiss a scheduling-conflict alert on the Hub without
-- reassigning anything — e.g. the same parent doing two nearby drop-offs
-- at the same time isn't actually a problem, it's just flagged by the
-- generic <30-minute-overlap heuristic in ParentView.tsx's conflict
-- detection. Distinct from the pre-existing `conflict` column (a
-- separate, unrelated source of truth this app doesn't currently write
-- to from the client) — this is specifically "a parent looked at this
-- conflict and confirmed it's fine," scoped per event.
alter table public.calendar_events
  add column if not exists conflict_acknowledged boolean not null default false;
