-- "Show on the email indicator that it is coming from where... we can
-- show alias name of that account" — the provider alone ('google') isn't
-- specific enough once someone can connect the SAME provider twice (a
-- work Gmail and a personal Gmail). Denormalize the connected account's
-- own email onto the event at sync time rather than requiring the client
-- to join through event_external_links -> calendar_connections just to
-- render a label.
alter table public.calendar_events
  add column if not exists last_external_sync_account text;

comment on column public.calendar_events.last_external_sync_account is 'The connected_account_email of whichever calendar_connections row last synced this event in (personal-purpose only) — paired with last_external_sync_provider/last_external_sync_at for a "from priya@gmail.com" style indicator.';
