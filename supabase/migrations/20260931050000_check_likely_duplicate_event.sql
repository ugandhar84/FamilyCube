-- Live-reported bug: nothing in the app warned before creating a second
-- recurring event with the same title/time as an existing one — a real
-- family hit this today (a "Pick up Praveena from Office every day" ride
-- was deleted, then recreated; Calendar Sync correctly synced BOTH
-- versions to/from Google, and since each is a genuinely distinct Google
-- event, they came back as 562 total rows with no way for the sync layer
-- itself to know they represented "the same real-world commitment").
-- Google Calendar sync isn't at fault here — the actual gap is that event
-- creation never checks for an obvious duplicate in the first place.
--
-- This RPC is a lightweight, read-only pre-flight check: same family, same
-- (trimmed, case-insensitive) title, same start_time, on the exact date OR
-- (for a new recurring series) any date within the next 14 days — wide
-- enough to catch "I created this weekly ride yesterday and I'm creating
-- it again today" without needing exact same-day precision for a series
-- whose FIRST occurrence might land on a different day than an existing
-- series' first occurrence.
--
-- NOTE: superseded by 20260931060000's substring-match version in the
-- same session — exact title equality turned out too strict (a series
-- anchor's fuller title, e.g. "...from Office every day", never
-- exact-matches its own shortened occurrence titles, e.g. "Pick up
-- Praveena" — confirmed live against the exact real duplicate this was
-- built to catch). Kept here as the historical record of what was
-- actually deployed first.
create or replace function public.check_likely_duplicate_event(
  p_family_id text,
  p_title text,
  p_start_time text,
  p_date text
)
returns table(id text, title text, date text, category text, is_series boolean)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select ce.id, ce.title, ce.date, ce.category,
    (ce.series_id is not null or ce.is_series_anchor) as is_series
  from public.calendar_events ce
  where ce.family_id = p_family_id
    and ce.deleted_at is null
    and ce.start_time = p_start_time
    and lower(trim(ce.title)) = lower(trim(p_title))
    and ce.date between p_date and (p_date::date + interval '14 days')::text
  order by ce.date
  limit 1;
$function$;
