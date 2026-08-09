-- Enable REPLICA IDENTITY FULL on playdate_chat_messages so Supabase
-- realtime sends the full row in WAL events, allowing both participants
-- (B-side) to receive INSERT/UPDATE notifications correctly.
ALTER TABLE playdate_chat_messages REPLICA IDENTITY FULL;

-- Also ensure the table is added to the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE playdate_chat_messages;
