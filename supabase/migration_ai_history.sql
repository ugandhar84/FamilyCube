-- ── Vet-chat sessions ────────────────────────────────────────────────────────
-- One row per conversation; messages stored as jsonb array.
CREATE TABLE IF NOT EXISTS vet_chat_sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pet_id     uuid REFERENCES pets(id) ON DELETE SET NULL,
  messages   jsonb NOT NULL DEFAULT '[]',  -- [{role,text,ts}]
  summary    text,                          -- first user message (preview)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vet_chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vet_chat_owner" ON vet_chat_sessions
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS vet_chat_sessions_user_pet
  ON vet_chat_sessions (user_id, pet_id, updated_at DESC);

-- ── Symptom-scan results ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS symptom_scan_results (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pet_id         uuid REFERENCES pets(id) ON DELETE SET NULL,
  symptoms_text  text,
  photo_url      text,    -- public URL if a photo was attached
  urgency        text,    -- emergency | see_vet_soon | monitor | normal
  result         jsonb NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE symptom_scan_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scan_results_owner" ON symptom_scan_results
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS symptom_scan_pet
  ON symptom_scan_results (user_id, pet_id, created_at DESC);
