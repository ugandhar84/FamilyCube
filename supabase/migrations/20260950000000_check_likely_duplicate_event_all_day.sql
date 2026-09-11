-- Gap found in a broader audit of check_likely_duplicate_event's callers
-- (googleReconcile.ts, calendarSync2Way.ts's Apple reconcile,
-- calendar-webhook-outlook, plus the manual/AI creation paths
-- EventFormModal/KioskAddEventForm/KioskEventEditor/AskCubeChat): every
-- single call site gates the RPC call itself on a truthy start time
-- (patch.startTime/patch.time/eventInput.time) and skips calling it
-- entirely for an all-day event, since googleBodyToPortablePatch and the
-- Apple/manual equivalents all set startTime/time to null for those. So a
-- native all-day event ("Grandma visiting," "School holiday") that also
-- exists on a synced external calendar was NEVER deduped by any path —
-- not a narrow miss, every single caller had this same gap.
--
-- Even passing null through as p_start_time wouldn't have worked anyway:
-- the function's own `ce.start_time = p_start_time` is a plain equality,
-- and NULL = NULL is never true in SQL — a real function-side fix is
-- required, not just having callers stop skipping the call.
--
-- Fix: accept p_start_time as nullable, and match using
-- IS NOT DISTINCT FROM (the null-safe equality operator) instead of a
-- bare `=`, so two all-day events (both start_time IS NULL) on the same
-- family/date/title now correctly match. Callers (client + edge
-- functions) are updated separately to stop skipping the RPC call for an
-- all-day patch.
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
    and ce.start_time is not distinct from p_start_time
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
