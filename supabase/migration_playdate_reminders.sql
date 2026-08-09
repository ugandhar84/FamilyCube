-- Add reminder tracking columns to playdate_chats
-- Run once after migration_playdate_chat.sql
ALTER TABLE playdate_chats
  ADD COLUMN IF NOT EXISTS reminder_1day_sent  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_3hour_sent boolean DEFAULT false;
