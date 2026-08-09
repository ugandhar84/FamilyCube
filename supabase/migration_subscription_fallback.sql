-- Track what tier a user should fall back to when a higher-tier subscription expires.
-- Free → Pro → expires → free
-- Free → Ultimate → expires → free
-- Pro → Ultimate → expires → pro  (keeps Pro, doesn't lose everything)
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS fallback_tier text NOT NULL DEFAULT 'free';
