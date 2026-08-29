-- TEMP diagnostic infrastructure — call-reminder TTS repeat loop.
--
-- Two previous fix attempts (setActive(true) reassertion, then
-- AVAudioSessionModeSpokenAudio) were both confirmed live to NOT fix
-- "reminder speaks once then goes completely silent for the rest of the
-- call, which stays connected until manually hung up." A third fix now
-- ships alongside this table (plugins/withCallKeep.js was never patching
-- speechSynthesizer(_:didFinish:) — the actual repeat-continuation logic —
-- into the generated ios/FamilyCube/AppDelegate.swift at all, despite it
-- existing in the canonical source the whole time), plus real interruption
-- recovery (didCancel/AVAudioSession.interruptionNotification handling).
--
-- This table exists in case that fix is incomplete: AppDelegate.canonical.
-- swift's repeat loop now appends a timestamped breadcrumb at every
-- meaningful lifecycle point (answer, each speakReminder entry, each
-- didFinish/didCancel, each repeat-scheduling closure firing, call.hasEnded)
-- to UserDefaults, and lib/callAlert.ts ships that trace here on the next
-- app foreground after a reminder call — the user cannot connect their
-- device to Xcode/Console.app, so this is the only way to get real
-- evidence off of a live test call.
--
-- Purpose-built rather than reusing call_reminder_log's columns — this is
-- temporary diagnostic infrastructure (delete this table and everything
-- referencing it once the real root cause is confirmed fixed), not a
-- permanent feature, and a dedicated table keeps that cleanup trivial
-- (one DROP TABLE, no column surgery on a table other features depend on).
create table if not exists public.call_reminder_debug_trace (
  id          text primary key default gen_random_uuid()::text,
  item_type   text,
  item_id     text,
  due_at_iso  text,
  trace       text[] not null,
  created_at  timestamptz not null default now()
);

comment on table public.call_reminder_debug_trace is 'TEMP diagnostic table — native call-reminder TTS repeat-loop trace logs, shipped from the device after a test call. Safe to drop once the repeat-loop bug is confirmed fixed; see AppDelegate.canonical.swift''s callDebugTrace comment for the full story.';
comment on column public.call_reminder_debug_trace.item_type is 'chore | event — from the reminder that was answered, if the native side had it cached (may be null if the app was killed before caching completed).';
comment on column public.call_reminder_debug_trace.item_id is 'Matches call_reminder_log.item_id for the same reminder, when present — join manually if you need the row this call was for.';
comment on column public.call_reminder_debug_trace.trace is 'Ordered array of "<ISO8601 timestamp>  <event>" breadcrumb lines from AppDelegate.swift''s trace(_:) helper, oldest first.';

alter table public.call_reminder_debug_trace enable row level security;

drop policy if exists "call_reminder_debug_trace_select" on public.call_reminder_debug_trace;
create policy "call_reminder_debug_trace_select" on public.call_reminder_debug_trace for select
  using (true);

-- No family_id column to scope this on (this is a throwaway diagnostic
-- table, not a family-scoped feature) — gated on "any authenticated user"
-- instead of wide open, same spirit as call_reminder_log's service-role-
-- only write policy being relaxed here only because a temporary debug
-- table shipping from the client (not an edge function) needs a client-
-- writable policy at all.
drop policy if exists "call_reminder_debug_trace_insert" on public.call_reminder_debug_trace;
create policy "call_reminder_debug_trace_insert" on public.call_reminder_debug_trace for insert
  with check (auth.uid() is not null);
