-- locationTracking.ts / GpsTab.tsx / liveSelfLocation.ts have written a `movement`
-- value ('walking' | 'running' | 'cycling' | 'driving' | 'stationary') with every
-- member_locations upsert since 2026-10-18 (commit 9037b732), but no migration ever
-- created the column. If it is missing, PostgREST rejects the WHOLE upsert, so no
-- location (foreground or background) saves and no walking/riding status can show.
alter table public.member_locations add column if not exists movement text;
notify pgrst, 'reload schema';
