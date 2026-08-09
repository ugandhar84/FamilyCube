-- ── Social / Nearby / Events migration ────────────────────────────────────────

-- 1. Add location columns to pets (for nearby discovery)
ALTER TABLE pets
  ADD COLUMN IF NOT EXISTS latitude             numeric(10,7),
  ADD COLUMN IF NOT EXISTS longitude            numeric(10,7),
  ADD COLUMN IF NOT EXISTS location_updated_at  timestamptz,
  ADD COLUMN IF NOT EXISTS location_shared      boolean DEFAULT true;

-- 2. Community events
CREATE TABLE IF NOT EXISTS community_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id  uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title         text NOT NULL,
  description   text,
  event_type    text NOT NULL DEFAULT 'meetup',
  event_date    date NOT NULL,
  event_time    text,
  location_name text,
  latitude      numeric(10,7),
  longitude     numeric(10,7),
  is_public     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now()
);

-- 3. Event RSVPs
CREATE TABLE IF NOT EXISTS event_rsvps (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid REFERENCES community_events(id) ON DELETE CASCADE NOT NULL,
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(event_id, user_id)
);

-- 4. Playdate requests (tracks who requested a playdate with whom)
CREATE TABLE IF NOT EXISTS playdate_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id  uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  pet_id        uuid REFERENCES pets(id) ON DELETE CASCADE NOT NULL,
  target_pet_id uuid REFERENCES pets(id) ON DELETE CASCADE NOT NULL,
  status        text DEFAULT 'pending',  -- pending | accepted | declined
  created_at    timestamptz DEFAULT now(),
  UNIQUE(requester_id, target_pet_id)
);

-- 5. RLS
ALTER TABLE community_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_rsvps         ENABLE ROW LEVEL SECURITY;
ALTER TABLE playdate_requests   ENABLE ROW LEVEL SECURITY;

-- Events: anyone can read public; only organizer can write
CREATE POLICY "public events readable"    ON community_events FOR SELECT USING (is_public OR organizer_id = auth.uid());
CREATE POLICY "users create events"       ON community_events FOR INSERT WITH CHECK (organizer_id = auth.uid());
CREATE POLICY "organizer updates events"  ON community_events FOR UPDATE USING (organizer_id = auth.uid());
CREATE POLICY "organizer deletes events"  ON community_events FOR DELETE USING (organizer_id = auth.uid());

-- RSVPs: readable by all, writable by owner
CREATE POLICY "rsvps readable"    ON event_rsvps FOR SELECT USING (true);
CREATE POLICY "users rsvp"        ON event_rsvps FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "users cancel rsvp" ON event_rsvps FOR DELETE USING (user_id = auth.uid());

-- Playdate requests: readable by involved parties
CREATE POLICY "playdate requests readable" ON playdate_requests FOR SELECT USING (requester_id = auth.uid());
CREATE POLICY "users create request"       ON playdate_requests FOR INSERT WITH CHECK (requester_id = auth.uid());
