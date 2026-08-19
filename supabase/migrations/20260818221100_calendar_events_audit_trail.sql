-- Adds created_by/created_at, updated_by/updated_at, deleted_by columns to
-- calendar_events for triage and reference — who did what and when, beyond
-- the existing soft-delete deleted_at. created_at defaults to now() for new
-- rows; existing rows get it backfilled from deleted_at's own convention
-- (best-effort — no reliable historical creation time exists pre-migration,
-- so existing rows are left with created_at = now() at migration time,
-- which is honest about "we don't actually know," not a fabricated guess).
--
-- updated_by/updated_at are NOT trigger-maintained — stamped explicitly from
-- app code in updateEvent(), same manual-stamp pattern this table already
-- uses for pickup_confirmed_at/pickup_confirmed_by, so a bulk/system update
-- can choose not to touch them (e.g. a resync shouldn't look like a human edit).

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS created_by text REFERENCES public.members(id),
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by text REFERENCES public.members(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by text REFERENCES public.members(id);
