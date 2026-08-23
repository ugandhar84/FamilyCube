-- Per-device end-to-end chat encryption.
--
-- Replaces the single family-wide shared AES key model with per-device
-- asymmetric keypairs: each device generates its own X25519 keypair
-- (private key stays in Secure Store, never leaves the device); the public
-- key is uploaded here. A message body is encrypted once with a random
-- session key, and that session key is wrapped separately for every
-- recipient device (chat_message_keys) — the "multi-encryption" envelope.
--
-- families.encrypted_device_key_backup / recovery_salt hold the
-- passcode-wrapped recovery blob (see lib/chatCrypto.ts) — this is
-- encrypted private-key material, not a usable key on its own. The
-- plaintext passcode is never transmitted or stored; ownership of it is
-- the family's, set by whoever creates the family during onboarding.

create table if not exists device_keys (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references families(id) on delete cascade,
  member_id     text not null references members(id) on delete cascade,
  device_id     text not null,
  public_key    text not null,
  label         text,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  unique (family_id, device_id)
);

create index if not exists device_keys_family_idx on device_keys(family_id) where revoked_at is null;

create table if not exists chat_message_keys (
  message_id    text not null references chat_messages(id) on delete cascade,
  device_id     text not null,
  wrapped_key   text not null,
  created_at    timestamptz not null default now(),
  primary key (message_id, device_id)
);

create index if not exists chat_message_keys_device_idx on chat_message_keys(device_id);

alter table families add column if not exists encrypted_device_key_backup text;
alter table families add column if not exists recovery_salt text;

alter table device_keys enable row level security;
alter table chat_message_keys enable row level security;

-- device_keys: readable/writable by anyone in the family (public keys are
-- not secret — every device needs to read every other device's public key
-- to encrypt for them).
create policy device_keys_select on device_keys
  for select using (family_id = current_user_family_id());

create policy device_keys_insert on device_keys
  for insert with check (family_id = current_user_family_id());

create policy device_keys_update on device_keys
  for update using (family_id = current_user_family_id())
  with check (family_id = current_user_family_id());

-- chat_message_keys: scoped through the parent message's channel
-- participancy — same boundary chat_messages itself already uses, so a
-- device can only ever see the wrapped-key rows for messages in channels
-- it's actually a participant of.
create policy chat_message_keys_select on chat_message_keys
  for select using (
    exists (
      select 1 from chat_messages cm
      join chat_channels cc on cc.id = cm.channel_id
      where cm.id = chat_message_keys.message_id
        and cc.family_id = (current_user_family_id())::text
        and is_chat_channel_participant(cc.id)
    )
  );

create policy chat_message_keys_insert on chat_message_keys
  for insert with check (
    exists (
      select 1 from chat_messages cm
      join chat_channels cc on cc.id = cm.channel_id
      where cm.id = chat_message_keys.message_id
        and cc.family_id = (current_user_family_id())::text
        and is_chat_channel_participant(cc.id)
    )
  );

comment on table device_keys is 'One row per device that has registered for chat. public_key is not secret; the matching private key lives only in that device''s Secure Store.';
comment on table chat_message_keys is 'Per-recipient-device wrapped session key for one chat message — the multi-encryption envelope. A device can only decrypt its own row.';
comment on column families.encrypted_device_key_backup is 'Passcode-wrapped recovery blob, set by the family creator during onboarding. Encrypted private-key material, not a usable key without the passcode — the app never stores or sees the plaintext passcode.';
comment on column families.recovery_salt is 'PBKDF2 salt for the recovery passcode — safe to store in the clear, not secret on its own.';
