-- Help Requests table
CREATE TABLE IF NOT EXISTS help_requests (
  id                   text PRIMARY KEY,
  requester_name       text NOT NULL,
  requester_id         text NOT NULL,
  requester_role       text NOT NULL CHECK (requester_role IN ('kid', 'adult')),
  title                text NOT NULL,
  description          text NOT NULL,
  category             text NOT NULL,
  urgency              text NOT NULL CHECK (urgency IN ('Low', 'Medium', 'High')),
  status               text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','awaiting_acceptance','assigned','completed','rejected','withdrawn')),

  assigned_helper      text,
  assigned_helper_id   text,

  offered_to_ids       text[],
  offered_by_name      text,
  offered_by_id        text,
  offer_note           text,

  last_declined_by_name  text,
  last_decline_comment   text,
  rejected_by_name       text,
  rejection_reason       text,

  reward_coins         int,
  preferred_helper     text,
  date                 date,
  time                 text,
  end_time             text,
  return_time          text,
  ride_mode            text CHECK (ride_mode IN ('pickup','dropoff','roundtrip')),
  from_loc             text,
  to_loc               text,

  family_id            text,          -- optional multi-family scoping
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE help_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "family members can read help requests"
  ON help_requests FOR SELECT USING (true);
CREATE POLICY "family members can insert help requests"
  ON help_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "family members can update help requests"
  ON help_requests FOR UPDATE USING (true);

-- Seed data (matches familyStore seed: parent-1=Alex Dad, parent-2=Priya Mom, kid-1=Leo, kid-2=Maya, senior-1=Grandma Mary)
INSERT INTO help_requests (id, requester_name, requester_id, requester_role, title, description, category, urgency, status, reward_coins)
VALUES (
  'hr_seed_1', 'Leo', 'kid-1', 'kid',
  'Help with math homework',
  'I have a worksheet on fractions due tomorrow and I am stuck on the division problems.',
  'Homework', 'High', 'pending', 20
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO help_requests (id, requester_name, requester_id, requester_role, title, description, category, urgency, status,
  offered_to_ids, offered_by_name, offered_by_id, offer_note, from_loc, to_loc, ride_mode, date, time)
VALUES (
  'hr_seed_2', 'Maya', 'kid-2', 'kid',
  'Ride to the library',
  'Need to return books and pick up my science fair materials by 4 PM.',
  'Ride', 'Medium', 'awaiting_acceptance',
  ARRAY['parent-2'], 'Alex (Dad)', 'parent-1',
  'Priya, can you take her after gym? I have a meeting at 3.',
  'Home', 'Public Library', 'roundtrip',
  CURRENT_DATE, '15:00'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO help_requests (id, requester_name, requester_id, requester_role, title, description, category, urgency, status)
VALUES (
  'hr_seed_3', 'Grandma Mary', 'senior-1', 'adult',
  'Help setting up new tablet',
  'Got a new iPad and need help getting apps set up and connecting to home Wi-Fi.',
  'General', 'Low', 'pending'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO help_requests (id, requester_name, requester_id, requester_role, title, description, category, urgency, status,
  assigned_helper, assigned_helper_id)
VALUES (
  'hr_seed_4', 'Priya (Mom)', 'parent-2', 'adult',
  'Pantry stock check',
  'Go through the pantry and write down what needs restocking before the weekend grocery run.',
  'Errand', 'Medium', 'assigned',
  'Leo', 'kid-1'
)
ON CONFLICT (id) DO NOTHING;

-- Extra seeds for testing the full range of states
INSERT INTO help_requests (id, requester_name, requester_id, requester_role, title, description, category, urgency, status,
  rejected_by_name, rejection_reason)
VALUES (
  'hr_seed_5', 'Maya', 'kid-2', 'kid',
  'Buy me new headphones',
  'I want wireless headphones for gaming.',
  'General', 'Low', 'rejected',
  'Alex (Dad)', 'This is not an urgent family need — we can discuss this at the weekend.'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO help_requests (id, requester_name, requester_id, requester_role, title, description, category, urgency, status,
  assigned_helper, assigned_helper_id)
VALUES (
  'hr_seed_6', 'Leo', 'kid-1', 'kid',
  'Help with science project',
  'I need help building a model of the solar system for Friday.',
  'Homework', 'High', 'completed',
  'Priya (Mom)', 'parent-2'
)
ON CONFLICT (id) DO NOTHING;
