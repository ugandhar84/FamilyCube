-- =============================================
-- Fix: Allow viewing pet & profile data in social posts
-- =============================================
-- Issue: Social feed posts don't show pet avatars or owner names
-- Cause: RLS policies on pets & profiles are too restrictive
-- Fix: Add policies allowing public viewing when pet is in public social post

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Pets: Allow anyone to view public pets (shared via social)
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Public can view social pets" ON pets;
CREATE POLICY "Public can view social pets"
  ON pets FOR SELECT
  USING (
    -- User is owner
    auth.uid() = owner_id
    OR
    -- User is family member
    id IN (SELECT get_my_family_pet_ids())
    OR
    -- Pet has public social posts
    id IN (
      SELECT DISTINCT pet_id
      FROM social_posts
      WHERE pet_id IS NOT NULL
        AND is_public = true
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Profiles: Consolidate all public viewing rules
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Public can view social authors" ON profiles;
DROP POLICY IF EXISTS "Public can view commenters" ON profiles;
DROP POLICY IF EXISTS "Public can view chat participants" ON profiles;

-- Policy 1: Users can always view their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Policy 2: Public can view profiles of anyone who created public content (single consolidated policy)
CREATE POLICY "Public can view public content creators"
  ON profiles FOR SELECT
  USING (
    -- Authors of public social posts
    id IN (
      SELECT DISTINCT author_id FROM social_posts WHERE is_public = true
    )
    OR
    -- Commenters on public social posts
    id IN (
      SELECT DISTINCT author_id
      FROM post_comments pc
      JOIN social_posts sp ON pc.post_id = sp.id
      WHERE sp.is_public = true
    )
    OR
    -- Organizers of public events
    id IN (
      SELECT DISTINCT organizer_id FROM events WHERE is_public = true
    )
    OR
    -- Participants in playdate chats (can see who they're chatting with)
    id IN (
      SELECT DISTINCT sender_id FROM playdate_chat_messages
    )
    OR
    -- Participants in event chats (can see who they're chatting with)
    id IN (
      SELECT DISTINCT sender_id FROM event_chat_messages
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Ensure social_posts is readable (already done, but confirm)
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Public posts readable" ON social_posts;
CREATE POLICY "Public posts readable"
  ON social_posts FOR SELECT
  USING (is_public = true OR author_id = auth.uid());
