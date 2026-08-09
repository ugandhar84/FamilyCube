-- ═══════════════════════════════════════════════════════════════════════════
-- FurEver — Social: full idempotent migration
-- Covers every table, column, index, RLS policy, and trigger used by the
-- Community / Social screen (Feed · Nearby · Family tabs).
--
-- Safe to run multiple times.
-- Run after schema.sql and schema_v2.sql.
--
-- Deploy order:
--   psql $DATABASE_URL < supabase/migration_social_full.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Helpers
-- ─────────────────────────────────────────────────────────────────────────────

-- Convenience: is the calling user a member of this pet's family?
CREATE OR REPLACE FUNCTION is_pet_member(p_pet_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM pets       WHERE id = p_pet_id AND owner_id = auth.uid()
    UNION ALL
    SELECT 1 FROM pet_family WHERE pet_id = p_pet_id AND user_id = auth.uid()
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. social_posts
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS social_posts (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id         uuid        NOT NULL REFERENCES pets(id)         ON DELETE CASCADE,
  author_id      uuid        NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  caption        text,
  photo_url      text,
  type           text        NOT NULL DEFAULT 'moment',           -- moment | milestone | question
  likes_count    integer     NOT NULL DEFAULT 0,
  comments_count integer     NOT NULL DEFAULT 0,
  is_public      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Add updated_at to existing rows if column was missing
ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Keep updated_at in sync automatically
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_social_posts_updated_at ON social_posts;
CREATE TRIGGER set_social_posts_updated_at
  BEFORE UPDATE ON social_posts
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public posts readable"          ON social_posts;
DROP POLICY IF EXISTS "Auth users create own posts"    ON social_posts;
DROP POLICY IF EXISTS "Authors can update own posts"   ON social_posts;
DROP POLICY IF EXISTS "Authors can delete own posts"   ON social_posts;
DROP POLICY IF EXISTS "Anyone can update likes"        ON social_posts;

CREATE POLICY "Public posts readable"
  ON social_posts FOR SELECT USING (is_public = true OR author_id = auth.uid());

CREATE POLICY "Auth users create own posts"
  ON social_posts FOR INSERT WITH CHECK (author_id = auth.uid());

-- Authors can edit caption / type / is_public
CREATE POLICY "Authors can update own posts"
  ON social_posts FOR UPDATE
  USING  (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- Anyone can bump likes_count on a public post (separate permissive policy)
CREATE POLICY "Anyone can update likes"
  ON social_posts FOR UPDATE
  USING (is_public = true)
  WITH CHECK (is_public = true);

CREATE POLICY "Authors can delete own posts"
  ON social_posts FOR DELETE USING (author_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_social_posts_pet      ON social_posts (pet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_posts_author   ON social_posts (author_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_public   ON social_posts (is_public, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. post_comments
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS post_comments (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid        NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  author_id  uuid        NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  pet_id     uuid        REFERENCES pets(id) ON DELETE SET NULL,
  body       text        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read comments"    ON post_comments;
DROP POLICY IF EXISTS "Auth users can comment"      ON post_comments;
DROP POLICY IF EXISTS "Authors can delete comments" ON post_comments;

CREATE POLICY "Anyone can read comments"    ON post_comments FOR SELECT USING (true);
CREATE POLICY "Auth users can comment"      ON post_comments FOR INSERT WITH CHECK (author_id = auth.uid());
CREATE POLICY "Authors can delete comments" ON post_comments FOR DELETE  USING  (author_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments (post_id, created_at);

-- Auto-increment / decrement comments_count on the parent post
CREATE OR REPLACE FUNCTION trg_post_comment_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE social_posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE social_posts SET comments_count = GREATEST(0, comments_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_comments_count ON post_comments;
CREATE TRIGGER trg_comments_count
  AFTER INSERT OR DELETE ON post_comments
  FOR EACH ROW EXECUTE FUNCTION trg_post_comment_count();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. pet_follows
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pet_follows (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_pet_id  uuid        NOT NULL REFERENCES pets(id)       ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(follower_id, following_pet_id)
);

ALTER TABLE pet_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read follows"  ON pet_follows;
DROP POLICY IF EXISTS "Users manage own follows" ON pet_follows;

CREATE POLICY "Anyone can read follows"  ON pet_follows FOR SELECT USING (true);
CREATE POLICY "Users manage own follows" ON pet_follows FOR ALL   USING (follower_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_pet_follows_follower ON pet_follows (follower_id);
CREATE INDEX IF NOT EXISTS idx_pet_follows_pet      ON pet_follows (following_pet_id);

-- Denormalised followers_count on pets
ALTER TABLE pets ADD COLUMN IF NOT EXISTS followers_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION trg_pet_follow_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE pets SET followers_count = followers_count + 1 WHERE id = NEW.following_pet_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE pets SET followers_count = GREATEST(0, followers_count - 1) WHERE id = OLD.following_pet_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_follow_count ON pet_follows;
CREATE TRIGGER trg_follow_count
  AFTER INSERT OR DELETE ON pet_follows
  FOR EACH ROW EXECUTE FUNCTION trg_pet_follow_count();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Pets: location sharing + location_shared flag
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE pets
  ADD COLUMN IF NOT EXISTS location_lat          decimal(10,7),
  ADD COLUMN IF NOT EXISTS location_lng          decimal(10,7),
  ADD COLUMN IF NOT EXISTS location_updated_at   timestamptz,
  ADD COLUMN IF NOT EXISTS location_shared       boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_pets_location ON pets (location_lat, location_lng)
  WHERE location_lat IS NOT NULL AND location_lng IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pets_location_shared ON pets (location_shared)
  WHERE location_shared = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. playdate_requests
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS playdate_requests (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  from_pet_id uuid        NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  to_pet_id   uuid        NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  status      text        NOT NULL DEFAULT 'pending',  -- pending | accepted | declined | cancelled
  message     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(from_pet_id, to_pet_id)
);

ALTER TABLE playdate_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Pet members can manage playdate_requests" ON playdate_requests;
DROP POLICY IF EXISTS "Target pet owner can read requests"       ON playdate_requests;

CREATE POLICY "Pet members can manage playdate_requests"
  ON playdate_requests FOR ALL
  USING (is_pet_member(from_pet_id) OR is_pet_member(to_pet_id));

CREATE POLICY "Target pet owner can read requests"
  ON playdate_requests FOR SELECT
  USING (is_pet_member(to_pet_id));

CREATE INDEX IF NOT EXISTS idx_playdate_from_pet ON playdate_requests (from_pet_id);
CREATE INDEX IF NOT EXISTS idx_playdate_to_pet   ON playdate_requests (to_pet_id);
CREATE INDEX IF NOT EXISTS idx_playdate_status   ON playdate_requests (status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. community_events + event_rsvps
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS community_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           text        NOT NULL,
  description     text,
  event_type      text        NOT NULL DEFAULT 'meetup',
  event_date      date        NOT NULL,
  event_time      text,                          -- HH:MM start time
  event_end_date  date,                          -- may span multiple days
  event_end_time  text,                          -- HH:MM end time
  location_name   text,
  latitude        numeric(10,7),
  longitude       numeric(10,7),
  is_public       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Idempotent: add end columns to existing installations
ALTER TABLE community_events
  ADD COLUMN IF NOT EXISTS event_end_date date,
  ADD COLUMN IF NOT EXISTS event_end_time text;

ALTER TABLE community_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public events readable"   ON community_events;
DROP POLICY IF EXISTS "users create events"      ON community_events;
DROP POLICY IF EXISTS "organizer updates events" ON community_events;
DROP POLICY IF EXISTS "organizer deletes events" ON community_events;

CREATE POLICY "public events readable"   ON community_events FOR SELECT  USING (is_public = true OR organizer_id = auth.uid());
CREATE POLICY "users create events"      ON community_events FOR INSERT  WITH CHECK (organizer_id = auth.uid());
CREATE POLICY "organizer updates events" ON community_events FOR UPDATE  USING (organizer_id = auth.uid());
CREATE POLICY "organizer deletes events" ON community_events FOR DELETE  USING (organizer_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_community_events_date      ON community_events (event_date);
CREATE INDEX IF NOT EXISTS idx_community_events_organizer ON community_events (organizer_id);

-- ── event_rsvps ───────────────────────────────────────────────────────────────

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

CREATE POLICY "rsvps readable"    ON event_rsvps FOR SELECT USING (true);
CREATE POLICY "users rsvp"        ON event_rsvps FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "users cancel rsvp" ON event_rsvps FOR DELETE USING  (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_event_rsvps_event ON event_rsvps (event_id);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_user  ON event_rsvps (user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. pet_family + family_invitations
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pet_family (
  id        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id    uuid        NOT NULL REFERENCES pets(id)       ON DELETE CASCADE,
  user_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role      text        NOT NULL DEFAULT 'caretaker',      -- caretaker | caregiver | viewer
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pet_id, user_id)
);

ALTER TABLE pet_family ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pet family readable"  ON pet_family;
DROP POLICY IF EXISTS "pet owner manages"    ON pet_family;

CREATE POLICY "pet family readable"
  ON pet_family FOR SELECT USING (is_pet_member(pet_id));

CREATE POLICY "pet owner manages"
  ON pet_family FOR ALL
  USING (EXISTS (SELECT 1 FROM pets WHERE id = pet_id AND owner_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_pet_family_pet  ON pet_family (pet_id);
CREATE INDEX IF NOT EXISTS idx_pet_family_user ON pet_family (user_id);

-- ── family_invitations ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS family_invitations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id      uuid        NOT NULL REFERENCES pets(id)       ON DELETE CASCADE,
  invited_by  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text        NOT NULL,
  role        text        NOT NULL DEFAULT 'caretaker',
  message     text,
  token       text        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'base64url'),
  accepted_at timestamptz,
  expires_at  timestamptz NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE family_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inviter can read own invitations" ON family_invitations;
DROP POLICY IF EXISTS "pet owner creates invitations"    ON family_invitations;
DROP POLICY IF EXISTS "anyone can read by token"         ON family_invitations;

-- Allow the inviter to see what they sent
CREATE POLICY "inviter can read own invitations"
  ON family_invitations FOR SELECT USING (invited_by = auth.uid());

-- Accept-invite function reads by token (anon access needed)
CREATE POLICY "anyone can read by token"
  ON family_invitations FOR SELECT USING (true);

CREATE POLICY "pet owner creates invitations"
  ON family_invitations FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM pets WHERE id = pet_id AND owner_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_family_invitations_token ON family_invitations (token);
CREATE INDEX IF NOT EXISTS idx_family_invitations_email ON family_invitations (email);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Profiles: public read (needed for social feed, nearby pet owner names)
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Public profile name read"   ON profiles;

CREATE POLICY "Public profile name read"
  ON profiles FOR SELECT USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. push_tokens (for social notifications)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS push_tokens (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token      text        NOT NULL,
  platform   text,                              -- ios | android | web
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, token)
);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own tokens" ON push_tokens;
CREATE POLICY "Users manage own tokens" ON push_tokens FOR ALL USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. notification_log (in-app notification inbox)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_log (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      text        NOT NULL,
  body       text,
  type       text        NOT NULL DEFAULT 'general',
  data       jsonb,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own notifications" ON notification_log;
DROP POLICY IF EXISTS "Users mark own read"         ON notification_log;

CREATE POLICY "Users see own notifications"
  ON notification_log FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users mark own read"
  ON notification_log FOR UPDATE USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_notification_log_user ON notification_log (user_id, created_at DESC);
