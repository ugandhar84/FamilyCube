-- Google Tasks has no syncToken concept (unlike Calendar) — its own
-- incremental mechanism is updatedMin, a plain "modified since this
-- timestamp" filter. Tracked per-connection so calendar-google-tasks-poll
-- only re-fetches what actually changed since the last successful poll.
alter table public.calendar_connections
  add column if not exists last_tasks_poll_at timestamptz;
