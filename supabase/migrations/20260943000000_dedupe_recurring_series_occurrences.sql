-- Live-reported: a recurring drop-off + its linked pickup series each
-- materialized 12 duplicate rows on the SAME date instead of one per
-- weekly occurrence (25 events shown on one Agenda/Month day for what
-- should have been a single drop-off + pickup pair). Root cause wasn't
-- pinned down — every code path that builds a recurring series's
-- occurrence dates (generateOccurrenceDates, addRecurringEvent,
-- extendRecurringSeries in eventStore.ts) was re-checked against the bad
-- rows' own recurrence_rule and reproduces the CORRECT spread-out dates
-- today, so whatever produced 12 identical dates either predates the
-- current code or came from an input this investigation couldn't recover
-- (no request log / audit-trail history table survives that far back).
--
-- Rather than leave the class of bug possible while the exact historical
-- cause stays open, this is a real DB-level guardrail: no recurring
-- series may ever have two non-deleted occurrences on the same date. A
-- one-off events (series_id IS NULL) are untouched — this only
-- constrains rows that belong to a series. Confirmed against production
-- data before adding: zero existing series (other than the two known-bad
-- ones this bug produced) have more than one occurrence on any single
-- date, so this is safe to enforce going forward, not just aspirational.
--
-- Partial + WHERE deleted_at IS NULL (not a plain UNIQUE constraint)
-- because a soft-deleted duplicate must not permanently block a new,
-- legitimate occurrence from later reusing that same (series_id, date)
-- pair — e.g. this very cleanup soft-deleting today's bad rows shouldn't
-- leave that date unusable forever.
--
-- The two known-bad series must be cleaned up first, in this same
-- migration, or CREATE UNIQUE INDEX below fails immediately against the
-- rows this bug already produced. Soft-delete (deleted_at = now()) every
-- non-anchor occurrence that collides with another row on (series_id,
-- date) within a series — for both affected series here that's exactly
-- the 12 identical-date duplicates per series; the anchor row and any
-- occurrence with no same-date collision (the correctly-spread rows a
-- later, working extendRecurringSeries run already added) are untouched.
-- Scoped generally by "loses a same-series/same-date tiebreak" rather
-- than hardcoded IDs, so this also self-heals any other series that
-- turns out to have the same corruption without needing to be found and
-- listed by hand first.
WITH ranked AS (
  SELECT id, series_id, date, is_series_anchor,
         row_number() OVER (
           PARTITION BY series_id, date
           ORDER BY is_series_anchor DESC, created_at ASC, id ASC
         ) AS rn
  FROM public.calendar_events
  WHERE series_id IS NOT NULL AND deleted_at IS NULL
)
UPDATE public.calendar_events e
SET deleted_at = now()
FROM ranked r
WHERE e.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_series_date_uniq
  ON public.calendar_events (series_id, date)
  WHERE series_id IS NOT NULL AND deleted_at IS NULL;

-- Live-requested follow-up: "not only that for single events also apply
-- dedup" — the same class of bug (or a plain repeated-tap resubmit) can
-- happen to a one-off event too, series_id IS NULL and all. Checked
-- production data before writing this: two real, distinct duplicate
-- shapes exist today —
--   1. Public-holiday rows (Christmas Eve x3, Diwali x2, New Year's Day
--      x2, etc.) — a holiday-import running more than once and
--      re-inserting the same all-day, family-wide holiday.
--   2. "Drop-off to School every day — Pickup/Drop-off" x4-6 on the same
--      date — 10 rows created across ~2 minutes in rapid bursts (plain
--      addEvent ids, not addRecurringEvent's ev<ts>_<i> batch shape),
--      consistent with repeated form-resubmits rather than the
--      recurrence-generator bug above.
-- Both are the same underlying gap: nothing stops two rows for the same
-- family, date, title, time and assignee from existing at once. Same
-- keep-one-drop-the-rest cleanup shape as the series pass above —
-- oldest row wins the tiebreak, everything else on the same key gets
-- soft-deleted — followed by a matching partial unique index.
--
-- member_id is part of the key (not family_id/date/title/start_time
-- alone) so two DIFFERENT kids' same-titled, same-time events (e.g. two
-- siblings each with their own "Piano lesson" at 4pm) are correctly left
-- as distinct rows, not collapsed into one. Postgres groups NULL member_id
-- values together in PARTITION BY (unlike plain WHERE equality), which is
-- also correct here — two family-wide holiday rows with no member_id
-- should still count as duplicates of each other.
WITH ranked_singles AS (
  SELECT id, family_id, date, title, start_time, member_id, created_at,
         row_number() OVER (
           PARTITION BY family_id, date, title, start_time, member_id
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.calendar_events
  WHERE series_id IS NULL AND deleted_at IS NULL
)
UPDATE public.calendar_events e
SET deleted_at = now()
FROM ranked_singles r
WHERE e.id = r.id AND r.rn > 1;

-- start_time and member_id both go in the index expression as
-- COALESCE(..., a fixed sentinel) rather than the raw columns — a plain
-- UNIQUE index (unlike PARTITION BY above) treats each NULL as distinct
-- from every other NULL, which would silently let unlimited untimed or
-- unassigned duplicates back in the moment either column is NULL.
CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_single_dedup_uniq
  ON public.calendar_events (
    family_id,
    date,
    title,
    COALESCE(start_time, ''),
    COALESCE(member_id, '')
  )
  WHERE series_id IS NULL AND deleted_at IS NULL;
