-- ═══════════════════════════════════════════════════════════════════════════
-- migration_playdate_redesign.sql
-- Playdates v2 — full schema redesign.
--
-- What changes:
--   1. playdate_requests: add owner_id columns, proposal fields, agreed-terms
--      fields, expiry, reminders, completion tracking. Expand status enum.
--      Drop hard UNIQUE constraint; add partial index for active-only dedup.
--   2. Create playdate_proposals (structured negotiation log, replaces free-text).
--   3. Create playdate_blocks (pet-level block / auto-block after repeat declines).
--   4. Add responder_user_id to playdate_requests (who actually accepted/declined).
--   5. Update RLS on playdate_requests.
--   6. Expand notification_logs type constraint with new playdate types.
--
-- Safe to run repeatedly (all statements use IF NOT EXISTS / DROP IF EXISTS).
-- Run AFTER deploying the new playdates edge function.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. playdate_requests ───────────────────────────────────────────────────

-- Drop the hard unique constraint that permanently blocks a pet pair after one decline.
-- We replace it with a partial unique index (active statuses only) below.
ALTER TABLE playdate_requests
  DROP CONSTRAINT IF EXISTS playdate_requests_from_pet_id_to_pet_id_key;

-- Also drop the old partial index from migration_playdate_dedup.sql (we replace it).
DROP INDEX IF EXISTS uq_playdate_requests_active_pair;

-- Denormalised owner IDs — avoid RLS join-through-pets on every query.
ALTER TABLE playdate_requests
  ADD COLUMN IF NOT EXISTS from_owner_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS to_owner_id   uuid REFERENCES auth.users(id);

-- Backfill from pets table for existing rows.
UPDATE playdate_requests r
SET
  from_owner_id = fp.owner_id,
  to_owner_id   = tp.owner_id
FROM pets fp, pets tp
WHERE fp.id = r.from_pet_id
  AND tp.id = r.to_pet_id
  AND (r.from_owner_id IS NULL OR r.to_owner_id IS NULL);

-- Now make them NOT NULL (safe after backfill).
ALTER TABLE playdate_requests
  ALTER COLUMN from_owner_id SET NOT NULL,
  ALTER COLUMN to_owner_id   SET NOT NULL;

-- Initial proposal fields — required for all new requests; nullable for legacy rows.
ALTER TABLE playdate_requests
  ADD COLUMN IF NOT EXISTS proposed_date     date,
  ADD COLUMN IF NOT EXISTS proposed_time     time,
  ADD COLUMN IF NOT EXISTS proposed_location text;

-- Agreed terms — populated when status transitions to 'accepted'.
ALTER TABLE playdate_requests
  ADD COLUMN IF NOT EXISTS agreed_date     date,
  ADD COLUMN IF NOT EXISTS agreed_time     time,
  ADD COLUMN IF NOT EXISTS agreed_location text;

-- Auto-expiry: 7 days from creation for pending requests.
ALTER TABLE playdate_requests
  ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT now() + interval '7 days';

-- Reminder flags (moved from playdate_chats; reset to false when rescheduled).
ALTER TABLE playdate_requests
  ADD COLUMN IF NOT EXISTS reminder_1day_sent  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_3hour_sent boolean DEFAULT false;

-- Completion tracking (v2): both parties must confirm for 'completed' status.
ALTER TABLE playdate_requests
  ADD COLUMN IF NOT EXISTS from_confirmed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS to_confirmed   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS completed_at   timestamptz;

-- Who actually performed the last status transition (accept/decline/cancel).
ALTER TABLE playdate_requests
  ADD COLUMN IF NOT EXISTS responder_user_id uuid REFERENCES auth.users(id);

-- updated_at for realtime change detection.
ALTER TABLE playdate_requests
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Expand status: add scheduling, withdrawn, expired, cancelled.
-- Drop old constraint first.
ALTER TABLE playdate_requests
  DROP CONSTRAINT IF EXISTS playdate_requests_status_check;
ALTER TABLE playdate_requests
  ADD CONSTRAINT playdate_requests_status_check
    CHECK (status IN (
      'pending',      -- A sent request, waiting for B
      'scheduling',   -- at least one counter-proposal made, negotiating
      'accepted',     -- both agreed on date/time/place
      'declined',     -- B (or A) explicitly declined  ← terminal
      'withdrawn',    -- A withdrew before B responded  ← terminal
      'expired',      -- auto-expired by cron           ← terminal
      'cancelled'     -- cancelled after acceptance     ← terminal
    ));

-- Partial unique index: only ONE active request per ordered pet pair.
-- Terminal rows stay as history and do NOT block a new request.
CREATE UNIQUE INDEX IF NOT EXISTS uq_playdate_requests_active_pair
  ON playdate_requests (from_pet_id, to_pet_id)
  WHERE status IN ('pending', 'scheduling', 'accepted');

-- updated_at trigger.
CREATE OR REPLACE FUNCTION _playdate_request_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_playdate_requests_updated_at ON playdate_requests;
CREATE TRIGGER trg_playdate_requests_updated_at
  BEFORE UPDATE ON playdate_requests
  FOR EACH ROW EXECUTE FUNCTION _playdate_request_touch_updated_at();

-- ── 2. playdate_proposals ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS playdate_proposals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Which negotiation this belongs to
  request_id uuid NOT NULL REFERENCES playdate_requests(id) ON DELETE CASCADE,

  -- Who proposed
  proposed_by_pet_id   uuid NOT NULL REFERENCES pets(id),
  proposed_by_owner_id uuid NOT NULL REFERENCES auth.users(id),

  -- What they proposed
  proposed_date     date NOT NULL,
  proposed_time     time NOT NULL,
  proposed_location text NOT NULL,

  -- What happened to this proposal:
  --   pending    = awaiting response from the other side
  --   accepted   = other side accepted → request.status → accepted
  --   declined   = other side declined → request.status → declined
  --   superseded = a new proposal was made before this one was answered
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'superseded')),

  -- Negotiation depth: 1 = A's initial, 2 = first counter, 3 = second counter, …
  round int NOT NULL DEFAULT 1,

  created_at timestamptz DEFAULT now()
);

-- DB-level guarantee: at most ONE pending proposal per request at any time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_playdate_proposals_one_pending
  ON playdate_proposals (request_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_playdate_proposals_request
  ON playdate_proposals (request_id, created_at DESC);

ALTER TABLE playdate_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Parties can view their proposals" ON playdate_proposals;
CREATE POLICY "Parties can view their proposals"
  ON playdate_proposals FOR SELECT
  USING (
    request_id IN (
      SELECT id FROM playdate_requests
      WHERE from_owner_id = auth.uid() OR to_owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Parties can insert proposals" ON playdate_proposals;
CREATE POLICY "Parties can insert proposals"
  ON playdate_proposals FOR INSERT
  WITH CHECK (
    proposed_by_owner_id = auth.uid()
    AND request_id IN (
      SELECT id FROM playdate_requests
      WHERE from_owner_id = auth.uid() OR to_owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Parties can update own proposals" ON playdate_proposals;
CREATE POLICY "Parties can update own proposals"
  ON playdate_proposals FOR UPDATE
  USING (
    request_id IN (
      SELECT id FROM playdate_requests
      WHERE from_owner_id = auth.uid() OR to_owner_id = auth.uid()
    )
  );

-- ── 3. playdate_blocks ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS playdate_blocks (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  blocker_pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  blocked_pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  reason         text NOT NULL DEFAULT 'manual'
    CHECK (reason IN ('manual', 'auto_repeated_decline')),
  created_at     timestamptz DEFAULT now(),
  UNIQUE (blocker_pet_id, blocked_pet_id)
);

ALTER TABLE playdate_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Pet members can manage own blocks" ON playdate_blocks;
CREATE POLICY "Pet members can manage own blocks"
  ON playdate_blocks FOR ALL
  USING (is_pet_member(blocker_pet_id));

-- ── 4. RLS — playdate_requests (tighten to use denorm owner columns) ───────

DROP POLICY IF EXISTS "Pet members can manage playdate_requests" ON playdate_requests;

DROP POLICY IF EXISTS "Parties can view playdate_requests" ON playdate_requests;
CREATE POLICY "Parties can view playdate_requests"
  ON playdate_requests FOR SELECT
  USING (from_owner_id = auth.uid() OR to_owner_id = auth.uid());

DROP POLICY IF EXISTS "Requesters can insert playdate_requests" ON playdate_requests;
CREATE POLICY "Requesters can insert playdate_requests"
  ON playdate_requests FOR INSERT
  WITH CHECK (from_owner_id = auth.uid());

DROP POLICY IF EXISTS "Parties can update playdate_requests" ON playdate_requests;
CREATE POLICY "Parties can update playdate_requests"
  ON playdate_requests FOR UPDATE
  USING (from_owner_id = auth.uid() OR to_owner_id = auth.uid());

-- ── 5. notification_logs — add new playdate notification types ─────────────

ALTER TABLE notification_logs
  DROP CONSTRAINT IF EXISTS notification_logs_type_check;

ALTER TABLE notification_logs
  ADD CONSTRAINT notification_logs_type_check CHECK (type IN (
    -- core
    'lost_alert', 'pet_found', 'appointment_reminder', 'medication_reminder',
    'invite', 'family_update', 'system',
    -- social
    'post_like', 'post_comment', 'follow', 'mention',
    -- playdates v2
    'playdate_request',           -- A sends initial request to B
    'playdate_counter_proposal',  -- either side counter-proposes a new date/time
    'playdate_accepted',          -- either side accepts a proposal → agreed
    'playdate_declined',          -- either side declines at request/scheduling stage
    'playdate_withdrawal',        -- A withdraws before B responds
    'playdate_expired',           -- auto-expiry cron fires on a pending request
    'playdate_cancelled',         -- either party cancels an accepted playdate
    'playdate_rescheduled',       -- either party proposes reschedule of accepted playdate
    'playdate_reminder',          -- 1-day and 3-hour reminders
    'playdate_completion',        -- (v2) both parties confirm playdate happened
    -- legacy types (kept for historical rows, no longer emitted)
    'playdate_resend',
    'playdate_confirmed',
    'playdate_proposal',
    'playdate_proposal_declined',
    'playdate_proposal_cancelled',
    -- chat
    'chat_message',
    -- trading alerts
    'trail_sl',
    -- catch-all
    'general'
  ));

-- ── 6. Indexes for common queries ──────────────────────────────────────────

-- Inbox: fetch all active requests where I am the recipient
CREATE INDEX IF NOT EXISTS idx_playdate_requests_to_owner_status
  ON playdate_requests (to_owner_id, status)
  WHERE status IN ('pending', 'scheduling');

-- Carousel: fetch all accepted playdates for a user
CREATE INDEX IF NOT EXISTS idx_playdate_requests_accepted
  ON playdate_requests (from_owner_id, to_owner_id, status)
  WHERE status = 'accepted';

-- Expiry cron: find pending requests past their expiry
CREATE INDEX IF NOT EXISTS idx_playdate_requests_expiry
  ON playdate_requests (expires_at)
  WHERE status = 'pending';

-- ── 7. Enable realtime on new table ────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE playdate_proposals;
ALTER PUBLICATION supabase_realtime ADD TABLE playdate_blocks;

NOTIFY pgrst, 'reload schema';
