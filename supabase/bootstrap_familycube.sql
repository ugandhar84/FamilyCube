-- ═══════════════════════════════════════════════════════════════════════
-- FamilyCube — bootstrap schema (safe to re-run, all IF NOT EXISTS)
-- Order: families → members → quests → quest_participants → calendar_events
--        + all supporting tables
-- ═══════════════════════════════════════════════════════════════════════

-- ── families ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.families (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  created_by  uuid        REFERENCES auth.users(id),
  created_at  timestamptz DEFAULT now()
);

-- ── members ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.members (
  id            text        PRIMARY KEY,
  name          text        NOT NULL,
  role          text        NOT NULL CHECK (role = ANY(ARRAY['parent','child','kid','grandparent','senior'])),
  avatar        text        NOT NULL DEFAULT '',
  emoji         text,
  avatar_url    text,
  coins         int         DEFAULT 0,
  xp            int         DEFAULT 0,
  level         int         DEFAULT 1,
  max_xp        int         DEFAULT 100,
  streak        int         DEFAULT 0,
  color         text        DEFAULT '#4F46E5',
  title         text        DEFAULT 'Explorer',
  pin           text,
  timezone      text        DEFAULT 'America/New_York',
  custom_badge  text,
  last_active   timestamptz DEFAULT now(),
  family_id     uuid        REFERENCES public.families(id),
  created_at    timestamptz DEFAULT now()
);

-- ── profiles (auth-linked) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id                        uuid        PRIMARY KEY REFERENCES auth.users(id),
  full_name                 text,
  display_name              text,
  handle                    text,
  avatar_url                text,
  email                     text,
  family_role               text        DEFAULT 'parent' CHECK (family_role = ANY(ARRAY['parent','kid','admin'])),
  onboarding_completed      boolean     NOT NULL DEFAULT false,
  terms_accepted            boolean     NOT NULL DEFAULT false,
  terms_accepted_at         timestamptz,
  ai_consent_accepted       boolean     NOT NULL DEFAULT false,
  ai_consent_accepted_at    timestamptz,
  notification_enabled      boolean     DEFAULT true,
  quiet_hours_start         text,
  quiet_hours_end           text,
  is_admin                  boolean     NOT NULL DEFAULT false,
  deleted_at                timestamptz,
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now()
);

-- ── family_invites ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.family_invites (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   uuid        NOT NULL REFERENCES public.families(id),
  code        text        NOT NULL UNIQUE,
  status      text        NOT NULL DEFAULT 'pending' CHECK (status = ANY(ARRAY['pending','accepted','expired'])),
  created_by  uuid        REFERENCES auth.users(id),
  used_by     uuid        REFERENCES auth.users(id),
  expires_at  timestamptz DEFAULT (now() + interval '7 days'),
  created_at  timestamptz DEFAULT now()
);

-- ── quests ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quests (
  id                  text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  family_id           uuid        REFERENCES public.families(id),
  title               text        NOT NULL,
  description         text,
  category            text        NOT NULL DEFAULT 'Other',
  priority            text        NOT NULL DEFAULT 'medium' CHECK (priority = ANY(ARRAY['low','medium','high','urgent'])),
  difficulty          text        CHECK (difficulty = ANY(ARRAY['easy','medium','hard','expert'])),
  coins               int         NOT NULL DEFAULT 30,
  bonus_coins         int         NOT NULL DEFAULT 0,
  bonus_expires_at    timestamptz,
  xp_reward           int         NOT NULL DEFAULT 20,
  status              text        NOT NULL DEFAULT 'todo' CHECK (status = ANY(ARRAY['todo','in_progress','pending_approval','approved','done','declined','cancelled'])),
  assigned_to_id      text        REFERENCES public.members(id),
  assigned_to_ids     text[]      NOT NULL DEFAULT '{}',
  is_pool             boolean     NOT NULL DEFAULT false,
  is_daily            boolean     NOT NULL DEFAULT false,
  is_multi_assign     boolean     NOT NULL DEFAULT false,
  max_claimants       int         DEFAULT 1,
  recurrence          text        NOT NULL DEFAULT 'once',
  recurrence_days     text[],
  due_date            text,
  due_time            text,
  photo_required      boolean     NOT NULL DEFAULT false,
  photo_url           text,
  photo_urls          text[]      NOT NULL DEFAULT '{}',
  completion_note     text,
  decline_reason      text,
  decline_reason_code text,
  bonus_expires_at2   timestamptz, -- kept for compat, use bonus_expires_at
  claimed_at          timestamptz,
  submitted_at        timestamptz,
  approved_at         timestamptz,
  declined_at         timestamptz,
  created_by_id       text        REFERENCES public.members(id),
  last_modified_by_id text        REFERENCES public.members(id),
  approved_by_id      text        REFERENCES public.members(id),
  highest_price       numeric(20,4),
  lowest_price        numeric(20,4),
  tags                text[]      NOT NULL DEFAULT '{}',
  linked_grocery_ids  text[]      NOT NULL DEFAULT '{}',
  t1_price            numeric(20,4),
  t2_price            numeric(20,4),
  t3_price            numeric(20,4),
  sl_price            numeric(20,4),
  history             jsonb       NOT NULL DEFAULT '[]',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quests_family_id   ON public.quests (family_id);
CREATE INDEX IF NOT EXISTS idx_quests_status       ON public.quests (status);
CREATE INDEX IF NOT EXISTS idx_quests_assigned     ON public.quests (assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_quests_bonus_exp    ON public.quests (bonus_expires_at) WHERE bonus_expires_at IS NOT NULL;

-- ── quest_participants ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quest_participants (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id            text        NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  member_id           text        NOT NULL,
  status              text        NOT NULL DEFAULT 'todo' CHECK (status = ANY(ARRAY['todo','in_progress','pending_approval','approved','declined','cancelled'])),
  claimed_at          timestamptz,
  submitted_at        timestamptz,
  approved_at         timestamptz,
  declined_at         timestamptz,
  cancelled_at        timestamptz,
  approved_by_id      text,
  decline_reason      text,
  decline_reason_code text,
  photo_url           text,
  photo_urls          text[]      NOT NULL DEFAULT '{}',
  completion_note     text,
  coins_awarded       int,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quest_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_qp_quest_id  ON public.quest_participants (quest_id);
CREATE INDEX IF NOT EXISTS idx_qp_member_id ON public.quest_participants (member_id);
CREATE INDEX IF NOT EXISTS idx_qp_status    ON public.quest_participants (status);

-- ── calendar_events ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.calendar_events (
  id                    text        PRIMARY KEY,
  family_id             text,
  title                 text        NOT NULL,
  date                  date        NOT NULL,
  start_time            text,
  type                  text        NOT NULL DEFAULT 'event' CHECK (type = ANY(ARRAY['event','reminder','appointment','birthday'])),
  category              text        NOT NULL DEFAULT 'Event',
  color                 text        DEFAULT '#6C5CE7',
  all_day               boolean     NOT NULL DEFAULT false,
  time_zone             text        NOT NULL DEFAULT 'America/New_York',
  notes                 text,
  -- who it's for
  member_id             text        REFERENCES public.members(id),
  member_ids            jsonb       NOT NULL DEFAULT '[]',
  -- location
  location              text,
  -- medical
  doctor_name           text,
  -- sports
  coach_name            text,
  -- study
  subject               text,
  -- ride
  pickup_location       text,
  drop_location         text,
  -- helper / escort
  helper_name           text,
  helper_status         text        DEFAULT 'pending' CHECK (helper_status = ANY(ARRAY['pending','confirmed','rejected'])),
  helper_requested_by   text,
  helper_decline_reason text,
  helper_declined_by    text,
  -- approval
  approval_pending      boolean     NOT NULL DEFAULT false,
  conflict              boolean     NOT NULL DEFAULT false,
  -- recurrence
  recurrence            text        DEFAULT 'none' CHECK (recurrence = ANY(ARRAY['none','daily','weekly','monthly'])),
  recurrence_end_date   date,
  -- audit
  created_by_id         text        REFERENCES public.members(id),
  history               jsonb       NOT NULL DEFAULT '[]',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cal_family_date ON public.calendar_events (family_id, date);
CREATE INDEX IF NOT EXISTS idx_cal_member       ON public.calendar_events (member_id);
CREATE INDEX IF NOT EXISTS idx_cal_date         ON public.calendar_events (date);

-- ── notifications ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   text        REFERENCES public.members(id),
  family_id   uuid,
  type        text        NOT NULL,
  title       text        NOT NULL,
  body        text,
  data        jsonb       DEFAULT '{}',
  read        boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── reward_items ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reward_items (
  id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  family_id   uuid        REFERENCES public.families(id),
  title       text        NOT NULL,
  description text,
  cost        int         NOT NULL DEFAULT 50,
  category    text        DEFAULT 'General',
  icon        text,
  available   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── reward_redemptions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reward_redemptions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_id   text        REFERENCES public.reward_items(id),
  member_id   text        REFERENCES public.members(id),
  status      text        NOT NULL DEFAULT 'pending' CHECK (status = ANY(ARRAY['pending','approved','rejected'])),
  redeemed_at timestamptz NOT NULL DEFAULT now()
);

-- ── chat_messages ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     uuid        REFERENCES public.families(id),
  sender_id     text        REFERENCES public.members(id),
  content       text,
  type          text        NOT NULL DEFAULT 'text' CHECK (type = ANY(ARRAY['text','image','voice','system'])),
  encrypted     boolean     NOT NULL DEFAULT false,
  iv            text,
  media_url     text,
  reply_to_id   uuid        REFERENCES public.chat_messages(id),
  reactions     jsonb       NOT NULL DEFAULT '{}',
  read_by       text[]      NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_family ON public.chat_messages (family_id, created_at DESC);

-- ── grocery_items ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.grocery_items (
  id                  text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  family_id           uuid        REFERENCES public.families(id),
  name                text        NOT NULL,
  quantity            text,
  unit                text,
  category            text,
  checked             boolean     NOT NULL DEFAULT false,
  added_by_member_id  text        REFERENCES public.members(id),
  linked_quest_id     text        REFERENCES public.quests(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ── RLS: enable on all tables (open policies for now — tighten per family later) ──
ALTER TABLE public.families          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_invites    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quests            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grocery_items     ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read/write their own family's data
DO $$ BEGIN
  -- families
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='families' AND policyname='families_auth') THEN
    CREATE POLICY families_auth ON public.families FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  -- members
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='members' AND policyname='members_auth') THEN
    CREATE POLICY members_auth ON public.members FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  -- profiles
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='profiles_auth') THEN
    CREATE POLICY profiles_auth ON public.profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  -- quests
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='quests' AND policyname='quests_auth') THEN
    CREATE POLICY quests_auth ON public.quests FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  -- quest_participants
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='quest_participants' AND policyname='qp_auth') THEN
    CREATE POLICY qp_auth ON public.quest_participants FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  -- calendar_events
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='calendar_events' AND policyname='cal_auth') THEN
    CREATE POLICY cal_auth ON public.calendar_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  -- notifications
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notifications' AND policyname='notif_auth') THEN
    CREATE POLICY notif_auth ON public.notifications FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  -- reward_items
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='reward_items' AND policyname='rewards_auth') THEN
    CREATE POLICY rewards_auth ON public.reward_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  -- reward_redemptions
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='reward_redemptions' AND policyname='redemptions_auth') THEN
    CREATE POLICY redemptions_auth ON public.reward_redemptions FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  -- chat_messages
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chat_messages' AND policyname='chat_auth') THEN
    CREATE POLICY chat_auth ON public.chat_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  -- grocery_items
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='grocery_items' AND policyname='grocery_auth') THEN
    CREATE POLICY grocery_auth ON public.grocery_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  -- family_invites
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='family_invites' AND policyname='invites_auth') THEN
    CREATE POLICY invites_auth ON public.family_invites FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
