-- Simplification: per product decision, the per-device chat encryption
-- stays bare public/private keys only — no family recovery passcode, no
-- per-member Chat PIN gate. Lose the device, lose that device's message
-- history; nothing else layered on top. Drops the columns added for both
-- now-removed mechanisms (migrations 20260903130000 and 20260903150000).

alter table members drop column if exists chat_pin_hash;
alter table members drop column if exists chat_pin_salt;

alter table families drop column if exists encrypted_device_key_backup;
alter table families drop column if exists recovery_salt;
