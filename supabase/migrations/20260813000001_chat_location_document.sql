-- Chat messages: location pin + document attachment columns
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS location_pin  jsonb,
  ADD COLUMN IF NOT EXISTS document_url  text,
  ADD COLUMN IF NOT EXISTS document_name text;
