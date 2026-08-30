-- 2-way calendar sync: an inbound change (edited directly on Google/
-- Outlook) auto-applies to the local event to keep sync seamless — but
-- should still leave a visible trace so a family member looking at
-- Schedule can tell an event changed from outside the app, rather than
-- silently mutating with zero signal (user decision: "auto-apply +
-- visible marker", not silent, not requiring manual conflict review).
alter table public.calendar_events
  add column if not exists last_external_sync_at timestamptz,
  add column if not exists last_external_sync_provider text; -- 'google' | 'outlook'

comment on column public.calendar_events.last_external_sync_at is 'Set by calendar-webhook-google/outlook whenever an inbound change from that provider is applied to this event — powers a small "updated from Google/Outlook" indicator on the event card.';
comment on column public.calendar_events.last_external_sync_provider is 'Which provider last pushed a change into this event (''google''|''outlook'') — paired with last_external_sync_at.';
