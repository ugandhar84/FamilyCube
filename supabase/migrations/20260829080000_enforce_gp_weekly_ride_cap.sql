-- Live-DB QA verification (grandparent-role sweep) found the weekly ride
-- cap (members.gp_weekly_ride_cap) is enforced ONLY client-side —
-- SeniorView.tsx's atWeeklyCap check gates the Alert.alert/button, but
-- nothing server-side stops a direct write (a modified client, a raw API
-- call, or the dispatch engine itself) from pushing a grandparent
-- arbitrarily past their configured limit. Confirmed live: firing the
-- exact conditional UPDATE claimHelperSlot uses, bypassing the client
-- gate, succeeded twice in the same week against a cap of 1.
--
-- Adds a real server-side guard: a trigger on calendar_events that fires
-- whenever a row's helper_status or driver_status is being set to
-- 'confirmed' for a grandparent (matched by free-text name against
-- members.role='grandparent', same name-matching pattern the app itself
-- already uses for these fields — helper/driver are text fields, not
-- ids). Counts this senior's OTHER already-confirmed rides in the same
-- calendar week (Sun-Sat, matching SeniorView.tsx's own weekStart/weekEnd
-- derivation) and raises an exception if accepting this one would exceed
-- their configured cap.
create or replace function public.enforce_gp_weekly_ride_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  claimant_name text;
  claimant_id text;
  cap integer;
  week_start date;
  week_end date;
  already_confirmed integer;
begin
  -- Only relevant when a status is actually transitioning TO 'confirmed' —
  -- every other write (decline, reopen, unrelated field edit) passes
  -- through untouched.
  claimant_name := case
    when new.helper_status = 'confirmed' and (old.helper_status is distinct from 'confirmed') then new.helper_name
    when new.driver_status = 'confirmed' and (old.driver_status is distinct from 'confirmed') then new.driver_name
    else null
  end;

  if claimant_name is null then
    return new;
  end if;

  select id, gp_weekly_ride_cap into claimant_id, cap
  from public.members
  where family_id = new.family_id and role = 'grandparent' and name = claimant_name
  limit 1;

  -- Not a grandparent (or name didn't match any GP in this family) — this
  -- guard only applies to the GP weekly cap, every other role's claim is
  -- unaffected.
  if claimant_id is null then
    return new;
  end if;

  cap := coalesce(cap, 2); -- same default SeniorView.tsx uses (?? 2)

  -- Sun-Sat week containing this event's own date, matching
  -- SeniorView.tsx's weekStart/weekEnd derivation exactly.
  week_start := new.date::date - extract(dow from new.date::date)::int;
  week_end := week_start + 6;

  select count(*) into already_confirmed
  from public.calendar_events
  where family_id = new.family_id
    and deleted_at is null
    and id <> new.id
    and date >= week_start::text and date <= week_end::text
    and (
      (helper_name = claimant_name and helper_status = 'confirmed') or
      (driver_name = claimant_name and driver_status = 'confirmed')
    );

  if already_confirmed >= cap then
    raise exception 'gp_weekly_ride_cap_exceeded: % already has % confirmed ride(s) this week (cap %)', claimant_name, already_confirmed, cap
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists gp_weekly_ride_cap_trigger on public.calendar_events;
create trigger gp_weekly_ride_cap_trigger
  before update on public.calendar_events
  for each row
  execute function public.enforce_gp_weekly_ride_cap();

comment on function public.enforce_gp_weekly_ride_cap() is
  'Server-side enforcement of members.gp_weekly_ride_cap — previously client-side only. See migration 20260829080000.';
