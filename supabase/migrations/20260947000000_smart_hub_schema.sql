-- Smart Hub — connect smart-home devices (starting with thermostats) and
-- control their full programs/schedules, plus per-device filter-change and
-- general-maintenance reminders. Parent-only feature end to end (RLS below
-- restricts every write, and read, to a member whose role is 'parent') —
-- explicitly requested: "Only parents feature so accommodate accordingly".
--
-- Device-type-extensible from day one (user: "I'm going to add few more
-- smart devices so plan accordingly") — smart_devices.device_type and
-- smart_device_accounts.vendor are both free-text, not enums, so a new
-- vendor/device type is a data change, not a schema migration.
--
-- Built initially against a MOCK vendor adapter (see
-- supabase/functions/_shared/smartHub/README.md and mockAdapter.ts) — no
-- real vendor OAuth credentials exist yet. account/device rows created by
-- the mock flow are indistinguishable in shape from a real vendor's, so
-- swapping in a real adapter later needs no schema change.

-- ── smart_device_accounts — one row per connected vendor account ───────────
create table if not exists public.smart_device_accounts (
  id                text primary key default gen_random_uuid()::text,
  family_id         text not null,
  vendor            text not null, -- 'mock' | 'honeywell' | 'ecobee' | ... (free text, not enum — see header)
  connected_by      text not null references public.members(id) on delete set null,
  -- Encrypted at rest via the same per-family/device envelope
  -- lib/locationCrypto.ts already uses for other sensitive text columns
  -- (chat, location address) — never store raw OAuth tokens in plaintext.
  access_token_enc  text,
  refresh_token_enc text,
  token_expires_at  timestamptz,
  -- Vendor-specific account identifier (email, account id) — NOT a
  -- password; nothing in this schema ever stores a raw credential.
  vendor_account_label text,
  status            text not null default 'connected'
    check (status in ('connected', 'expired', 'revoked', 'error')),
  last_error        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists smart_device_accounts_family_idx on public.smart_device_accounts(family_id);

comment on table public.smart_device_accounts is
  'One row per connected smart-home vendor account. Tokens are encrypted client-side before insert (same envelope pattern as lib/locationCrypto.ts) — this table never holds a raw password.';

alter table public.smart_device_accounts enable row level security;

-- Parent-only, own-family-only, on every operation — a kid/teen has zero
-- visibility into connected accounts or tokens, matching "Only parents
-- feature so accommodate accordingly".
create policy "smart_device_accounts parent read"
  on public.smart_device_accounts for select
  using (
    family_id = public.current_user_family_id()::text
    and exists (
      select 1 from public.members m
      where m.id = public.resolve_active_member_id() and m.role = 'parent'
    )
  );

-- All writes go through SECURITY DEFINER edge-function-invoked RPCs (same
-- discipline as game_sessions/store_locations) so token encryption/vendor
-- validation can't be bypassed by a direct client .insert()/.update().
revoke insert, update, delete on public.smart_device_accounts from authenticated, anon;
grant select on public.smart_device_accounts to authenticated;

-- ── smart_devices — one row per physical device under an account ───────────
create table if not exists public.smart_devices (
  id                text primary key default gen_random_uuid()::text,
  account_id        text not null references public.smart_device_accounts(id) on delete cascade,
  family_id         text not null,
  vendor_device_id  text not null, -- the device's own id on the vendor's side
  device_type       text not null default 'thermostat', -- extensible — see header
  display_name      text not null,
  -- Latest known state snapshot, vendor-normalized shape:
  -- { mode, currentTemp, targetTempHeat, targetTempCool, humidity, ... }
  -- Never the vendor's raw payload verbatim — the adapter interface
  -- (see smartHubAdapter.ts) normalizes every vendor into one shape so the
  -- UI/edge functions never branch on vendor.
  last_state        jsonb not null default '{}'::jsonb,
  last_synced_at     timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (account_id, vendor_device_id)
);

create index if not exists smart_devices_family_idx on public.smart_devices(family_id);
create index if not exists smart_devices_account_idx on public.smart_devices(account_id);

comment on table public.smart_devices is
  'One row per physical smart device (thermostat, etc.) under a connected account. last_state is always vendor-normalized — see the adapter interface, never a raw vendor payload.';

alter table public.smart_devices enable row level security;

create policy "smart_devices parent read"
  on public.smart_devices for select
  using (
    family_id = public.current_user_family_id()::text
    and exists (
      select 1 from public.members m
      where m.id = public.resolve_active_member_id() and m.role = 'parent'
    )
  );

revoke insert, update, delete on public.smart_devices from authenticated, anon;
grant select on public.smart_devices to authenticated;

-- ── smart_device_programs — normalized schedule/program per device ─────────
create table if not exists public.smart_device_programs (
  id           text primary key default gen_random_uuid()::text,
  device_id    text not null references public.smart_devices(id) on delete cascade,
  family_id    text not null,
  -- Vendor-normalized schedule shape (NOT vendor-raw):
  -- { periods: [{ id, name, days: ['mon',...], startTime: 'HH:MM',
  --   endTime: 'HH:MM', targetTempHeat, targetTempCool, fanMode }],
  --   holds: [{ type: 'temporary'|'until_next_period'|'indefinite'|'vacation',
  --   targetTempHeat, targetTempCool, startsAt, endsAt }] }
  -- One row per device (not one per period) — the whole program is
  -- replaced atomically on every edit, matching how a thermostat's own
  -- program is a single coherent schedule, not independently addressable
  -- rows; a partial update mid-week (only some periods changed) still
  -- writes the complete resulting program, same discipline
  -- game_sessions.board_state's own comment documents for its JSON blob.
  program      jsonb not null default '{"periods":[],"holds":[]}'::jsonb,
  synced_at    timestamptz,
  updated_by   text references public.members(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (device_id)
);

create index if not exists smart_device_programs_family_idx on public.smart_device_programs(family_id);

comment on table public.smart_device_programs is
  'One row per device holding its full normalized schedule/program — replaced atomically on every edit, not per-period rows.';

alter table public.smart_device_programs enable row level security;

create policy "smart_device_programs parent read"
  on public.smart_device_programs for select
  using (
    family_id = public.current_user_family_id()::text
    and exists (
      select 1 from public.members m
      where m.id = public.resolve_active_member_id() and m.role = 'parent'
    )
  );

revoke insert, update, delete on public.smart_device_programs from authenticated, anon;
grant select on public.smart_device_programs to authenticated;

-- ── smart_device_filter_tracking — vendor runtime data OR manual interval ──
create table if not exists public.smart_device_filter_tracking (
  id                  text primary key default gen_random_uuid()::text,
  device_id           text not null references public.smart_devices(id) on delete cascade,
  family_id           text not null,
  -- 'vendor' when the connected device reports real filter-life/runtime
  -- data (used to compute next_due_date automatically); 'manual' when the
  -- parent configured their own reminder interval instead. Per the user's
  -- own explicit decision: "Both — use vendor data when available, fall
  -- back to a manual interval."
  source              text not null default 'manual' check (source in ('vendor', 'manual')),
  manual_interval_days integer, -- only meaningful when source = 'manual'
  last_changed_date   date,
  next_due_date       date,
  -- Raw vendor runtime signal when source = 'vendor' (e.g. Ecobee's own
  -- filter-life-remaining percentage/hours) — kept for display/debugging,
  -- next_due_date above is still the one field every reminder/notification
  -- path reads, regardless of source.
  vendor_runtime_data jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (device_id)
);

create index if not exists smart_device_filter_tracking_family_idx on public.smart_device_filter_tracking(family_id);
create index if not exists smart_device_filter_tracking_due_idx on public.smart_device_filter_tracking(next_due_date) where next_due_date is not null;

comment on table public.smart_device_filter_tracking is
  'Filter-change tracking per device — vendor-reported runtime data when available, else a parent-configured manual interval. See smart_device_maintenance_reminders for GENERAL (non-filter) maintenance, a deliberately separate concept.';

alter table public.smart_device_filter_tracking enable row level security;

create policy "smart_device_filter_tracking parent read"
  on public.smart_device_filter_tracking for select
  using (
    family_id = public.current_user_family_id()::text
    and exists (
      select 1 from public.members m
      where m.id = public.resolve_active_member_id() and m.role = 'parent'
    )
  );

revoke insert, update, delete on public.smart_device_filter_tracking from authenticated, anon;
grant select on public.smart_device_filter_tracking to authenticated;

-- ── smart_device_maintenance_reminders — GENERAL maintenance, always manual ─
-- Deliberately separate from smart_device_filter_tracking — user's own
-- explicit follow-up: "Make sure maintenance reminders also needed for
-- that particular device if any - it's manual entry." No vendor API
-- reports "needs annual service" or "coil needs cleaning" — this is
-- ALWAYS a manual parent-authored reminder, one-off or recurring, scoped
-- per device (e.g. "Annual HVAC service", "Replace UV bulb", "Clean
-- condenser coils").
create table if not exists public.smart_device_maintenance_reminders (
  id             text primary key default gen_random_uuid()::text,
  device_id      text not null references public.smart_devices(id) on delete cascade,
  family_id      text not null,
  title          text not null,
  notes          text,
  due_date       date not null,
  -- null = one-off reminder; otherwise recur every N days from due_date
  -- once completed (e.g. 365 for "Annual HVAC service").
  recur_every_days integer,
  completed_at   timestamptz,
  created_by     text not null references public.members(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists smart_device_maintenance_reminders_family_idx on public.smart_device_maintenance_reminders(family_id);
create index if not exists smart_device_maintenance_reminders_due_idx on public.smart_device_maintenance_reminders(due_date) where completed_at is null;

comment on table public.smart_device_maintenance_reminders is
  'General, always-manual-entry maintenance reminders per device (annual service, coil cleaning, etc.) — distinct from smart_device_filter_tracking, which is specifically the filter-change case and can be vendor-sourced.';

alter table public.smart_device_maintenance_reminders enable row level security;

create policy "smart_device_maintenance_reminders parent read"
  on public.smart_device_maintenance_reminders for select
  using (
    family_id = public.current_user_family_id()::text
    and exists (
      select 1 from public.members m
      where m.id = public.resolve_active_member_id() and m.role = 'parent'
    )
  );

-- Maintenance reminders are simple manual CRUD with no cross-row
-- invariants to protect (unlike token storage or program schedules), so
-- direct client writes are safe here — still parent-gated and
-- own-family-scoped by the with-check clauses below, same as the read
-- policy above.
create policy "smart_device_maintenance_reminders parent insert"
  on public.smart_device_maintenance_reminders for insert
  with check (
    family_id = public.current_user_family_id()::text
    and created_by = public.resolve_active_member_id()
    and exists (
      select 1 from public.members m
      where m.id = public.resolve_active_member_id() and m.role = 'parent'
    )
  );

create policy "smart_device_maintenance_reminders parent update"
  on public.smart_device_maintenance_reminders for update
  using (
    family_id = public.current_user_family_id()::text
    and exists (
      select 1 from public.members m
      where m.id = public.resolve_active_member_id() and m.role = 'parent'
    )
  )
  with check (family_id = public.current_user_family_id()::text);

create policy "smart_device_maintenance_reminders parent delete"
  on public.smart_device_maintenance_reminders for delete
  using (
    family_id = public.current_user_family_id()::text
    and exists (
      select 1 from public.members m
      where m.id = public.resolve_active_member_id() and m.role = 'parent'
    )
  );

grant select, insert, update, delete on public.smart_device_maintenance_reminders to authenticated;
