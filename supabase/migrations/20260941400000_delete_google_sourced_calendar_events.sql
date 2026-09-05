-- Live-requested: "remove the already synced data from the google from
-- our DB" — clarified as local calendar_events rows that were PULLED IN
-- from Google (inbound sync), not events created natively in the app.
-- source_provider is the exact, immutable-once-stamped column for this
-- (20260931150000_add_immutable_source_provider.sql): 'app' for
-- FamilyCube-native, 'google'/'apple'/'outlook' for inbound-synced.
-- Explicit user choice: hard delete, not the normal soft-delete
-- (deleted_at) mechanism — permanent, no recovery.
delete from public.calendar_events where source_provider = 'google';
