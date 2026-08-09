-- ── Fix 1: notification_logs INSERT policy ────────────────────────────────────
-- Authenticated users need to insert notifications for OTHER users (e.g. when
-- commenting, liking, etc.). Only SELECT/UPDATE/DELETE existed before; INSERT
-- was missing, causing a 403 on every client-side notification send.
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON notification_logs;
CREATE POLICY "Authenticated users can insert notifications"
  ON notification_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- ── Fix 2: increment_post_comments RPC ───────────────────────────────────────
-- Called as: supabase.rpc('increment_post_comments', { p_post_id, p_delta })
-- Atomically bumps comments_count on social_posts (positive = add, negative = remove).
CREATE OR REPLACE FUNCTION increment_post_comments(p_post_id uuid, p_delta integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE social_posts
  SET    comments_count = GREATEST(0, COALESCE(comments_count, 0) + p_delta)
  WHERE  id = p_post_id;
END;
$$;

-- ── Fix 3: post_comments FK constraints so PostgREST resolves joins ───────────
-- The SELECT in social.tsx uses profiles(...) and pets(...) embedded selects.
-- Without FK constraints, PostgREST cannot find the relationship and returns
-- null for author/pet — making all comments appear empty after a reload.
ALTER TABLE post_comments
  DROP CONSTRAINT IF EXISTS post_comments_author_id_fkey;
ALTER TABLE post_comments
  ADD CONSTRAINT post_comments_author_id_fkey
  FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE post_comments
  DROP CONSTRAINT IF EXISTS post_comments_pet_id_fkey;
ALTER TABLE post_comments
  ADD CONSTRAINT post_comments_pet_id_fkey
  FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE SET NULL;

-- Reload PostgREST schema cache so all 3 fixes take effect immediately
NOTIFY pgrst, 'reload schema';
