-- Post pins — users can bookmark/pin any post (own or others)
CREATE TABLE IF NOT EXISTS post_pins (
  user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id  uuid NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

ALTER TABLE post_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own pins"
  ON post_pins FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS post_pins_user_id_idx ON post_pins (user_id);
