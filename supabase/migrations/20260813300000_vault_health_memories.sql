-- ============================================================
-- VAULT HEALTH & MEMORIES MIGRATION
-- Run once: supabase db push  OR  psql $DATABASE_URL < this_file
-- ============================================================

-- family_medications: rich medication tracking per member
-- Supports: parent-assigned, self-entered, grandparent-managed
CREATE TABLE IF NOT EXISTS public.family_medications (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id           text        NOT NULL,
  member_id           text        REFERENCES public.members(id) ON DELETE CASCADE,
  assigned_by         text        REFERENCES public.members(id), -- who created/assigned this entry
  name                text        NOT NULL,
  dosage              text        NOT NULL,                       -- e.g. "500mg", "1 tablet"
  dosage_unit         text        NOT NULL DEFAULT 'tablet',     -- tablet, ml, mg, drop, puff, patch
  frequency           text        NOT NULL DEFAULT 'daily',      -- daily, twice_daily, weekly, as_needed, custom
  frequency_times     jsonb       NOT NULL DEFAULT '["08:00"]',  -- array of HH:MM strings
  days_of_week        jsonb,                                      -- null=every day, or ["Mon","Wed","Fri"]
  start_date          text,                                       -- YYYY-MM-DD
  end_date            text,                                       -- YYYY-MM-DD null=ongoing
  is_ongoing          boolean     NOT NULL DEFAULT true,
  category            text        NOT NULL DEFAULT 'prescription', -- prescription, otc, vitamin, supplement, other
  prescribing_doctor  text,
  pharmacy            text,
  refill_date         text,                                       -- YYYY-MM-DD upcoming refill
  pills_remaining     integer,                                    -- stock count, null=not tracking
  color               text,                                       -- pill color for visual ID
  shape               text,                                       -- round, oval, capsule, …
  instructions        text,                                       -- "take with food", special notes
  reminder_enabled    boolean     NOT NULL DEFAULT true,
  taken_dates         jsonb       NOT NULL DEFAULT '[]',          -- array of YYYY-MM-DD strings (all taken dates)
  taken_date          text,                                       -- ISO date of last taken (quick lookup)
  -- Escalation: alert parent/assigner when not taken on time
  escalation_enabled  boolean     NOT NULL DEFAULT false,
  escalation_after_min integer    NOT NULL DEFAULT 60,            -- minutes after scheduled time before alert fires
  escalation_to       jsonb       NOT NULL DEFAULT '[]',          -- array of member_ids to notify (usually parent)
  last_escalated_at   timestamptz,                                -- prevents duplicate alerts
  notes               text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
ALTER TABLE public.family_medications DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_fam_meds_member ON public.family_medications(member_id);
CREATE INDEX IF NOT EXISTS idx_fam_meds_family ON public.family_medications(family_id);

-- family_vaccines: full immunization records
CREATE TABLE IF NOT EXISTS public.family_vaccines (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id           text        NOT NULL,
  member_id           text        REFERENCES public.members(id) ON DELETE CASCADE,
  added_by            text        REFERENCES public.members(id),
  title               text        NOT NULL,
  vaccine_type        text,                                       -- flu, covid, tdap, mmr, hepatitis_b, …
  date                text        NOT NULL,                       -- date administered (YYYY-MM-DD)
  next_due_date       text,                                       -- YYYY-MM-DD for booster/next dose
  done                boolean     NOT NULL DEFAULT false,
  series_current      integer     DEFAULT 1,                      -- which dose in a series (1, 2, 3…)
  series_total        integer     DEFAULT 1,                      -- total doses in this series
  lot_number          text,                                       -- batch/lot for record
  administered_by     text,                                       -- doctor or pharmacy name
  location            text,                                       -- clinic, CVS, school, etc.
  notes               text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
ALTER TABLE public.family_vaccines DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_fam_vax_member ON public.family_vaccines(member_id);
CREATE INDEX IF NOT EXISTS idx_fam_vax_family ON public.family_vaccines(family_id);

-- family_memories: photo/milestone memory cards
CREATE TABLE IF NOT EXISTS public.family_memories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   text        NOT NULL,
  title       text        NOT NULL,
  description text,
  date        text        NOT NULL,                               -- YYYY-MM-DD
  icon_name   text        NOT NULL DEFAULT 'Image',
  icon_color  text        NOT NULL DEFAULT '#7C3AED',
  tag         text,                                               -- vacation, milestone, birthday, achievement, etc.
  hearts      integer     NOT NULL DEFAULT 0,
  hearted_by  jsonb       NOT NULL DEFAULT '[]',                  -- array of member_ids who hearted
  photo_url   text,                                               -- optional photo storage URL
  created_by  text        REFERENCES public.members(id),
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE public.family_memories DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_fam_mem_family ON public.family_memories(family_id);

-- member_locations: ensure extended columns exist (safe no-op if already present)
ALTER TABLE public.member_locations
  ADD COLUMN IF NOT EXISTS status_text    text,
  ADD COLUMN IF NOT EXISTS safe_zone_name text;

-- global_med_suggestions: crowd-sourced medication name suggestions across all families
CREATE TABLE IF NOT EXISTS public.global_med_suggestions (
  name      text        PRIMARY KEY,
  category  text        NOT NULL DEFAULT 'other',
  hint      text,
  use_count integer     NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.global_med_suggestions DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_gms_category ON public.global_med_suggestions(category);

-- RPC to upsert a med suggestion and increment use_count atomically
CREATE OR REPLACE FUNCTION public.upsert_med_suggestion(
  p_name     text,
  p_category text,
  p_hint     text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.global_med_suggestions (name, category, hint, use_count, updated_at)
  VALUES (p_name, p_category, COALESCE(p_hint, p_category), 1, now())
  ON CONFLICT (name) DO UPDATE
    SET use_count  = global_med_suggestions.use_count + 1,
        updated_at = now();
END;
$$;
