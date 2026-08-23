-- Records which device sent a message under the per-device E2E envelope
-- (gated by the per_device_e2e feature flag). A recipient device needs the
-- sender's device_id to look up its public key and re-derive the ECDH
-- shared secret used to wrap that message's session key. Not secret —
-- device_id is already visible via device_keys, which every family member
-- can read (see device_keys_select policy).

alter table chat_messages add column if not exists sender_device_id text;

comment on column chat_messages.sender_device_id is 'device_keys.device_id of the device that sent this message, when per_device_e2e was enabled at send time. Null for legacy single-shared-key messages.';
