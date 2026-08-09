-- ── Event group chat ─────────────────────────────────────────────────────────
-- One message channel per community event, open to organizer + all RSVPed attendees.

CREATE TABLE IF NOT EXISTS event_messages (
  id         uuid        DEFAULT uuid_generate_v4() PRIMARY KEY,
  event_id   uuid        NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
  sender_id  uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message    text        NOT NULL CHECK (char_length(message) <= 1000),
  sent_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_messages_event ON event_messages (event_id, sent_at);

ALTER TABLE event_messages ENABLE ROW LEVEL SECURITY;

-- Participant = organizer OR has an active RSVP row
CREATE OR REPLACE FUNCTION is_event_participant(p_event_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM community_events WHERE id = p_event_id AND organizer_id = auth.uid()
    UNION ALL
    SELECT 1 FROM event_rsvps        WHERE event_id = p_event_id AND user_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "Event participants can read messages"  ON event_messages;
DROP POLICY IF EXISTS "Event participants can send messages"  ON event_messages;

CREATE POLICY "Event participants can read messages"
  ON event_messages FOR SELECT USING (is_event_participant(event_id));

CREATE POLICY "Event participants can send messages"
  ON event_messages FOR INSERT
  WITH CHECK (is_event_participant(event_id) AND sender_id = auth.uid());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE event_messages;

-- ── Add attendee_ids column to event_rsvps if missing ────────────────────────
-- (event_rsvps already exists; we just need created_at for display)
ALTER TABLE event_rsvps
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
