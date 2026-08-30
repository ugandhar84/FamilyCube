-- Google Tasks -> Chores sync (inbound only, Personal Google connections).
-- A Google Task (My Tasks list, created e.g. via the Calendar app's own
-- "+" -> Task flow) has a completely separate API from Calendar events —
-- tasks.googleapis.com, not calendar.googleapis.com — so it needs its own
-- id-mapping table, mirroring event_external_links' shape/purpose exactly
-- but for chore_tasks instead of calendar_events.
create table if not exists public.google_task_links (
  id                  uuid primary key default gen_random_uuid(),
  connection_id       uuid not null references public.calendar_connections(id) on delete cascade,
  chore_id            text not null references public.chore_tasks(id) on delete cascade,
  external_task_id    text not null,
  external_list_id    text not null default '@default',
  last_pulled_at      timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  unique (connection_id, external_task_id),
  unique (connection_id, chore_id)
);

create index if not exists idx_google_task_links_connection on public.google_task_links(connection_id);
create index if not exists idx_google_task_links_chore on public.google_task_links(chore_id);

alter table public.google_task_links enable row level security;

-- Same "read your own family's rows, no client-facing writes at all"
-- posture as event_external_links — every write happens server-side via
-- the service-role client in calendar-google-tasks-poll.
create policy "google_task_links_family_select" on public.google_task_links for select
  using (
    connection_id in (
      select id from public.calendar_connections where family_id = public.current_user_family_id()::text
    )
  );

revoke all on public.google_task_links from anon;
grant select on public.google_task_links to authenticated;
