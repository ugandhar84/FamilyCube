-- ═══════════════════════════════════════════════════════════════════════════
-- FamilyCube — Quests table
-- Production-ready: full audit trail, RBAC-ready, scalable, indexed
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Quests ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quests (
  -- Identity
  id                  text        PRIMARY KEY,
  family_id           uuid        REFERENCES public.families(id) ON DELETE CASCADE,

  -- Core fields
  title               text        NOT NULL,
  description         text,
  instructions        text,        -- step-by-step how-to, visible to assignee
  category            text        NOT NULL DEFAULT 'Other'
                        CHECK (category IN (
                          'Kitchen','Room','Yard','School','Pet',
                          'Living Room','Garage','Bathroom','Laundry',
                          'Errand','Tech','Finance','Health','Garden',
                          'Car','Shopping','Cooking','Social','Creative','Other'
                        )),
  priority            text        NOT NULL DEFAULT 'medium'
                        CHECK (priority IN ('low','medium','high','urgent')),

  -- Reward
  coins               integer     NOT NULL DEFAULT 10 CHECK (coins >= 0),
  xp_reward           integer     NOT NULL DEFAULT 10 CHECK (xp_reward >= 0),
  bonus_coins         integer     NOT NULL DEFAULT 0,  -- flash bonus (FOMO engine)
  bonus_expires_at    timestamptz,                     -- when bonus expires

  -- Assignment
  assigned_to_id      text        REFERENCES public.members(id) ON DELETE SET NULL,
  assigned_to_ids     text[]      NOT NULL DEFAULT '{}',  -- multi-assignee display list
  is_pool             boolean     NOT NULL DEFAULT false,  -- true = any kid can claim
  preferred_assignee_id text      REFERENCES public.members(id) ON DELETE SET NULL,

  -- Recurrence
  is_daily            boolean     NOT NULL DEFAULT false,
  recurrence          text        NOT NULL DEFAULT 'once'
                        CHECK (recurrence IN ('once','daily','weekdays','weekly','biweekly','monthly','custom')),
  recurrence_days     integer[]   NOT NULL DEFAULT '{}',   -- 0=Sun..6=Sat for 'custom'
  recurrence_end_date date,
  template_id         text,        -- links recurring instances to their parent template

  -- Lifecycle status
  status              text        NOT NULL DEFAULT 'todo'
                        CHECK (status IN (
                          'todo','claimed','in_progress',
                          'pending_approval','approved','done',
                          'declined','archived','cancelled'
                        )),

  -- Dates & timestamps
  due_date            date,
  due_time            text,        -- HH:MM — optional daily deadline
  started_at          timestamptz,
  claimed_at          timestamptz,
  submitted_at        timestamptz,
  approved_at         timestamptz,
  completed_at        timestamptz,
  declined_at         timestamptz,
  archived_at         timestamptz,
  cancelled_at        timestamptz,

  -- Proof / completion evidence
  photo_required      boolean     NOT NULL DEFAULT false,
  photo_url           text,        -- primary proof photo
  photo_urls          text[]      NOT NULL DEFAULT '{}',  -- multiple proof photos
  video_url           text,
  completion_note     text,        -- kid's note on submission
  submission_location text,        -- optional GPS label (e.g. "at school")

  -- Approval / decline
  approved_by_id      text        REFERENCES public.members(id) ON DELETE SET NULL,
  decline_reason      text,
  decline_reason_code text        CHECK (decline_reason_code IN (
                          'not_done_properly','missing_proof','incomplete_steps',
                          'try_again','wrong_time','custom', NULL
                        )),

  -- Metadata
  tags                text[]      NOT NULL DEFAULT '{}',
  difficulty          text        NOT NULL DEFAULT 'easy'
                        CHECK (difficulty IN ('easy','medium','hard','hero')),
  estimated_minutes   integer     CHECK (estimated_minutes > 0),  -- for kid planning
  age_min             integer     CHECK (age_min >= 0),            -- RBAC age gate
  age_max             integer,

  -- Audit trail (JSON array of QuestHistoryEntry)
  history             jsonb       NOT NULL DEFAULT '[]',

  -- Who made changes
  created_by_id       text        REFERENCES public.members(id) ON DELETE SET NULL,
  last_modified_by_id text        REFERENCES public.members(id) ON DELETE SET NULL,

  -- Grocery-run link (category = Shopping or Errand)
  -- Store the IDs of grocery_items this quest should fulfill.
  -- QuestsScreen can show a mini checklist; on quest approval,
  -- mark those items as bought.
  linked_grocery_ids  text[]      NOT NULL DEFAULT '{}',
  linked_store        text,        -- e.g. "Trader Joe's", "Costco"

  -- Soft delete
  deleted_at          timestamptz,
  deleted_by_id       text        REFERENCES public.members(id) ON DELETE SET NULL,

  -- Timestamps
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ── 2. Auto-update updated_at ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.quests_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_quests_updated_at ON public.quests;
CREATE TRIGGER trg_quests_updated_at
  BEFORE UPDATE ON public.quests
  FOR EACH ROW EXECUTE FUNCTION public.quests_set_updated_at();

-- ── 3. Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_quests_family     ON public.quests(family_id);
CREATE INDEX IF NOT EXISTS idx_quests_assignee   ON public.quests(assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_quests_status     ON public.quests(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_quests_due_date   ON public.quests(due_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_quests_template   ON public.quests(template_id) WHERE template_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quests_created_at ON public.quests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quests_category   ON public.quests(category);
CREATE INDEX IF NOT EXISTS idx_quests_active     ON public.quests(family_id, status, due_date)
  WHERE deleted_at IS NULL AND status NOT IN ('done','archived','cancelled');

-- ── 4. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.quests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quests_select"  ON public.quests;
DROP POLICY IF EXISTS "quests_insert"  ON public.quests;
DROP POLICY IF EXISTS "quests_update"  ON public.quests;
DROP POLICY IF EXISTS "quests_delete"  ON public.quests;

-- Any auth user can read (app filters by family_id)
CREATE POLICY "quests_select" ON public.quests
  FOR SELECT USING (true);

-- Any auth user can insert (app enforces parent/senior gate)
CREATE POLICY "quests_insert" ON public.quests
  FOR INSERT WITH CHECK (true);

-- Any auth user can update (app enforces RBAC per action)
CREATE POLICY "quests_update" ON public.quests
  FOR UPDATE USING (true);

-- Soft-delete preferred; hard-delete allowed by any (app gates to parent)
CREATE POLICY "quests_delete" ON public.quests
  FOR DELETE USING (true);

-- ── 5. Seed data (real member IDs from DB) ────────────────────────────────────
-- Members: Priya (parent) m_1786235893879 | Alex (parent) 62ac7da2-…
--          Leo   (child)  leo-001          | Maya (child)  maya-001
--          Mary  (gp)     senior-001

DO $$
DECLARE
  today_dt  date := CURRENT_DATE;
  tomorrow  date := CURRENT_DATE + 1;
  next_week date := CURRENT_DATE + 7;
BEGIN

-- Clear any old seeds so re-runs are idempotent
DELETE FROM public.quests WHERE id LIKE 'seed-%';

INSERT INTO public.quests
  (id, title, description, instructions, category, priority, coins, xp_reward,
   difficulty, estimated_minutes, photo_required,
   assigned_to_id, is_pool, is_daily, recurrence, status,
   due_date, tags, created_by_id, history)
VALUES
  -- ── Leo's daily chores ──────────────────────────────────────────────────
  ('seed-q1',
   'Wash the dishes', 'After every meal, rinse and stack all dishes.',
   '1. Rinse each dish under warm water. 2. Load the dishwasher. 3. Add detergent pod. 4. Start the cycle.',
   'Kitchen', 'medium', 30, 20, 'easy', 15, false,
   'leo-001', false, true, 'daily', 'todo',
   today_dt, ARRAY['chore','daily','kitchen'], 'm_1786235893879',
   '[{"at":"2026-08-12T09:00:00Z","action":"created","by":"m_1786235893879"},{"at":"2026-08-12T09:00:00Z","action":"assigned","by":"m_1786235893879"}]'),

  ('seed-q2',
   'Take out the trash', 'Empty all bins and bring the big bin to the curb on Wednesday nights.',
   '1. Collect bags from kitchen and bathrooms. 2. Tie bags. 3. Place in outdoor bin. 4. Roll bin to curb.',
   'Yard', 'medium', 25, 15, 'easy', 10, false,
   'leo-001', false, false, 'weekly', 'pending_approval',
   today_dt, ARRAY['chore','weekly','trash'], 'm_1786235893879',
   '[{"at":"2026-08-11T18:00:00Z","action":"created","by":"m_1786235893879"},{"at":"2026-08-11T18:00:00Z","action":"assigned","by":"m_1786235893879"},{"at":"2026-08-12T07:30:00Z","action":"claimed","by":"leo-001"},{"at":"2026-08-12T08:00:00Z","action":"submitted","by":"leo-001"}]'),

  ('seed-q3',
   'Make the bed', 'Every morning before leaving for school.',
   '1. Pull up and straighten the bottom sheet. 2. Smooth the comforter. 3. Arrange pillows neatly.',
   'Room', 'low', 10, 10, 'easy', 5, false,
   'leo-001', false, true, 'daily', 'done',
   today_dt, ARRAY['room','daily','morning'], 'm_1786235893879',
   '[{"at":"2026-08-12T07:00:00Z","action":"created","by":"m_1786235893879"},{"at":"2026-08-12T07:30:00Z","action":"claimed","by":"leo-001"},{"at":"2026-08-12T08:00:00Z","action":"submitted","by":"leo-001"},{"at":"2026-08-12T08:10:00Z","action":"approved","by":"m_1786235893879"}]'),

  ('seed-q4',
   'Homework done', 'Complete all homework before screen time.',
   '1. Write out all assignments in planner. 2. Complete each subject. 3. Pack homework back in bag. 4. Show parent sign-off.',
   'School', 'urgent', 50, 40, 'medium', 60, true,
   'leo-001', false, true, 'weekdays', 'todo',
   today_dt, ARRAY['school','daily','homework'], 'm_1786235893879',
   '[{"at":"2026-08-12T09:00:00Z","action":"created","by":"m_1786235893879"},{"at":"2026-08-12T09:00:00Z","action":"assigned","by":"m_1786235893879"}]'),

  ('seed-q5',
   'Feed the dog', 'Morning and evening — 1 scoop each time. Refill water bowl.',
   '1. Measure 1 cup of kibble. 2. Pour into dog bowl. 3. Refill water bowl with fresh water. 4. Put bag back.',
   'Pet', 'high', 20, 15, 'easy', 5, false,
   'leo-001', false, true, 'daily', 'claimed',
   today_dt, ARRAY['pet','daily','responsibility'], 'm_1786235893879',
   '[{"at":"2026-08-12T07:00:00Z","action":"created","by":"m_1786235893879"},{"at":"2026-08-12T07:00:00Z","action":"assigned","by":"m_1786235893879"},{"at":"2026-08-12T07:15:00Z","action":"claimed","by":"leo-001"}]'),

  -- ── Maya's chores ──────────────────────────────────────────────────────
  ('seed-q6',
   'Clean room & desk', 'Weekly tidy-up — everything off the floor, desk organized.',
   '1. Pick up all items off floor. 2. Put clothes in hamper or drawer. 3. Clear desk surface. 4. Organize bookshelf.',
   'Room', 'medium', 35, 25, 'medium', 20, true,
   'maya-001', false, false, 'weekly', 'todo',
   today_dt, ARRAY['room','weekly'], 'm_1786235893879',
   '[{"at":"2026-08-12T09:00:00Z","action":"created","by":"m_1786235893879"},{"at":"2026-08-12T09:00:00Z","action":"assigned","by":"m_1786235893879"}]'),

  ('seed-q7',
   'Set the dinner table', 'Every evening before dinner — plates, forks, napkins, glasses.',
   '1. Get plates from cabinet. 2. Place fork left, knife+spoon right. 3. Add napkin. 4. Pour water in glasses.',
   'Kitchen', 'medium', 15, 12, 'easy', 8, false,
   'maya-001', false, true, 'daily', 'todo',
   today_dt, ARRAY['kitchen','daily','dinner'], 'm_1786235893879',
   '[{"at":"2026-08-12T09:00:00Z","action":"created","by":"m_1786235893879"},{"at":"2026-08-12T09:00:00Z","action":"assigned","by":"m_1786235893879"}]'),

  ('seed-q8',
   'Water the plants', 'Every Monday and Thursday — check soil before watering.',
   '1. Check if soil feels dry 1 inch down. 2. Water slowly until water drains from pot. 3. Empty drip tray after 30 min.',
   'Garden', 'low', 15, 10, 'easy', 10, false,
   'maya-001', false, false, 'custom', 'todo',
   tomorrow, ARRAY['garden','plants'], 'm_1786235893879',
   '[{"at":"2026-08-12T09:00:00Z","action":"created","by":"m_1786235893879"}]'),

  -- ── Open bounties (any kid can claim) ─────────────────────────────────
  ('seed-q9',
   'Vacuum living room', 'Move furniture, vacuum carpet and edges.',
   '1. Move small chairs/stools to one side. 2. Vacuum entire carpet. 3. Get edges with attachment. 4. Move furniture back.',
   'Living Room', 'medium', 40, 30, 'medium', 25, false,
   NULL, true, false, 'weekly', 'todo',
   tomorrow, ARRAY['chore','bounty','vacuuming'], 'm_1786235893879',
   '[{"at":"2026-08-12T09:00:00Z","action":"created","by":"m_1786235893879"}]'),

  ('seed-q10',
   'Unload dishwasher', 'Put everything back in the right place.',
   '1. Wait for cycle to fully finish. 2. Unload bottom rack first. 3. Unload top rack. 4. Put silverware in drawer sorted.',
   'Kitchen', 'medium', 20, 15, 'easy', 10, false,
   NULL, true, false, 'daily', 'todo',
   today_dt, ARRAY['kitchen','bounty'], 'm_1786235893879',
   '[{"at":"2026-08-12T09:00:00Z","action":"created","by":"m_1786235893879"}]'),

  ('seed-q11',
   'Sort and fold laundry', 'Family laundry pile on the couch — sort and fold into piles by owner.',
   '1. Sort into piles: Mom, Dad, Leo, Maya, and towels. 2. Fold neatly. 3. Stack each pile on the table. (Do NOT put away — just fold.)',
   'Laundry', 'low', 30, 20, 'medium', 30, false,
   NULL, true, false, 'weekly', 'todo',
   next_week, ARRAY['laundry','bounty','folding'], 'm_1786235893879',
   '[{"at":"2026-08-12T09:00:00Z","action":"created","by":"m_1786235893879"}]'),

  -- ── Parent-assigned tasks ─────────────────────────────────────────────
  ('seed-q12',
   'Sort recycling bins', 'Separate paper, plastic, glass, and general recycling.',
   '1. Check each item — recyclable? 2. Sort into correct bin. 3. Flatten cardboard boxes. 4. Rinse food containers.',
   'Garage', 'low', 25, 20, 'easy', 15, false,
   '62ac7da2-3f21-4fe3-acbb-fbe0cb576128', false, false, 'weekly', 'todo',
   today_dt, ARRAY['chore','garage','recycling'], 'm_1786235893879',
   '[{"at":"2026-08-12T09:00:00Z","action":"created","by":"m_1786235893879"}]'),

  -- ── Declined example (Leo sees the reason) ────────────────────────────
  ('seed-q13',
   'Clean bathroom sink', 'Scrub sink, faucet, and counter.',
   '1. Apply cleaning spray. 2. Scrub with sponge — faucet too. 3. Wipe down counter. 4. Rinse. 5. Dry with paper towel.',
   'Bathroom', 'medium', 25, 18, 'easy', 15, true,
   'leo-001', false, false, 'weekly', 'declined',
   today_dt, ARRAY['bathroom','chore'], 'm_1786235893879',
   '[{"at":"2026-08-11T10:00:00Z","action":"created","by":"m_1786235893879"},{"at":"2026-08-11T10:05:00Z","action":"assigned","by":"m_1786235893879"},{"at":"2026-08-11T15:00:00Z","action":"claimed","by":"leo-001"},{"at":"2026-08-11T16:00:00Z","action":"submitted","by":"leo-001"},{"at":"2026-08-11T18:00:00Z","action":"declined","by":"m_1786235893879","note":"Photo proof is missing or unclear"}]');

-- Set declined fields
UPDATE public.quests
SET
  decline_reason      = 'Photo proof is missing or unclear',
  decline_reason_code = 'missing_proof',
  approved_by_id      = 'm_1786235893879',
  declined_at         = now() - interval '18 hours',
  submitted_at        = now() - interval '20 hours',
  claimed_at          = now() - interval '21 hours'
WHERE id = 'seed-q13';

-- Set claimed/submitted fields
UPDATE public.quests
SET claimed_at = now() - interval '1 hour',
    submitted_at = now() - interval '30 minutes'
WHERE id = 'seed-q2';

UPDATE public.quests
SET claimed_at = now() - interval '2 hours'
WHERE id = 'seed-q5';

-- Set done fields
UPDATE public.quests
SET claimed_at = now() - interval '3 hours',
    submitted_at = now() - interval '2 hours',
    completed_at = now() - interval '1 hour',
    approved_by_id = 'm_1786235893879'
WHERE id = 'seed-q3';

END $$;
