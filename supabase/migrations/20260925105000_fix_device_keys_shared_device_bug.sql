-- Real bug found live (per-device E2E location decrypt failing for every
-- member, including the viewer's own row — "[🔒 encrypted — wrong key or
-- corrupted]" on FindFam for all 3 live members). Root cause: device_keys
-- was unique on (family_id, device_id) only, with member_id as a plain
-- overwritable column. On a SHARED device — the core Family Cube pattern:
-- a parent's phone used by PIN-switching kids/seniors, not one-auth-
-- account-per-device — every ensureDeviceRegistered() call re-stamps
-- member_id to whichever member is active THIS session, silently
-- orphaning every other member's (and often the device owner's own,
-- post-switch) wrapped keys on that same physical device. This is a data
-- MODEL bug, not a decrypt-logic bug — the fix is one row per
-- (family, device, member), not one row per (family, device).
--
-- Not in production yet — no existing device_keys/chat_message_keys/
-- member_location_keys rows need migrating forward, they're just cleared.
-- Every device re-registers itself (ensureDeviceRegistered runs on next
-- chat/location activity) and re-wraps session keys naturally the next
-- time each screen is used — no manual re-pairing step for the user.
delete from public.chat_message_keys;
delete from public.member_location_keys;
delete from public.device_keys;

alter table public.device_keys drop constraint if exists device_keys_family_id_device_id_key;
alter table public.device_keys add constraint device_keys_family_device_member_key
  unique (family_id, device_id, member_id);

comment on table public.device_keys is
  'Per-device public keys for the E2E chat/location envelope. One row per (family, device, member) — NOT per (family, device) alone, since a device is often shared across multiple PIN-switched members (a parent''s phone used by kids/seniors too). A device with 3 active member profiles on it has 3 device_keys rows, one per member, all sharing the same device_id but each carrying that member''s own keypair context.';
