-- ═══════════════════════════════════════════════════════════════════════════
-- FurEver — Social features migration v2
-- Fully idempotent — safe to run multiple times.
-- REPLACES migration_social.sql (which left broken RLS policies in the DB).
-- Run: psql $DATABASE_URL < supabase/migration_social_v2.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Pets: add location_shared ──────────────────────────────────────────────
-- location_lat / location_lng / location_updated_at are already in schema_v2.sql.
-- We only need the opt-out flag.
ALTER TABLE pets
  ADD COLUMN IF NOT EXISTS location_shared boolean NOT NULL DEFAULT true;

-- ── 2. Profiles: allow public read of name + avatar ───────────────────────────
-- Required for nearby pet cards (show owner name) and social feed (show author).
-- We DROP the "own only" policy and replace with a blanket SELECT so that
-- joined queries from social_posts / nearby pets can resolve display names.
-- INSERT / UPDATE remain restricted to the authenticated user.
DROP POLICY IF EXISTS "Users can view own profile"       ON profiles;
DROP POLICY IF EXISTS "Public profile name read"         ON profiles;
CREATE POLICY "Public profile name read"
  ON profiles FOR SELECT USING (true);

-- ── 3. Fix broken playdate_requests RLS from migration_social.sql ─────────────
-- That migration tried to reference non-existent column "requester_id".
-- Drop those invalid policies and keep the correct one from schema.sql.
DROP POLICY IF EXISTS "playdate requests readable" ON playdate_requests;
DROP POLICY IF EXISTS "users create request"       ON playdate_requests;
-- Re-create the canonical policy idempotently.
DROP POLICY IF EXISTS "Pet members can manage playdate_requests" ON playdate_requests;
CREATE POLICY "Pet members can manage playdate_requests"
  ON playdate_requests FOR ALL
  USING (is_pet_member(from_pet_id) OR is_pet_member(to_pet_id));

-- Allow looking up requests sent TO your pets (so target owner can accept/decline).
DROP POLICY IF EXISTS "Target pet owner can read requests" ON playdate_requests;
CREATE POLICY "Target pet owner can read requests"
  ON playdate_requests FOR SELECT
  USING (is_pet_member(to_pet_id));

-- ── 4. community_events ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_events (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         text        NOT NULL,
  description   text,
  event_type    text        NOT NULL DEFAULT 'meetup',
  event_date    date        NOT NULL,
  event_time    text,
  location_name text,
  latitude      numeric(10,7),
  longitude     numeric(10,7),
  is_public     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE community_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public events readable"   ON community_events;
DROP POLICY IF EXISTS "users create events"      ON community_events;
DROP POLICY IF EXISTS "organizer updates events" ON community_events;
DROP POLICY IF EXISTS "organizer deletes events" ON community_events;

CREATE POLICY "public events readable"
  ON community_events FOR SELECT
  USING (is_public = true OR organizer_id = auth.uid());

CREATE POLICY "users create events"
  ON community_events FOR INSERT
  WITH CHECK (organizer_id = auth.uid());

CREATE POLICY "organizer updates events"
  ON community_events FOR UPDATE
  USING (organizer_id = auth.uid());

CREATE POLICY "organizer deletes events"
  ON community_events FOR DELETE
  USING (organizer_id = auth.uid());

-- ── 5. event_rsvps ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_rsvps (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid        NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id)       ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

ALTER TABLE event_rsvps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rsvps readable"    ON event_rsvps;
DROP POLICY IF EXISTS "users rsvp"        ON event_rsvps;
DROP POLICY IF EXISTS "users cancel rsvp" ON event_rsvps;

CREATE POLICY "rsvps readable"
  ON event_rsvps FOR SELECT USING (true);

CREATE POLICY "users rsvp"
  ON event_rsvps FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users cancel rsvp"
  ON event_rsvps FOR DELETE
  USING (user_id = auth.uid());

-- ── 6. lab_results: bridge schema_v2 ↔ migration_health_records columns ───────
-- schema_v2 created lab_results with the full clinical column set.
-- migration_health_records.sql created it with a simplified set.
-- Whichever ran first wins via CREATE TABLE IF NOT EXISTS.
-- This makes both column sets present regardless of order.
ALTER TABLE lab_results
  ADD COLUMN IF NOT EXISTS test_name       text,
  ADD COLUMN IF NOT EXISTS result_value    text,
  ADD COLUMN IF NOT EXISTS unit            text,
  ADD COLUMN IF NOT EXISTS reference_range text,
  ADD COLUMN IF NOT EXISTS is_abnormal     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS lab_name        text,
  ADD COLUMN IF NOT EXISTS file_url        text,
  ADD COLUMN IF NOT EXISTS name            text,
  ADD COLUMN IF NOT EXISTS result          text,
  ADD COLUMN IF NOT EXISTS interpretation  text;

-- ── 7. social_posts: make sure likes can be updated by non-authors ─────────────
-- schema_v2 has "Authors can manage own posts" (author_id = uid) for all ops.
-- We need a separate UPDATE policy for likes_count so anyone can like a post.
DROP POLICY IF EXISTS "Anyone can update likes" ON social_posts;
CREATE POLICY "Anyone can update likes"
  ON social_posts FOR UPDATE
  USING (is_public = true)
  WITH CHECK (is_public = true);

-- ── 8. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_community_events_date       ON community_events (event_date);
CREATE INDEX IF NOT EXISTS idx_community_events_organizer  ON community_events (organizer_id);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_event           ON event_rsvps (event_id);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_user            ON event_rsvps (user_id);
CREATE INDEX IF NOT EXISTS idx_playdate_from_pet           ON playdate_requests (from_pet_id);
CREATE INDEX IF NOT EXISTS idx_playdate_to_pet             ON playdate_requests (to_pet_id);
CREATE INDEX IF NOT EXISTS idx_playdate_status             ON playdate_requests (status);
CREATE INDEX IF NOT EXISTS idx_pets_location               ON pets (location_lat, location_lng)
  WHERE location_lat IS NOT NULL AND location_lng IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pets_location_shared        ON pets (location_shared)
  WHERE location_shared = true;
