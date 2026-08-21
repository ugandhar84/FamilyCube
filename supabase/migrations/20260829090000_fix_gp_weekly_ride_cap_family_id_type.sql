-- Live-DB QA (teen-role ride/schedule sweep) found the GP weekly-ride-cap
-- trigger added in 20260829080000 has a type mismatch that breaks EVERY
-- confirmed ride/helper assignment in the app, for every role, not just
-- grandparents: members.family_id is uuid but calendar_events.family_id is
-- text (same long-standing split every other RLS policy/function in this
-- codebase already casts around — see 20260817150000's and
-- 20260817120000's comments on the same split). The new trigger's
-- `where family_id = new.family_id` compares uuid = text directly with no
-- cast, so Postgres raises `operator does not exist: uuid = text` (42883)
-- unconditionally, before the function even reaches the role check that
-- would normally no-op for a non-grandparent claimant. Verified live: a
-- teen confirming a claimed ride, and a parent confirming a plain helper,
-- both failed identically — this was never GP-scoped in practice, it
-- blocked every claimHelperSlot() write in production since deploy.
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
  where family_id::text = new.family_id and role = 'grandparent' and name = claimant_name
  limit 1;

  if claimant_id is null then
    return new;
  end if;

  cap := coalesce(cap, 2);

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
