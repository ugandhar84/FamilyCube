-- Flash bonus columns on quests
-- bonus_coins: extra coins added by parent for urgency; 0 = no bonus
-- bonus_expires_at: when the bonus expires; null = permanent until manually removed

ALTER TABLE public.quests
  ADD COLUMN IF NOT EXISTS bonus_coins      int          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_expires_at timestamptz;

-- Index so cron / client can efficiently sweep expired bonuses
CREATE INDEX IF NOT EXISTS idx_quests_bonus_expires
  ON public.quests (bonus_expires_at)
  WHERE bonus_expires_at IS NOT NULL;
