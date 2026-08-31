-- Follow-up to 20260931050000: exact title equality was too strict —
-- confirmed live against the exact real duplicate this check was built to
-- catch. A recurring series' ANCHOR row often carries a fuller title
-- ("Pick up Praveena from Office every day") while its individual
-- OCCURRENCE rows get a shortened one ("Pick up Praveena"), so a
-- brand-new anchor's full title would never exact-match an existing
-- occurrence's shortened one even though they represent the exact same
-- commitment.
--
-- Switched to a two-way CONTAINS check: candidate title inside existing
-- title, OR existing title inside candidate title — catches the real
-- anchor/occurrence title-length mismatch while still requiring the
-- shorter of the two titles to be a genuine substring, not just any two
-- titles sharing common words.
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
    and (
      position(lower(trim(ce.title)) in lower(trim(p_title))) > 0
      or position(lower(trim(p_title)) in lower(trim(ce.title))) > 0
    )
    and ce.date between p_date and (p_date::date + interval '14 days')::text
  order by ce.date
  limit 1;
$function$;
