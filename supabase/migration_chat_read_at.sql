-- Track per-side last-read timestamp on playdate chats
-- from_last_read_at: when the initiator (from_owner) last opened the chat
-- to_last_read_at:   when the recipient (to_owner) last opened the chat
ALTER TABLE playdate_chats
  ADD COLUMN IF NOT EXISTS from_last_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS to_last_read_at   timestamptz;
