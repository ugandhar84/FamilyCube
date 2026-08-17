-- GP quests targeted at several kids become a "team job": one clone per kid so
-- each has their own card to work, but a shared team_group_id so points are
-- only paid out once EVERY targeted kid has been approved.

ALTER TABLE public.chore_tasks
  ADD COLUMN IF NOT EXISTS team_group_id text;

CREATE INDEX IF NOT EXISTS chore_tasks_team_group_id_idx
  ON public.chore_tasks(team_group_id)
  WHERE team_group_id IS NOT NULL;
