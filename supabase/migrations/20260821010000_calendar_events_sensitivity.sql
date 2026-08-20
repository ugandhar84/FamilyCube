-- Scenarios 2.6 / 2.10 / 5.4 / 5.5 — Privacy/sensitivity tagging for
-- calendar events.
--
-- calendar_events.privacy_level: 'normal' (default) | 'private'. An
-- explicit privacy tag a creator sets (2.6 medical appointment, 5.4 teen's
-- own social plan). A Medical-category event is ALSO treated as sensitive
-- regardless of this column (5.5's blanket rule) — see
-- store/eventStore.ts's isEventSensitive(), the one shared predicate every
-- visibility filter in the app calls.
--
-- Named privacy_level, NOT sensitivity: calendar_events already has a
-- `sensitivity` column from 20260817150000_responsibility_engine_phase1.sql
-- (a Responsibility Engine field, 4-value enum routine/important/sensitive/
-- high_risk, for fairness/effort scoring — an unrelated purpose). The
-- original version of this migration collided with that column name and
-- attempted to add an incompatible 2-value CHECK constraint on top of
-- existing 'routine'-tagged rows, which failed outright
-- (calendar_events_sensitivity_check already exists with the other enum).
-- Using a distinct column name avoids corrupting or renaming the existing
-- Responsibility Engine field.
--
-- calendar_events.shared_with_gp_for_care: explicit per-event override so
-- a parent can share ONE sensitive/medical event with GP for a specific
-- caregiving occasion (5.5's "GP is babysitting and needs the medication
-- schedule" case) without lifting privacy generally.

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS privacy_level text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS shared_with_gp_for_care boolean NOT NULL DEFAULT false;

ALTER TABLE public.calendar_events
  DROP CONSTRAINT IF EXISTS calendar_events_privacy_level_check;
ALTER TABLE public.calendar_events
  ADD CONSTRAINT calendar_events_privacy_level_check
  CHECK (privacy_level IN ('normal', 'private'));
