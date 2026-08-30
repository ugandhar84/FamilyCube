-- 2-way calendar sync (Google Calendar / Outlook via OAuth) — per-member
-- connection to an external calendar provider. Tokens are LONG-LIVED
-- CREDENTIALS: a refresh token leaking via an RLS bug or a client query
-- would grant standing access to someone's real Google/Outlook account, a
-- materially worse blast radius than any other secret this app stores.
-- The base table therefore grants NO select to the `authenticated` role at
-- all — only `service_role` (used exclusively inside edge functions) can
-- read/write token columns. Clients read a companion view
-- (calendar_connections_public) that excludes every token/secret column.
create table if not exists public.calendar_connections (
  id                   uuid        primary key default gen_random_uuid(),
  family_id            text        not null,
  member_id            text        not null references public.members(id) on delete cascade,
  provider             text        not null check (provider in ('google', 'outlook')),

  -- Service-role-only columns — never exposed via the public view below.
  access_token         text,
  refresh_token        text,
  token_expires_at     timestamptz,

  external_calendar_id text,       -- the specific calendar events are read/written to
  sync_token           text,       -- Google events.list syncToken (incremental sync cursor)
  delta_link           text,       -- Microsoft Graph delta query link (Outlook's sync_token equivalent)

  webhook_channel_id   text,       -- Google channel id / Outlook subscription id
  webhook_resource_id  text,       -- Google resourceId, needed to stop/renew a channel
  channel_expires_at   timestamptz,-- when the push channel/subscription needs renewal
  channel_token        text,       -- shared secret set at watch-registration time, verified on each inbound webhook

  status               text        not null default 'active' check (status in ('active', 'error', 'disconnected')),
  last_synced_at       timestamptz,
  last_error           text,

  -- Per-event-type sync toggles (Settings screen) — checked by both the
  -- outbound push function and inbound webhook's create-new-local-event path.
  sync_schedule        boolean not null default true,
  sync_chores          boolean not null default true,
  sync_meals           boolean not null default true,
  sync_medications     boolean not null default true,
  sync_school          boolean not null default true,
  sync_grocery         boolean not null default true,

  connected_account_email text,   -- display-only, shown in Settings ("Connected as x@gmail.com")
  created_at           timestamptz not null default now(),
  unique (family_id, member_id, provider)
);

create index if not exists idx_calendar_connections_family on public.calendar_connections(family_id);
create index if not exists idx_calendar_connections_member on public.calendar_connections(member_id);
create index if not exists idx_calendar_connections_channel_expiry on public.calendar_connections(channel_expires_at) where status = 'active';

alter table public.calendar_connections enable row level security;

-- No insert/update/delete policy for `authenticated` at all — every write
-- happens server-side via edge functions using the service-role client,
-- which bypasses RLS entirely. `authenticated` gets exactly one policy:
-- read access scoped to their own family, but ONLY through the public
-- view below (a plain `select * from calendar_connections` as an
-- authenticated user is allowed by this policy but still returns every
-- column including tokens — the view is what actually withholds them, by
-- simply not selecting those columns. Never grant broad table-level
-- select on the raw table to any client-facing role beyond this).
create policy "calendar_connections_family_select" on public.calendar_connections for select
  using (family_id = public.current_user_family_id()::text);

-- Client-safe view — every token/secret column excluded, columns clients
-- never need at all (sync_token/delta_link/webhook_*/channel_*) also
-- excluded since they're sync-engine internals, not user-facing state.
-- security_invoker means the view runs with the CALLER's own privileges,
-- so it still respects the RLS policy above (family-scoped), rather than
-- running as the view owner and bypassing it.
create or replace view public.calendar_connections_public
with (security_invoker = true) as
  select id, family_id, member_id, provider, external_calendar_id,
         status, last_synced_at, last_error, connected_account_email,
         sync_schedule, sync_chores, sync_meals, sync_medications, sync_school, sync_grocery,
         created_at
  from public.calendar_connections;

grant select on public.calendar_connections_public to authenticated;

-- Defense in depth: PostgREST/Supabase clients query tables by name over
-- the REST API using the `anon`/`authenticated` role's grants — revoke any
-- default table-level privilege on the base table for both roles so the
-- ONLY way to reach calendar_connections as a client is through the view
-- above, even though the RLS policy alone would otherwise permit a direct
-- (token-including) row read for the caller's own family.
revoke all on public.calendar_connections from authenticated, anon;

comment on table public.calendar_connections is 'Per-member OAuth connection to an external calendar provider (Google/Outlook) for 2-way sync. Token columns are service-role-only — see calendar_connections_public for the client-safe view.';
