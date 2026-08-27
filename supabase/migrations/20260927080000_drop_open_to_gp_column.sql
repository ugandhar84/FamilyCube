-- Final step of the open_to_gp/invite_grandparents dedup — every read/write
-- site in the client has been migrated to invite_grandparents (this
-- session), the one drifted row was backfilled
-- (20260927070000_dedupe_open_to_gp_column.sql), and a full grep confirms
-- nothing in store/choreStore.ts or any UI reads chore_tasks.open_to_gp for
-- logic anymore. Dropping outright rather than leaving it deprecated-in-
-- place — a "kept around just in case" column is exactly how this
-- duplication happened the first time.
alter table public.chore_tasks drop column if exists open_to_gp;
