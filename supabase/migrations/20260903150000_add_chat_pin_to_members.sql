-- Per-member Chat PIN — gates decrypting chat on this device, independent
-- of the existing profile-switch PIN (members.pin). Stored hashed (SHA-256
-- + per-member salt), never plaintext — the app only ever compares hashes,
-- consistent with the per-device E2E design's "never store a usable secret
-- server-side" principle. Unlocking is per-session, in-memory only on the
-- client (see lib/chatCrypto.ts) — nothing here tracks "is currently
-- unlocked," only "what's the correct PIN to check against."

alter table members add column if not exists chat_pin_hash text;
alter table members add column if not exists chat_pin_salt text;

comment on column members.chat_pin_hash is 'SHA-256(pin + chat_pin_salt), hex. Never the raw PIN. Null = chat PIN not yet set for this member.';
comment on column members.chat_pin_salt is 'Random per-member salt for chat_pin_hash. Safe to store in the clear.';
