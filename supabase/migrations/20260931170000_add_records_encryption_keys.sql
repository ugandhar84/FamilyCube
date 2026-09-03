-- Upgrades Medical Records encryption (features/vault/records/recordsCrypto.ts)
-- from a key derived purely from `familyId + a fixed public salt` (any
-- client that knows the family's id — a non-secret UUID — can derive the
-- same key) to the per-device envelope scheme chat/location already use.
--
-- Shaped like device_keys/chat_message_keys (see
-- 20260903130000_add_per_device_chat_encryption.sql) rather than
-- member_location_keys — this table is directly family_id-scoped (a
-- medical record is visible to the whole family, not one member's own
-- devices the way live location is), so it uses the same simple
-- `family_id = current_user_family_id()` policy device_keys itself uses.
create table if not exists public.family_record_keys (
  family_id     uuid not null references public.families(id) on delete cascade,
  device_id     text not null,
  wrapped_key   text not null,
  created_at    timestamptz not null default now(),
  primary key (family_id, device_id)
);

create index if not exists family_record_keys_family_idx on public.family_record_keys(family_id);

alter table public.family_record_keys enable row level security;

-- Same participancy boundary as device_keys — any family member can read
-- the wrapped-key directory (needed to encrypt for every device), but only
-- a device that actually holds the matching private key can successfully
-- unwrap a given row (enforced client-side by ECDH math, not RLS).
create policy family_record_keys_select on public.family_record_keys
  for select using (family_id = current_user_family_id());

create policy family_record_keys_insert on public.family_record_keys
  for insert with check (family_id = current_user_family_id());

create policy family_record_keys_update on public.family_record_keys
  for update using (family_id = current_user_family_id())
  with check (family_id = current_user_family_id());
