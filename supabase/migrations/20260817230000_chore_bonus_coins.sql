-- chore_tasks had no bonus_coins column at all — the Add Quest form lets a
-- parent type in a bonus amount (bonusCoins state in AddQuestModal), but
-- choreAdapter's updateQuest silently no-oped any bonusCoins update
-- ("no bonus in chore system") since there was nowhere in the live
-- chore_tasks-backed system to store or pay it. A bonus a parent set was
-- therefore always silently discarded — never persisted, never paid.

alter table public.chore_tasks
  add column if not exists bonus_coins integer not null default 0;
