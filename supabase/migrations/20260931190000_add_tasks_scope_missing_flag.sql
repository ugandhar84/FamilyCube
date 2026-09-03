-- calendar-google-tasks-poll's missing-tasks.readonly-scope case (a Google
-- connection made before this scope was added) is deliberately non-fatal —
-- it never flips the whole connection to status='error', since Calendar
-- sync for the same connection is unaffected and still works fine. That
-- left this failure completely invisible: it just fails forever with only
-- a server-side console.warn, no signal the user could ever see or act on
-- (live-reported: "I added a task and it didn't show up in chores").
alter table public.calendar_connections
  add column if not exists tasks_scope_missing boolean not null default false;

comment on column public.calendar_connections.tasks_scope_missing is
  'Set true by calendar-google-tasks-poll when a 403 shows the tasks.readonly scope is missing (a connection made before this scope existed) — cleared back to false the next time a poll succeeds. Surfaced in CalendarSyncScreen as a distinct "reconnect to sync Google Tasks too" hint, separate from the full connection-error state.';
