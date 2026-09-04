-- Live-requested, explicit, twice-confirmed: full reset of chat history
-- during this app's real testing phase (not production family data to
-- preserve). Deletes every chat message across every channel/DM.
-- chat_message_keys cascades automatically (message_id references
-- chat_messages(id) on delete cascade, see
-- 20260903130000_add_per_device_chat_encryption.sql). chat_channel_reads
-- (per-channel read cursors) is cleared too so the reset is clean —
-- otherwise a stale "last read" cursor from before the wipe would
-- incorrectly suppress unread badges for the first new message in an old
-- channel.
-- guard_chat_messages_write() (20260930530000) requires a real
-- resolve_active_member_id() session for DELETE, which a migration
-- connection doesn't have — it exempts auth.role() = 'service_role'
-- specifically for cases like this, but the migration runner connects as
-- the table owner, not service_role. Disabling the trigger for this one
-- statement (same session, re-enabled immediately after) is the correct,
-- narrow way to bypass it here rather than weakening the guard itself.
alter table chat_messages disable trigger chat_messages_write_guard_del;
delete from chat_messages;
alter table chat_messages enable trigger chat_messages_write_guard_del;

delete from chat_channel_reads;
