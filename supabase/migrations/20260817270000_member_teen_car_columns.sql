-- familyStore.ts (fromRow/toRow) and RosterTab's EditMemberModal have
-- always read/written has_car / ride_earnings_per_run /
-- grocery_earnings_per_run on members, but none of these columns ever
-- existed — reads silently defaulted (row.has_car ?? false etc., masking
-- the gap), writes errored outright ("Could not find the
-- 'grocery_earnings_per_run' column of 'members' in the schema cache"),
-- which is exactly why saving a teen's car/earnings settings in RosterTab
-- never worked.
alter table public.members
  add column if not exists has_car boolean not null default false,
  add column if not exists ride_earnings_per_run integer not null default 50,
  add column if not exists grocery_earnings_per_run integer not null default 30;
