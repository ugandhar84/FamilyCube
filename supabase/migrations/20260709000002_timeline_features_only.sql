-- Timeline features (Pro-only)
-- Stores AI-analyzed timeline entries and shareable links

CREATE TABLE IF NOT EXISTS pet_timelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  event_date date NOT NULL,
  category text NOT NULL, -- e.g., 'milestone', 'health', 'achievement', 'moment'
  photo_url text,
  is_pinned boolean DEFAULT false,
  created_at timestamp DEFAULT NOW(),
  updated_at timestamp DEFAULT NOW(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pet_timelines_pet_id ON pet_timelines(pet_id);
CREATE INDEX IF NOT EXISTS idx_pet_timelines_event_date ON pet_timelines(event_date DESC);

-- Shareable timeline links (Pro-only, family view)
CREATE TABLE IF NOT EXISTS timeline_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  share_token text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamp,
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT NOW(),
  accessed_at timestamp
);

CREATE INDEX IF NOT EXISTS idx_timeline_shares_pet_id ON timeline_shares(pet_id);
CREATE INDEX IF NOT EXISTS idx_timeline_shares_token ON timeline_shares(share_token);

-- Timeline generation metadata (Pro-only)
CREATE TABLE IF NOT EXISTS timeline_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  generated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ai_provider text NOT NULL, -- 'deepseek' or 'gemini'
  prompt_tokens integer,
  completion_tokens integer,
  cost_usd numeric(10, 6),
  success boolean DEFAULT true,
  error_msg text,
  created_at timestamp DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timeline_generations_pet_id ON timeline_generations(pet_id);
