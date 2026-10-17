-- Replaces the per-device X25519 sealed-envelope encryption scheme (chat,
-- location's "legacy" path, records, and the passcode-wrapped family
-- recovery key) with a single shared AES-256 key per family, held ONLY in
-- each device's local SecureStore and never transmitted to or derived
-- from anything server-side. The server only ever sees:
--   - key_generation: a non-secret counter, bumped on every rotation.
--   - key_rotated_at / key_rotated_by: non-secret "who/when" metadata.
-- No column anywhere stores the actual key, raw or wrapped — this was a
-- deliberate, explicitly confirmed design requirement, not an oversight.

alter table public.families
  add column if not exists key_generation int not null default 0,
  add column if not exists key_rotated_at timestamptz,
  add column if not exists key_rotated_by text references public.members(id);

comment on column public.families.key_generation is
  'Non-secret rotation counter for the shared family encryption key. Bumped by bump_family_key_generation() at the START of a rotation job, so every other device can tell it is behind and must be given the new code.';
comment on column public.families.key_rotated_at is
  'Timestamp of the last key rotation. Non-secret — used only for the 30-day rotation cooldown and to show "last rotated on X" in the UI.';
comment on column public.families.key_rotated_by is
  'Member id of whoever last rotated the family key. Non-secret.';

-- Non-secret RPC: bumps the generation counter and records who/when,
-- called by lib/familyKeyRotation.ts's rotateFamilyKey at the START of a
-- rotation (before any re-encryption work happens), so every other device
-- is immediately marked "behind" even while the admin's re-encryption
-- pass is still running in the background.
create or replace function public.bump_family_key_generation(p_family_id uuid, p_rotated_by text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.families
  set key_generation = key_generation + 1,
      key_rotated_at  = now(),
      key_rotated_by  = p_rotated_by
  where id = p_family_id;
$$;

-- Drop the entire per-device envelope's server-side surface — none of it
-- is needed once chat/location/records all use the shared key above.
drop table if exists public.chat_message_keys;
drop table if exists public.family_record_keys;
drop table if exists public.member_location_keys;
drop table if exists public.device_keys;

-- Drop the family recovery key columns (passcode-wrapped recovery
-- keypair) and the even-older, already-abandoned backup scheme that
-- preceded it — neither has any server-held key material to migrate,
-- since this new scheme has no recovery mechanism by design.
alter table public.families
  drop column if exists encrypted_recovery_privkey,
  drop column if exists recovery_key_salt,
  drop column if exists recovery_key_set_by,
  drop column if exists recovery_key_set_at,
  drop column if exists encrypted_device_key_backup,
  drop column if exists recovery_salt;
