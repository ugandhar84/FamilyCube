-- Rainbow Bridge memorial mode
-- Adds status column to pets: 'active' (default) | 'memorial'
-- Memorial pets are read-only: data preserved, write paths blocked, no notifications.
-- Free-tier memorial pets expire after 30 days (enforced in app layer, not DB).

ALTER TABLE pets
  ADD COLUMN IF NOT EXISTS status        text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'memorial')),
  ADD COLUMN IF NOT EXISTS memorial_reason text,          -- passed_away | rehomed | lost | other
  ADD COLUMN IF NOT EXISTS memorial_at   timestamptz;    -- when the status was set

-- Backfill: existing rows that are soft-deleted (is_active=false) stay as-is.
-- Active pets default to 'active' via the column default — no UPDATE needed.

-- Index so fetchPets can filter status efficiently alongside is_active.
CREATE INDEX IF NOT EXISTS idx_pets_owner_status
  ON pets (owner_id, status, is_active);
