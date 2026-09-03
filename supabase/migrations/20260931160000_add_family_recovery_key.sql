-- Live-requested: today's per_device_e2e scheme (chat, location, and the
-- new medical-records encryption being added alongside this migration) has
-- ZERO recovery — losing a device, replacing it, or reinstalling the app
-- permanently loses that device's ability to decrypt anything wrapped for
-- it. A near-identical "passcode-wrapped family key" design existed once
-- (20260903130000_add_per_device_chat_encryption.sql's
-- encrypted_device_key_backup/recovery_salt columns) but was deliberately
-- dropped (20260903180000_remove_chat_pin_and_recovery_passcode.sql) in
-- favor of pure per-device isolation with no recovery at all.
--
-- This does NOT revert that decision — per-device isolation stays exactly
-- as-is for every existing device. Instead, a family-wide RECOVERY KEY is
-- added as one more entry in the SAME device_keys directory
-- encryptForDevices()/wrapLocationKeyForDevices() already iterate over —
-- its public half lives in device_keys like a real device (so every
-- existing/future wrap call picks it up automatically, no code changes to
-- any encrypt call site), and its private half is encrypted with a family
-- passcode and stored here. A lost device is recovered by entering the
-- family passcode on a new device, decrypting the recovery private key
-- locally, and using it to unwrap everything the recovery key was ever
-- wrapped for — exactly as if that new device WERE the recovery key.
--
-- Distinct column names from the old, removed scheme (not reusing
-- encrypted_device_key_backup/recovery_salt) to avoid any ambiguity with
-- that abandoned design — this is a new, separate mechanism.
alter table public.families
  add column if not exists encrypted_recovery_privkey text,
  add column if not exists recovery_key_salt text;

comment on column public.families.encrypted_recovery_privkey is
  'AES-GCM ciphertext of the family recovery X25519 private key, wrapped with a PBKDF2 key derived from the family recovery passcode. Null until a parent sets one up.';
comment on column public.families.recovery_key_salt is
  'PBKDF2 salt used to derive the wrapping key from the family recovery passcode. Paired with encrypted_recovery_privkey.';

-- device_keys already models "one public key per device" — the recovery
-- key is registered there too (device_id = 'recovery', a fixed sentinel,
-- not a real per-install id), flagged so client code can distinguish it
-- from a genuine device when needed (e.g. a "manage devices" settings list
-- that shouldn't show the recovery key as a revocable device the same way
-- a lost phone is).
alter table public.device_keys
  add column if not exists is_recovery_key boolean not null default false;

comment on column public.device_keys.is_recovery_key is
  'True for the single synthetic "recovery device" row per family (device_id=''recovery''), whose public key every wrap call includes automatically. False for every real per-install device.';
