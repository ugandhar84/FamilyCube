-- chore_tasks.open_to_gp and chore_tasks.invite_grandparents were two
-- separate columns meaning the same thing ("grandparents can see/claim
-- this"), created independently by two different features (Add/Edit Quest
-- Modal wrote invite_grandparents; PoolQuestCard/OthersAdultQuestCard/
-- DelegateSheet's "GP Welcome"/"Offer to GP" toggle wrote open_to_gp), kept
-- in sync only by a band-aid in updateChore's client-side patch logic
-- ("setting one now sets both") added after the drift was first noticed.
-- Every real read path (claimGPErrand, submitGPErrandReceipt, the senior
-- pool-visibility filter, this session's own DelegateSheet/PoolQuestCard
-- fixes) checks invite_grandparents — open_to_gp had become a legacy alias
-- that some UI badges still read directly, which is exactly how
-- DelegateSheet.tsx's GP-picker bug happened: a code path wrote
-- invite_grandparents directly (bypassing the sync band-aid) and open_to_gp
-- silently fell out of step. invite_grandparents is the one column kept.
--
-- Backfill: either flag having ever been true means "this chore was meant
-- to be GP-visible" — OR them together rather than trusting either column's
-- literal current value, so a row that drifted in EITHER direction ends up
-- correctly GP-visible instead of silently losing that visibility.
update public.chore_tasks
set invite_grandparents = true
where open_to_gp = true and invite_grandparents = false;

-- open_to_gp itself is dropped in a LATER migration (not this one) — this
-- migration only backfills. The column is left in place for one release
-- cycle so any in-flight client build still running the old
-- openToGP-reading code (before this session's TypeScript fixes reach
-- production) doesn't silently regress; drop it once that's no longer a
-- concern. See 20260927080000_drop_open_to_gp_column.sql.
comment on column public.chore_tasks.open_to_gp is
  'DEPRECATED — superseded by invite_grandparents, which is now the only column any code reads. Kept temporarily for backward compat with in-flight client builds; scheduled for removal, do not write new code against this column.';
