-- Call-style reminder alerts (CallKit/ConnectionService ringing screen,
-- triggered by a real VoIP push — not a normal notification) for assigned
-- chores and calendar events. Opt-in per item via alert_call, with a
-- configurable lead time (0/5/10 min before due).

alter table public.chore_tasks
  add column if not exists alert_call boolean not null default false,
  add column if not exists alert_call_lead_minutes integer not null default 10;

alter table public.calendar_events
  add column if not exists alert_call boolean not null default false,
  add column if not exists alert_call_lead_minutes integer not null default 10;

-- PushKit tokens are a distinct token type from the Expo/APNs push tokens
-- already stored in push_tokens/members.expo_push_token — VoIP pushes go
-- through a separate Apple certificate and a raw (non-Expo) delivery path.
create table if not exists public.voip_push_tokens (
  id          text primary key default gen_random_uuid()::text,
  member_id   text not null,
  family_id   uuid not null,
  token       text not null,
  platform    text not null check (platform in ('ios', 'android')),
  updated_at  timestamptz not null default now(),
  unique(token)
);

create index if not exists voip_push_tokens_member_idx on public.voip_push_tokens(member_id);

alter table public.voip_push_tokens enable row level security;

drop policy if exists "voip_push_tokens_select" on public.voip_push_tokens;
drop policy if exists "voip_push_tokens_upsert" on public.voip_push_tokens;
drop policy if exists "voip_push_tokens_update" on public.voip_push_tokens;
drop policy if exists "voip_push_tokens_delete" on public.voip_push_tokens;

create policy "voip_push_tokens_select" on public.voip_push_tokens for select
  using (family_id = public.current_user_family_id());
create policy "voip_push_tokens_upsert" on public.voip_push_tokens for insert
  with check (family_id = public.current_user_family_id());
create policy "voip_push_tokens_update" on public.voip_push_tokens for update
  using (family_id = public.current_user_family_id())
  with check (family_id = public.current_user_family_id());
create policy "voip_push_tokens_delete" on public.voip_push_tokens for delete
  using (family_id = public.current_user_family_id());

-- Firing log — dedupes so the 1-min sweep cron doesn't re-ring the same
-- item's lead-time window twice (mirrors send-appointment-reminder's
-- reminder_7d_sent-style boolean-per-window dedupe, generalized to one row
-- per (item, window) instead of fixed columns since lead time is now
-- user-configurable rather than a small fixed set).
create table if not exists public.call_reminder_log (
  id          text primary key default gen_random_uuid()::text,
  item_type   text not null check (item_type in ('chore', 'event')),
  item_id     text not null,
  fired_at    timestamptz not null default now(),
  unique(item_type, item_id)
);

alter table public.call_reminder_log enable row level security;

drop policy if exists "call_reminder_log_select" on public.call_reminder_log;
create policy "call_reminder_log_select" on public.call_reminder_log for select
  using (true);
-- Insert/delete only via service role (the sweeper edge function) — no
-- client-facing write policy needed.
