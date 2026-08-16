-- Kid Requests table for Family Cube
-- Tracks all kid-initiated requests: questions, permissions, medications, check-ins, grocery, supplies

CREATE TABLE IF NOT EXISTS kid_requests (
  id                text PRIMARY KEY,
  family_id         text NOT NULL,
  from_member_id    text NOT NULL,
  to_member_id      text,
  type              text NOT NULL CHECK (type IN ('question', 'permission', 'medication', 'checkin', 'delegation', 'grocery', 'supplies')),
  urgency           text NOT NULL CHECK (urgency IN ('low', 'medium', 'high')),
  detail            text NOT NULL,
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'rejected', 'partial', 'cancelled', 'done')),
  items             jsonb,  -- array of { id, name, category, qty, emoji, status, parentNote, approvedBy, rejectedBy, approvedAt, rejectedAt }
  requested_at      timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz,
  read_at           timestamptz,
  responded_at      timestamptz,
  responded_by      text,  -- member_id of parent who responded
  parent_note       text,  -- optional reply text from parent
  attachment_url    text,
  assigned_helper   text,
  reward_coins      integer,
  scheduled_date    date,
  scheduled_time    text,
  open_to_gp        boolean DEFAULT false,  -- GP Welcome flag for grocery/supplies requests
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- RLS policies
ALTER TABLE kid_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Family members can read kid requests"
  ON kid_requests FOR SELECT USING (true);

CREATE POLICY "Family members can insert kid requests"
  ON kid_requests FOR INSERT WITH CHECK (true);

CREATE POLICY "Family members can update kid requests"
  ON kid_requests FOR UPDATE USING (true);

CREATE POLICY "Family members can delete their own kid requests"
  ON kid_requests FOR DELETE USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_kid_requests_family ON kid_requests(family_id);
CREATE INDEX IF NOT EXISTS idx_kid_requests_from_member ON kid_requests(from_member_id);
CREATE INDEX IF NOT EXISTS idx_kid_requests_status ON kid_requests(status);
CREATE INDEX IF NOT EXISTS idx_kid_requests_responded_at ON kid_requests(responded_at);
CREATE INDEX IF NOT EXISTS idx_kid_requests_type ON kid_requests(type);

-- Seed data for testing
INSERT INTO kid_requests (
  id, family_id, from_member_id, type, urgency, detail, status, requested_at
) VALUES (
  'kreq_seed_1', 'family-1', 'kid-1', 'permission', 'high',
  'Can I go to the park with friends after school?', 'pending', now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO kid_requests (
  id, family_id, from_member_id, type, urgency, detail, status, responded_at, responded_by, parent_note, requested_at
) VALUES (
  'kreq_seed_2', 'family-1', 'kid-2', 'question', 'medium',
  'What time is dinner tonight?', 'approved', now() - interval '30 minutes', 'parent-2', '6:30 PM, honey!', now() - interval '1 hour'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO kid_requests (
  id, family_id, from_member_id, type, urgency, detail, status, 
  items, responded_at, responded_by, requested_at, open_to_gp
) VALUES (
  'kreq_seed_3', 'family-1', 'kid-1', 'grocery', 'medium',
  'Grocery request from Leo', 'partial',
  '[
    {"id": "gi1", "name": "Milk", "category": "Dairy", "qty": "1 gal", "status": "approved", "approvedBy": "parent-1", "approvedAt": "' || (now() - interval '15 minutes')::text || '"},
    {"id": "gi2", "name": "Cookies", "category": "Snacks", "qty": "2", "status": "rejected", "rejectedBy": "parent-2", "rejectedAt": "' || (now() - interval '15 minutes')::text || '", "parentNote": "We have cookies at home"},
    {"id": "gi3", "name": "Bread", "category": "Bakery", "qty": "1 loaf", "status": "pending"}
  ]'::jsonb,
  now() - interval '20 minutes', 'parent-1', now() - interval '2 hours', true
) ON CONFLICT (id) DO NOTHING;

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_kid_requests_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER kid_requests_updated_at
  BEFORE UPDATE ON kid_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_kid_requests_timestamp();
