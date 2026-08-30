-- Maps a local calendar_events row to its corresponding event on an
-- external provider, per connection. Separate table rather than columns
-- on calendar_events (already a wide, heavily-audited table) because one
-- local event can link to MULTIPLE connections at once (a member with
-- both Google and Outlook connected simultaneously) — a single set of
-- provider columns on calendar_events couldn't represent that, and would
-- need duplicating for every future provider added.
create table if not exists public.event_external_links (
  id                 uuid        primary key default gen_random_uuid(),
  event_id           text        not null references public.calendar_events(id) on delete cascade,
  connection_id      uuid        not null references public.calendar_connections(id) on delete cascade,
  external_event_id  text        not null,
  external_etag      text,       -- Google 'etag' / Outlook '@odata.etag' — cheap change detection before a full field diff
  last_pushed_at     timestamptz,
  last_pulled_at     timestamptz,
  created_at         timestamptz not null default now(),
  unique (connection_id, external_event_id),
  unique (connection_id, event_id)
);

create index if not exists idx_event_external_links_event on public.event_external_links(event_id);
create index if not exists idx_event_external_links_connection on public.event_external_links(connection_id);

alter table public.event_external_links enable row level security;

-- Same treatment as calendar_connections: clients never need this table
-- directly (sync status/history is a sync-engine internal, not something
-- rendered in the UI today), so no select/insert/update/delete grant to
-- authenticated at all — service_role (edge functions) is the only writer
-- and reader.
revoke all on public.event_external_links from authenticated, anon;

comment on table public.event_external_links is 'Local calendar_events row <-> external provider event id mapping, one row per (event, connection) pair. Service-role-only — no client access needed.';
