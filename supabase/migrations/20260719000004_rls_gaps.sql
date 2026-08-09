-- Fixes for RLS policy gaps found in pre-launch audit.
-- Run once: psql $DATABASE_URL < supabase/migration_rls_gaps.sql

-- ─── Bug 2: timeline_shares — shared links unviewable by non-creators ──────────
-- The existing SELECT policy restricts to created_by = auth.uid(), which blocks
-- every recipient who opens a shared /timeline/[token] link.
-- Replace with a policy that lets anyone (including unauthenticated) read an
-- active share row so getSharedTimeline() can validate the token.
DROP POLICY IF EXISTS "timeline_shares_select" ON timeline_shares;
CREATE POLICY "timeline_shares_select" ON timeline_shares
  FOR SELECT USING (
    created_by = auth.uid()          -- creator always sees their own shares
    OR is_active = true              -- any bearer of the token can validate it
  );

-- ─── Bug 3: social_posts — admins cannot moderate content ─────────────────────
-- The existing UPDATE policies only allow authors to edit their own posts and
-- anyone to bump like counts. Admins (is_admin=true in profiles) need to be
-- able to set is_hidden, is_approved, etc. on any post.
DROP POLICY IF EXISTS "admin can moderate posts" ON social_posts;
CREATE POLICY "admin can moderate posts" ON social_posts
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- ─── Bug 4 + 6: playdate_chats — missing INSERT and DELETE policies ────────────
-- Only SELECT and UPDATE were present; cleanup (declined/cancelled chats) and
-- the edge-function fallback path need DELETE; future client paths need INSERT.
DROP POLICY IF EXISTS "Users can create playdate chats" ON playdate_chats;
CREATE POLICY "Users can create playdate chats" ON playdate_chats
  FOR INSERT WITH CHECK (from_owner_id = auth.uid() OR to_owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own playdate chats" ON playdate_chats;
CREATE POLICY "Users can delete own playdate chats" ON playdate_chats
  FOR DELETE USING (from_owner_id = auth.uid() OR to_owner_id = auth.uid());

-- ─── Bug 6: playdate_meetings — missing INSERT and DELETE policies ─────────────
DROP POLICY IF EXISTS "Users can create playdate meetings" ON playdate_meetings;
CREATE POLICY "Users can create playdate meetings" ON playdate_meetings
  FOR INSERT WITH CHECK (from_owner_id = auth.uid() OR to_owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own playdate meetings" ON playdate_meetings;
CREATE POLICY "Users can delete own playdate meetings" ON playdate_meetings
  FOR DELETE USING (from_owner_id = auth.uid() OR to_owner_id = auth.uid());

-- ─── Bug 10: family_invitations — SELECT exposes all invites to all users ──────
-- The old policy used USING (true) — any authenticated user could enumerate all
-- pending invitations including email addresses and invite tokens.
-- Replace with a policy scoped to the inviter, the invitee, and pet owners.
DROP POLICY IF EXISTS "Invitees can view and accept their invitation" ON family_invitations;
CREATE POLICY "family_invitations: parties can view" ON family_invitations
  FOR SELECT USING (
    invited_by = auth.uid()
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
    OR pet_id IN (SELECT id FROM pets WHERE owner_id = auth.uid())
  );
