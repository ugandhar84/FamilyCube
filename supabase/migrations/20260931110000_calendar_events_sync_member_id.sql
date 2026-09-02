-- Live-requested: the "synced from Google" badge should show which
-- FAMILY MEMBER's connection last touched an event (a real provider icon
-- + their initials, e.g. "UN" for Ugandhar) rather than a raw email
-- address, and should only be visible to parents (kids/teens don't care
-- which parent's calendar something came from). last_external_sync_account
-- (the connected account's email) has no reliable path back to a specific
-- FamilyCube member — two members could theoretically share an email
-- domain, and the client would need an extra lookup either way. Storing
-- the member id directly makes that resolution trivial and free of any
-- email-matching guesswork.
alter table public.calendar_events
  add column if not exists last_external_sync_member_id text references public.members(id);

comment on column public.calendar_events.last_external_sync_member_id is
  'The members.id of whichever calendar_connections row last synced this event in/out (personal-purpose only) — paired with last_external_sync_provider/last_external_sync_at, resolved client-side to that member''s initials for the "synced from X" badge.';
