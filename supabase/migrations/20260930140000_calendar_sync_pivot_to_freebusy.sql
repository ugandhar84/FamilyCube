-- Pivot: 2-way full event sync (push/pull, stored event details, webhooks)
-- was the wrong shape for the real need. The actual goal is lighter and
-- more privacy-respecting: a parent connects their work calendar so
-- FamilyCube can detect SCHEDULING CONFLICTS against it, using only
-- busy/free time blocks (FreeBusy API) — no event titles/locations/notes
-- ever leave the external calendar or get stored here. Reverses the
-- event_external_links table and the per-domain sync_* toggle/webhook/
-- sync-token columns on calendar_connections from the abandoned full-sync
-- design (20260930100000/110000/130000).

drop table if exists public.event_external_links;

drop view if exists public.calendar_connections_public;

alter table public.calendar_connections
  drop column if exists sync_token,
  drop column if exists delta_link,
  drop column if exists webhook_channel_id,
  drop column if exists webhook_resource_id,
  drop column if exists channel_expires_at,
  drop column if exists channel_token,
  drop column if exists sync_schedule,
  drop column if exists sync_chores,
  drop column if exists sync_meals,
  drop column if exists sync_medications,
  drop column if exists sync_school,
  drop column if exists sync_grocery;

-- Recreate the client-safe view against the now-simplified column set.
create or replace view public.calendar_connections_public
with (security_invoker = true) as
  select id, family_id, member_id, provider, external_calendar_id,
         status, last_synced_at, last_error, connected_account_email,
         created_at
  from public.calendar_connections;

grant select on public.calendar_connections_public to authenticated;

comment on table public.calendar_connections is 'Per-member OAuth connection to Google/Outlook, used ONLY to fetch FreeBusy (busy/free time blocks, no event details) for schedule-conflict detection against a connected parent''s work calendar — not full 2-way event sync. Token columns are service-role-only, see calendar_connections_public.';

-- The visible-marker columns from the abandoned inbound-webhook design are
-- no longer written by anything (no webhooks exist) — drop them rather
-- than leave dead columns behind.
alter table public.calendar_events
  drop column if exists last_external_sync_at,
  drop column if exists last_external_sync_provider;

-- New: marks a calendar_events row as an AUTO-SYNCED busy block from a
-- connected external calendar (as opposed to a Work event a family member
-- typed in by hand) — lets the refresh function cleanly replace its own
-- stale rows on each sync without touching a manually-entered Work event
-- that happens to share the same category. ParentView.tsx's existing
-- conflict detection (cases C/D) needs zero changes — it already treats
-- ANY category:'Work' event as a work block, regardless of origin.
alter table public.calendar_events
  add column if not exists synced_from_connection_id uuid references public.calendar_connections(id) on delete cascade;

create index if not exists idx_calendar_events_synced_connection on public.calendar_events(synced_from_connection_id) where synced_from_connection_id is not null;

comment on column public.calendar_events.synced_from_connection_id is 'Set only on a Work-category event auto-created from a connected calendar''s FreeBusy block (calendar-freebusy-sync) — null for a manually-entered Work event. Lets a refresh replace exactly its own prior rows.';
