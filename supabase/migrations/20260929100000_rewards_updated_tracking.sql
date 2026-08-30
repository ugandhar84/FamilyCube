-- Store screen's perk card had no "last updated by / when" — a parent
-- editing a perk's price/availability left no trace of who changed it or
-- when, unlike most other editable records in this app. Adding real
-- updated_at/updated_by_id columns (mirroring created_at/created_by_id's
-- existing shape) rather than inferring it from activity_log, since that
-- log isn't guaranteed to have an entry for every historical edit path.
alter table public.rewards
  add column if not exists updated_at    timestamptz,
  add column if not exists updated_by_id text;

comment on column public.rewards.updated_at is 'Set on every updateReward() call (store/rewardStore.ts) — null until a perk is edited for the first time.';
comment on column public.rewards.updated_by_id is 'members.id of whoever last edited this perk — powers the Store perk detail sheet''s "last updated by X" line.';
