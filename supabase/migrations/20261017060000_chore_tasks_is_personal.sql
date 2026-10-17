-- A personal task is one someone made for themselves that pays nothing and finishes with one tap (see
-- lib/personalTasks.ts). It is a private list, so it must never notify anyone. A generated column lets every
-- sweep and notifier exclude them with a plain filter.
alter table public.chore_tasks
  add column if not exists is_personal boolean generated always as (
    created_by_id is not null
    and created_by_id = assigned_to_id
    and coalesce(trusted_auto_approve, false)
    and (coalesce(nullif(base_points, 0), coins_reward, 0) + coalesce(bonus_coins, 0)) = 0
  ) stored;
