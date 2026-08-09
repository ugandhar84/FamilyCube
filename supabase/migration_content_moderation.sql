-- ── Content moderation ───────────────────────────────────────────────────────
-- blocked_words table: admins can add/remove words via Supabase dashboard.
-- Triggers on playdate_messages and event_messages reject inserts that match.

CREATE TABLE IF NOT EXISTS blocked_words (
  id    serial PRIMARY KEY,
  word  text NOT NULL UNIQUE
);

-- Seed with core list (case stored lower; matching is case-insensitive)
INSERT INTO blocked_words (word) VALUES
  ('fuck'),('shit'),('ass'),('bitch'),('cunt'),('dick'),('cock'),('pussy'),
  ('bastard'),('whore'),('slut'),('nigger'),('nigga'),('faggot'),('fag'),
  ('retard'),('piss'),('twat'),('wank'),('bollocks'),('motherfucker'),('mofo'),
  ('asshole'),('arsehole'),('jackass'),('bullshit'),('douchebag'),('prick'),
  ('cum'),('jizz')
ON CONFLICT (word) DO NOTHING;

-- Only service-role can manage the word list
ALTER TABLE blocked_words ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blocked_words: no direct access" ON blocked_words USING (false);

-- ── Trigger function ──────────────────────────────────────────────────────────
-- Uses regexp_replace to strip non-alpha chars (leet-speak), then word-matches.
CREATE OR REPLACE FUNCTION check_message_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  clean_msg text;
  matched   text;
BEGIN
  -- Normalise: lowercase, collapse leet substitutions, strip separators
  clean_msg := lower(NEW.message);
  clean_msg := regexp_replace(clean_msg, '[@4]',  'a', 'g');
  clean_msg := regexp_replace(clean_msg, '[3]',   'e', 'g');
  clean_msg := regexp_replace(clean_msg, '[1!|]', 'i', 'g');
  clean_msg := regexp_replace(clean_msg, '[0]',   'o', 'g');
  clean_msg := regexp_replace(clean_msg, '[$5]',  's', 'g');
  clean_msg := regexp_replace(clean_msg, '[^a-z\s]', '', 'g');

  SELECT word INTO matched
  FROM blocked_words
  WHERE clean_msg ~ ('\m' || regexp_replace(word, '[^a-z]', '', 'g') || '\M')
  LIMIT 1;

  IF matched IS NOT NULL THEN
    RAISE EXCEPTION 'OFFENSIVE_CONTENT: Message contains prohibited language.'
      USING HINT = 'Please keep the conversation respectful.';
  END IF;

  RETURN NEW;
END;
$$;

-- Attach to playdate_messages
DROP TRIGGER IF EXISTS trg_check_playdate_message ON playdate_messages;
CREATE TRIGGER trg_check_playdate_message
  BEFORE INSERT ON playdate_messages
  FOR EACH ROW EXECUTE FUNCTION check_message_content();

-- Attach to event_messages
DROP TRIGGER IF EXISTS trg_check_event_message ON event_messages;
CREATE TRIGGER trg_check_event_message
  BEFORE INSERT ON event_messages
  FOR EACH ROW EXECUTE FUNCTION check_message_content();

-- ── Social posts ──────────────────────────────────────────────────────────────
-- Checks caption column (nullable — skip if null).
CREATE OR REPLACE FUNCTION check_post_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  clean_text text;
  matched    text;
BEGIN
  IF NEW.caption IS NULL OR trim(NEW.caption) = '' THEN
    RETURN NEW;
  END IF;

  clean_text := lower(NEW.caption);
  clean_text := regexp_replace(clean_text, '[@4]',  'a', 'g');
  clean_text := regexp_replace(clean_text, '[3]',   'e', 'g');
  clean_text := regexp_replace(clean_text, '[1!|]', 'i', 'g');
  clean_text := regexp_replace(clean_text, '[0]',   'o', 'g');
  clean_text := regexp_replace(clean_text, '[$5]',  's', 'g');
  clean_text := regexp_replace(clean_text, '[^a-z\s]', '', 'g');

  SELECT word INTO matched
  FROM blocked_words
  WHERE clean_text ~ ('\m' || regexp_replace(word, '[^a-z]', '', 'g') || '\M')
  LIMIT 1;

  IF matched IS NOT NULL THEN
    RAISE EXCEPTION 'OFFENSIVE_CONTENT: Post contains prohibited language.'
      USING HINT = 'Please keep posts respectful.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_social_post ON social_posts;
CREATE TRIGGER trg_check_social_post
  BEFORE INSERT OR UPDATE OF caption ON social_posts
  FOR EACH ROW EXECUTE FUNCTION check_post_content();

-- ── Post comments ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_comment_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  clean_text text;
  matched    text;
BEGIN
  clean_text := lower(NEW.body);
  clean_text := regexp_replace(clean_text, '[@4]',  'a', 'g');
  clean_text := regexp_replace(clean_text, '[3]',   'e', 'g');
  clean_text := regexp_replace(clean_text, '[1!|]', 'i', 'g');
  clean_text := regexp_replace(clean_text, '[0]',   'o', 'g');
  clean_text := regexp_replace(clean_text, '[$5]',  's', 'g');
  clean_text := regexp_replace(clean_text, '[^a-z\s]', '', 'g');

  SELECT word INTO matched
  FROM blocked_words
  WHERE clean_text ~ ('\m' || regexp_replace(word, '[^a-z]', '', 'g') || '\M')
  LIMIT 1;

  IF matched IS NOT NULL THEN
    RAISE EXCEPTION 'OFFENSIVE_CONTENT: Comment contains prohibited language.'
      USING HINT = 'Please keep comments respectful.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_post_comment ON post_comments;
CREATE TRIGGER trg_check_post_comment
  BEFORE INSERT ON post_comments
  FOR EACH ROW EXECUTE FUNCTION check_comment_content();
