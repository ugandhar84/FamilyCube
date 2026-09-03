-- Follow-up to 20260931060000: that migration's two-way substring
-- containment check has no exact-match tier at all — ANY two events at the
-- same start_time within the 14-day window where one title is a substring
-- of the other counts as a match, no matter how short. A family with
-- recurring short titles ("Practice" vs "Basketball Practice", "Pickup" vs
-- "School Pickup") at the same daily time would false-positive merge two
-- genuinely unrelated events, silently attaching an unrelated inbound
-- Google/Outlook event's future edits to the wrong local row.
--
-- Fix: try an EXACT title match first (the strong, unambiguous signal).
-- Only fall back to substring containment when no exact match exists AND
-- the shorter title is at least half the length of the longer one — this
-- still catches the anchor/occurrence case this function was built for
-- ("Pick up Praveena from Office every day" contains "Pick up Praveena",
-- roughly 2/3 the length) while rejecting a short generic word matching
-- inside an unrelated longer title.
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
    and length(trim(p_title)) > 0
    and ce.date between p_date and (p_date::date + interval '14 days')::text
    and (
      -- Tier 1: exact match (case/whitespace-insensitive) — always accepted.
      lower(trim(ce.title)) = lower(trim(p_title))
      or (
        -- Tier 2: substring containment, gated to a genuine near-match —
        -- the shorter title must cover at least half the longer one's
        -- length, so a short generic word can't match inside an unrelated
        -- long title.
        (
          position(lower(trim(ce.title)) in lower(trim(p_title))) > 0
          or position(lower(trim(p_title)) in lower(trim(ce.title))) > 0
        )
        and least(length(trim(ce.title)), length(trim(p_title)))::float
            / greatest(length(trim(ce.title)), length(trim(p_title)))::float >= 0.5
      )
    )
  order by
    -- Prefer an exact match over a substring match when both exist.
    (lower(trim(ce.title)) <> lower(trim(p_title))),
    ce.date
  limit 1;
$function$;
