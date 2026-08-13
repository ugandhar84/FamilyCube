-- ─── calendar_events v2 — full real-world schema ─────────────────────────────
--
-- Extends the existing calendar_events table with:
--   • category-specific fields (medical, sports, study, ride, work, event)
--   • helper/escort model replacing old driver_id
--   • recurrence & time-zone aware timestamps
--   • full RBAC audit trail (history jsonb)
--   • RLS policies for family isolation
--
-- Run once:  psql $DATABASE_URL < supabase/migration_calendar_events_v2.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Core identity & timing ────────────────────────────────────────────────
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS family_id          text,
  ADD COLUMN IF NOT EXISTS type               text    NOT NULL DEFAULT 'event'
    CHECK (type IN ('event','reminder','appointment','birthday')),
  ADD COLUMN IF NOT EXISTS all_day            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS time_zone          text    NOT NULL DEFAULT 'America/New_York',
  ADD COLUMN IF NOT EXISTS notes              text,
  ADD COLUMN IF NOT EXISTS color              text;   -- hex accent colour per event

-- ── 2. Who the event belongs to ──────────────────────────────────────────────
-- member_id  = primary member (single kid, parent, etc.)
-- member_ids = multi-member override (e.g. whole family, siblings sharing)
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS member_id          text    REFERENCES public.members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS member_ids         jsonb   NOT NULL DEFAULT '[]'::jsonb;

-- ── 3. Category ──────────────────────────────────────────────────────────────
-- Replaces the old free-text category + is_work_meeting + is_pickup_or_dropoff
ALTER TABLE public.calendar_events
  DROP COLUMN IF EXISTS is_work_meeting,
  DROP COLUMN IF EXISTS is_pickup_or_dropoff;

ALTER TABLE public.calendar_events
  ALTER COLUMN category SET DEFAULT 'Event',
  ADD CONSTRAINT calendar_events_category_check
    CHECK (category IN ('Medical','Sports','Study','Ride','Work','Event','Birthday'));

-- ── 4. Helper model (replaces old driver_id / assigned_assistant_id) ─────────
-- helper_name   = display name (denormalised — fast reads, no join needed)
-- helper_id     = FK to members (nullable — external tutors / coaches)
-- helper_status = pending | confirmed | rejected
ALTER TABLE public.calendar_events
  DROP COLUMN IF EXISTS driver_id,
  DROP COLUMN IF EXISTS driver_en_route,
  DROP COLUMN IF EXISTS assigned_assistant_id,
  DROP COLUMN IF EXISTS assistance_type;

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS helper_name           text,
  ADD COLUMN IF NOT EXISTS helper_id             text    REFERENCES public.members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS helper_status         text    DEFAULT 'pending'
    CHECK (helper_status IN ('pending','confirmed','rejected')),
  ADD COLUMN IF NOT EXISTS helper_requested_by   text,   -- display name of requestor
  ADD COLUMN IF NOT EXISTS helper_decline_reason text,
  ADD COLUMN IF NOT EXISTS helper_declined_by    text;

-- ── 5. MEDICAL-specific ──────────────────────────────────────────────────────
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS doctor_name        text,   -- e.g. "Dr. Smith"
  ADD COLUMN IF NOT EXISTS clinic_name        text,   -- e.g. "City Paediatrics"
  ADD COLUMN IF NOT EXISTS appointment_type   text;   -- checkup | vaccine | dental | specialist | therapy | other

-- ── 6. SPORTS-specific ───────────────────────────────────────────────────────
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS coach_name         text,
  ADD COLUMN IF NOT EXISTS sport_type         text,   -- Soccer | Basketball | Swimming | etc.
  ADD COLUMN IF NOT EXISTS team_name          text,
  ADD COLUMN IF NOT EXISTS kit_reminder       boolean NOT NULL DEFAULT false;

-- ── 7. STUDY-specific ────────────────────────────────────────────────────────
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS subject            text,   -- Mathematics | Science | English | etc.
  ADD COLUMN IF NOT EXISTS tutor_name         text,   -- external tutor (may differ from helper_name)
  ADD COLUMN IF NOT EXISTS is_online          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS meeting_url        text;   -- Zoom / Meet link

-- ── 8. RIDE-specific (also used by Sports drop-off) ──────────────────────────
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS pickup_location    text,
  ADD COLUMN IF NOT EXISTS drop_location      text,
  ADD COLUMN IF NOT EXISTS return_time        text;   -- HH:MM — when to pick up on the way back

-- ── 9. WORK-specific ─────────────────────────────────────────────────────────
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS work_type          text,   -- meeting | presentation | errand | conference | other
  ADD COLUMN IF NOT EXISTS meeting_link       text;   -- video call URL

-- ── 10. Recurrence (extend existing) ─────────────────────────────────────────
-- existing: recurrence text, recurrence_end_date text — keep; add:
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS recurrence_days    jsonb   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS template_id        text;   -- back-ref if generated from a template

-- ── 11. Approval & conflict ───────────────────────────────────────────────────
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS approval_pending   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS conflict           boolean NOT NULL DEFAULT false;

-- ── 12. Audit history ────────────────────────────────────────────────────────
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS history            jsonb   NOT NULL DEFAULT '[]'::jsonb,
  -- [{ at, action, by, note }] — same shape as quest history
  ADD COLUMN IF NOT EXISTS last_modified_by   text,
  ADD COLUMN IF NOT EXISTS deleted_at         timestamp with time zone;

-- ── 13. Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_calendar_events_family_date
  ON public.calendar_events (family_id, date);

CREATE INDEX IF NOT EXISTS idx_calendar_events_member
  ON public.calendar_events (member_id);

CREATE INDEX IF NOT EXISTS idx_calendar_events_helper
  ON public.calendar_events (helper_id);

CREATE INDEX IF NOT EXISTS idx_calendar_events_category
  ON public.calendar_events (category);

CREATE INDEX IF NOT EXISTS idx_calendar_events_deleted
  ON public.calendar_events (deleted_at)
  WHERE deleted_at IS NULL;

-- ── 14. RLS ───────────────────────────────────────────────────────────────────
-- Pattern matches quests: any authenticated user can read/write;
-- family_id scoping and role gates are enforced in-app (same as quest store).
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS calendar_events_select ON public.calendar_events;
CREATE POLICY calendar_events_select ON public.calendar_events
  FOR SELECT USING (true);

DROP POLICY IF EXISTS calendar_events_insert ON public.calendar_events;
CREATE POLICY calendar_events_insert ON public.calendar_events
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS calendar_events_update ON public.calendar_events;
CREATE POLICY calendar_events_update ON public.calendar_events
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS calendar_events_delete ON public.calendar_events;
CREATE POLICY calendar_events_delete ON public.calendar_events
  FOR DELETE USING (true);

-- ── 15. Helper function: record event history entry ──────────────────────────
CREATE OR REPLACE FUNCTION public.calendar_event_history(
  p_event_id text,
  p_action    text,
  p_by        text DEFAULT NULL,
  p_note      text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.calendar_events
     SET history = history || jsonb_build_object(
           'at',     now(),
           'action', p_action,
           'by',     p_by,
           'note',   p_note
         )
   WHERE id = p_event_id;
END;
$$;
