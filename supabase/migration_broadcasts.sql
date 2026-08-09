-- Track admin broadcasts to all users

CREATE TABLE IF NOT EXISTS broadcasts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  recipient_count integer DEFAULT 0,
  sent_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS broadcasts_admin_idx ON broadcasts(admin_id);
CREATE INDEX IF NOT EXISTS broadcasts_sent_at_idx ON broadcasts(sent_at DESC);

-- Allow admins to view broadcasts
ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view broadcasts" ON broadcasts;
CREATE POLICY "Admins can view broadcasts" ON broadcasts
  FOR SELECT
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()) = true);

DROP POLICY IF EXISTS "Admins can create broadcasts" ON broadcasts
  FOR INSERT
  WITH CHECK ((SELECT is_admin FROM profiles WHERE id = auth.uid()) = true);
