-- Pinned-store cards were showing raw lat/lng instead of a human address
-- [live-reported: "it is not showing address on saved pin instead showing
-- the lat lang"] — store_locations never had anywhere to persist the
-- address string the user typed/geocoded, only the resolved coordinates.
alter table public.store_locations add column if not exists address text;
