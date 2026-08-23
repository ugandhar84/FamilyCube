-- Per-device encryption for location address text, mirroring chat's
-- per-device envelope (device_keys / chat_message_keys) but with a
-- lifecycle suited to location: everyone needs to read everyone's CURRENT
-- position continuously (that's the map feature), not deliver one message
-- to specific recipients — and location updates far more often than chat
-- messages arrive (~every 0.1 mile moved), so wrapping fresh on every
-- single update would be needless write volume for a field that's
-- overwritten in place anyway.
--
-- Design: each MEMBER (not device) has one long-lived AES-256 session key
-- for their own location stream. That key is wrapped once per family
-- device (via ECDH against device_keys.public_key, same as chat) and only
-- re-wrapped when the set of devices changes (a new device registers, or
-- one is revoked) — not on every GPS ping. The member's own device reuses
-- its already-established session key to encrypt each new address/street/
-- neighborhood value; lat/lng stay plaintext (unchanged — needed for live
-- map rendering without decrypting every row, same reasoning as before).

create table if not exists member_location_keys (
  member_id     text not null references members(id) on delete cascade,
  device_id     text not null,
  wrapped_key   text not null,
  created_at    timestamptz not null default now(),
  primary key (member_id, device_id)
);

create index if not exists member_location_keys_member_idx on member_location_keys(member_id);

alter table member_location_keys enable row level security;

-- Same participancy boundary as device_keys — any family member can read
-- the wrapped-key directory (needed to encrypt for every device), but only
-- a device belonging to the SAME member the key is for should ever
-- successfully unwrap it (enforced client-side by ECDH math, not RLS —
-- RLS here only gates who can see/write rows, same as chat_message_keys).
create policy member_location_keys_select on member_location_keys
  for select using (
    exists (
      select 1 from members m
      where m.id = member_location_keys.member_id
        and m.family_id::text = (current_user_family_id())::text
    )
  );

create policy member_location_keys_insert on member_location_keys
  for insert with check (
    exists (
      select 1 from members m
      where m.id = member_location_keys.member_id
        and m.family_id::text = (current_user_family_id())::text
    )
  );

comment on table member_location_keys is 'Per-device wrapped copy of one member''s long-lived location session key. Re-wrapped only when the family''s device set changes, not on every location update.';
