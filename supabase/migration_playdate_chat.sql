-- Playdate Negotiation Chat Table
-- Stores messages and proposals between two pet owners negotiating a playdate

CREATE TABLE IF NOT EXISTS playdate_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playdate_request_id uuid NOT NULL REFERENCES playdate_requests(id) ON DELETE CASCADE,
  from_pet_id uuid NOT NULL REFERENCES pets(id),
  to_pet_id uuid NOT NULL REFERENCES pets(id),
  from_owner_id uuid NOT NULL REFERENCES auth.users(id),
  to_owner_id uuid NOT NULL REFERENCES auth.users(id),
  
  status text DEFAULT 'negotiating',  -- negotiating, agreed, cancelled
  agreed_date date,
  agreed_time time,
  agreed_location text,

  reminder_1day_sent  boolean DEFAULT false,
  reminder_3hour_sent boolean DEFAULT false,

  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Chat messages table
CREATE TABLE IF NOT EXISTS playdate_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES playdate_chats(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id),
  sender_pet_id uuid NOT NULL REFERENCES pets(id),
  
  message_type text,  -- 'text' or 'proposal'
  content text NOT NULL,
  
  -- For proposals (when message_type = 'proposal')
  proposed_date date,
  proposed_time time,
  proposed_location text,
  proposal_status text DEFAULT 'pending',  -- pending, accept, reject
  
  created_at timestamp DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_playdate_chats_from_owner ON playdate_chats(from_owner_id);
CREATE INDEX IF NOT EXISTS idx_playdate_chats_to_owner ON playdate_chats(to_owner_id);
CREATE INDEX IF NOT EXISTS idx_playdate_chats_status ON playdate_chats(status);
CREATE INDEX IF NOT EXISTS idx_playdate_chat_messages_chat ON playdate_chat_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_playdate_chat_messages_sender ON playdate_chat_messages(sender_id);

-- RLS Policies
ALTER TABLE playdate_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE playdate_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own playdate chats" ON playdate_chats;
CREATE POLICY "Users can view own playdate chats"
  ON playdate_chats FOR SELECT
  USING (from_owner_id = auth.uid() OR to_owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own playdate chats" ON playdate_chats;
CREATE POLICY "Users can update own playdate chats"
  ON playdate_chats FOR UPDATE
  USING (from_owner_id = auth.uid() OR to_owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can view own chat messages" ON playdate_chat_messages;
CREATE POLICY "Users can view own chat messages"
  ON playdate_chat_messages FOR SELECT
  USING (
    chat_id IN (
      SELECT id FROM playdate_chats 
      WHERE from_owner_id = auth.uid() OR to_owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert chat messages" ON playdate_chat_messages;
CREATE POLICY "Users can insert chat messages"
  ON playdate_chat_messages FOR INSERT
  WITH CHECK (sender_id = auth.uid());
