-- Playdate Meetings Table
-- Stores accepted playdate meetings with scheduled dates and times
-- Supports reminder scheduling (1 day before, 3 hours before)

CREATE TABLE IF NOT EXISTS playdate_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playdate_request_id uuid NOT NULL REFERENCES playdate_requests(id) ON DELETE CASCADE,
  from_pet_id uuid NOT NULL REFERENCES pets(id),
  to_pet_id uuid NOT NULL REFERENCES pets(id),
  from_owner_id uuid NOT NULL REFERENCES auth.users(id),
  to_owner_id uuid NOT NULL REFERENCES auth.users(id),

  -- Meeting details
  scheduled_date date NOT NULL,
  scheduled_time time,
  meeting_location text,
  meeting_notes text,

  -- Reminder tracking
  reminder_1day_sent boolean DEFAULT false,
  reminder_3hour_sent boolean DEFAULT false,

  -- Status tracking
  status text DEFAULT 'confirmed',  -- confirmed, rescheduled, cancelled, completed
  cancelled_by uuid REFERENCES auth.users(id),
  cancelled_at timestamp,
  completed_at timestamp,

  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Indexes for queries
CREATE INDEX IF NOT EXISTS idx_playdate_meetings_from_owner ON playdate_meetings(from_owner_id);
CREATE INDEX IF NOT EXISTS idx_playdate_meetings_to_owner ON playdate_meetings(to_owner_id);
CREATE INDEX IF NOT EXISTS idx_playdate_meetings_scheduled_date ON playdate_meetings(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_playdate_meetings_status ON playdate_meetings(status);

-- RLS Policy: Users can view their own playdate meetings
ALTER TABLE playdate_meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own playdate meetings" ON playdate_meetings;
CREATE POLICY "Users can view own playdate meetings"
  ON playdate_meetings FOR SELECT
  USING (from_owner_id = auth.uid() OR to_owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own playdate meetings" ON playdate_meetings;
CREATE POLICY "Users can update own playdate meetings"
  ON playdate_meetings FOR UPDATE
  USING (from_owner_id = auth.uid() OR to_owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can cancel playdate meetings" ON playdate_meetings;
CREATE POLICY "Users can cancel playdate meetings"
  ON playdate_meetings FOR UPDATE
  USING (from_owner_id = auth.uid() OR to_owner_id = auth.uid())
  WITH CHECK (status = 'cancelled' AND cancelled_by = auth.uid());
