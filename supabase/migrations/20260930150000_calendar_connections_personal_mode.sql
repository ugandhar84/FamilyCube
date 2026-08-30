-- A calendar connection now has two distinct purposes, not one universal
-- behavior: 'work' (FreeBusy-only conflict detection, already built —
-- calendar-freebusy-sync, no event content ever read/stored) and
-- 'personal' (full 2-way event sync — FamilyCube events pushed out, the
-- personal calendar's own events pulled in, real event details stored
-- both ways — the original design from earlier this session, reinstated
-- here scoped specifically to personal connections rather than applying
-- to every connection universally).
alter table public.calendar_connections
  add column if not exists purpose text not null default 'work' check (purpose in ('work', 'personal'));

-- A member can have at most one of EACH (provider, purpose) pair — e.g.
-- one Google 'work' connection AND a separate Google 'personal'
-- connection are both allowed, since they're genuinely different
-- accounts/calendars serving different jobs.
alter table public.calendar_connections drop constraint if exists calendar_connections_family_id_member_id_provider_key;
alter table public.calendar_connections add constraint calendar_connections_family_member_provider_purpose_key
  unique (family_id, member_id, provider, purpose);

comment on column public.calendar_connections.purpose is '''work'' = FreeBusy-only conflict detection (calendar-freebusy-sync), no event content stored. ''personal'' = full 2-way event sync (calendar-sync-push + calendar-webhook-*), real event details pushed/pulled both ways.';

-- Re-add the full-sync columns that were dropped during the pivot —
-- needed again now for 'personal'-purpose connections. A 'work'
-- connection simply never populates these.
alter table public.calendar_connections
  add column if not exists sync_token text,
  add column if not exists delta_link text,
  add column if not exists webhook_channel_id text,
  add column if not exists webhook_resource_id text,
  add column if not exists channel_expires_at timestamptz,
  add column if not exists channel_token text;

create index if not exists idx_calendar_connections_channel_expiry on public.calendar_connections(channel_expires_at) where status = 'active' and purpose = 'personal';

-- event_external_links — local <-> external event id mapping, needed
-- again for personal-purpose 2-way sync. Same shape/RLS as the original
-- pre-pivot design.
create table if not exists public.event_external_links (
  id                 uuid        primary key default gen_random_uuid(),
  event_id           text        not null references public.calendar_events(id) on delete cascade,
  connection_id      uuid        not null references public.calendar_connections(id) on delete cascade,
  external_event_id  text        not null,
  external_etag      text,
  last_pushed_at     timestamptz,
  last_pulled_at     timestamptz,
  created_at         timestamptz not null default now(),
  unique (connection_id, external_event_id),
  unique (connection_id, event_id)
);

create index if not exists idx_event_external_links_event on public.event_external_links(event_id);
create index if not exists idx_event_external_links_connection on public.event_external_links(connection_id);

alter table public.event_external_links enable row level security;
revoke all on public.event_external_links from authenticated, anon;

comment on table public.event_external_links is 'Local calendar_events row <-> external provider event id mapping for personal-purpose (full 2-way sync) connections only. Service-role-only.';

-- Re-add the visible "updated externally" marker columns on calendar_events
-- (dropped during the pivot) — needed again for personal-sync inbound webhooks.
alter table public.calendar_events
  add column if not exists last_external_sync_at timestamptz,
  add column if not exists last_external_sync_provider text;

comment on column public.calendar_events.last_external_sync_at is 'Set by calendar-webhook-google/outlook (personal-purpose connections only) whenever an inbound change is auto-applied — powers a small "updated from Google/Outlook" indicator on the event card.';

-- calendar_connections_public needs `purpose` so the client can tell its
-- work vs. personal connections apart in Settings — CREATE OR REPLACE
-- can't reorder/insert columns into an existing view, so drop first.
drop view if exists public.calendar_connections_public;
create view public.calendar_connections_public
with (security_invoker = true) as
  select id, family_id, member_id, provider, purpose, external_calendar_id,
         status, last_synced_at, last_error, connected_account_email,
         created_at
  from public.calendar_connections;

grant select on public.calendar_connections_public to authenticated;
