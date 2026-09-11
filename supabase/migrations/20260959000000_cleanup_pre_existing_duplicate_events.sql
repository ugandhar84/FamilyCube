-- One-time cleanup for pre-existing duplicate calendar_events rows created
-- BEFORE the reconcileAppleCalendar dedup-on-insert guard existed
-- (lib/calendarSync2Way.ts's own comment documents the guard, added to fix
-- exactly this: a same-title/date/time event landing under a DIFFERENT
-- member_id than the original, which calendar_events_single_dedup_uniq
-- (member_id-scoped by design, so a shared event can exist once per
-- assigned member) does not catch). Live-reported: "Family Picnic" shown
-- twice in the Agenda view for the same date/time, one row carrying Apple
-- sync metadata, one plain.
--
-- This migration does NOT change the ongoing dedup rule (member_id stays
-- part of the ordinary unique index — that's intentional, not the bug) —
-- it only sweeps existing rows that are duplicates by the SAME criteria
-- check_likely_duplicate_event already uses (family_id, date, title,
-- start_time), regardless of member_id, and soft-deletes all but one
-- survivor per group. Recurring series (series_id IS NOT NULL) are
-- excluded — those already went through a dedicated series-dedup pass
-- (migration 20260943000000) and this migration's grouping isn't
-- series-aware.
--
-- Survivor selection per duplicate group: prefer the row that actually
-- carries external sync metadata (it's the one a calendar provider still
-- references, so keeping it avoids re-creating a duplicate on the next
-- sync sweep); tie-break on oldest created_at otherwise.
with duped as (
  select
    id,
    row_number() over (
      partition by family_id, date, title, coalesce(start_time, '')
      order by
        (last_external_sync_provider is not null) desc,
        (source_provider is not null) desc,
        created_at asc,
        id asc
    ) as rn
  from public.calendar_events
  where deleted_at is null
    and series_id is null
)
update public.calendar_events ce
set deleted_at = now()
from duped d
where ce.id = d.id
  and d.rn > 1;
