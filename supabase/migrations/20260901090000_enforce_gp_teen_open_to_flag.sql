-- QA launch-readiness sweep: server-side enforcement for isOpenToGrandparents /
-- isOpenToTeens.
--
-- Every UI path that ever sets a grandparent/teen as a confirmed ride
-- helper/driver already requires the corresponding "open to" flag first —
-- EventFormModal.tsx only ever lists a senior as a directly-pickable
-- helper/driver once `openToGrandparents` is on (see its `adults` filter),
-- and the self-claim pool (SeniorView/TeenView) only ever shows rides where
-- isOpenToGrandparents/isOpenToTeens is already true. But that's a client-
-- side rule only: claimHelperSlot's own DB write is a plain compare-and-swap
-- on the status column (`.is(dbStatusCol, null)`) with no check of the
-- open-to flag at all, and calendar_events' RLS is scoped only by family_id
-- — any authenticated member of the family can UPDATE any event, including
-- setting themselves as a confirmed driver on a ride explicitly marked NOT
-- open to grandparents, via a direct write that bypasses the app UI
-- entirely. Same bug class as Round 1's chore self-approval finding and the
-- existing gp_weekly_ride_cap_trigger this migration is modeled on.
create or replace function public.enforce_open_to_flag_on_claim()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  claimant_name text;
  claimant_role text;
begin
  -- Only re-check on the transition INTO 'confirmed' — same trigger
  -- condition the weekly-cap trigger already uses, so a GP/teen accepting a
  -- parent-initiated pending assignment (helperStatus: 'pending' -> parent
  -- picked them, already gated by openToGrandparents at create time) and a
  -- self-claim (status goes straight to 'confirmed') are both covered, but
  -- unrelated field edits on an already-confirmed row are left alone.
  claimant_name := case
    when new.helper_status = 'confirmed' and (old.helper_status is distinct from 'confirmed') then new.helper_name
    when new.driver_status = 'confirmed' and (old.driver_status is distinct from 'confirmed') then new.driver_name
    else null
  end;

  if claimant_name is null then
    return new;
  end if;

  select role into claimant_role
  from public.members
  where family_id::text = new.family_id and name = claimant_name
  limit 1;

  if claimant_role = 'grandparent' and coalesce(new.is_open_to_grandparents, false) is not true then
    raise exception 'not_open_to_grandparents: % is not a valid driver/helper for this event', claimant_name
      using errcode = 'P0001';
  end if;

  if claimant_role = 'teenager' and coalesce(new.is_open_to_teens, false) is not true then
    raise exception 'not_open_to_teens: % is not a valid driver/helper for this event', claimant_name
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_open_to_flag_trigger on public.calendar_events;
create trigger enforce_open_to_flag_trigger
  before update on public.calendar_events
  for each row execute function public.enforce_open_to_flag_on_claim();
