-- Fix: CalendarSyncScreen.tsx's load() selects `tasks_scope_missing` from
-- calendar_connections_public, but that column was added to the base
-- table (20260931190000_add_tasks_scope_missing_flag.sql) AFTER this view
-- was already created (20260930190000_calendar_connections_grant_select_fix.sql)
-- — a Postgres view's column list is fixed at CREATE VIEW time and does
-- NOT pick up new base-table columns automatically. No migration ever
-- recreated the view to add it, so every single select against this view
-- has been failing with "column tasks_scope_missing does not exist" since
-- that column was introduced — CalendarSyncScreen's load() hit the error
-- branch on every call and silently set connections to [], showing every
-- provider as "Not connected" regardless of real state (live-reported: a
-- Google connection made days ago, and even reconnecting successfully
-- right now, both still show "Not connected" — the OAuth exchange itself
-- was working fine; only the read-back that renders the screen was
-- broken).
drop view if exists public.calendar_connections_public;

create view public.calendar_connections_public as
  select id, family_id, member_id, provider, purpose, external_calendar_id,
         status, last_synced_at, last_error, connected_account_email,
         tasks_scope_missing, created_at
  from public.calendar_connections
  where family_id = public.current_user_family_id()::text;

grant select on public.calendar_connections_public to authenticated;
