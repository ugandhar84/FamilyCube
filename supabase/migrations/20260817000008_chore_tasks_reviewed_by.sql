-- approveChore/requestRedo accepted a reviewerId parameter but never
-- persisted it — chore_tasks had no column to hold it, so "who approved
-- this?" was unanswerable from the data. Adds the missing column so
-- Hub liveness UI ("approved by Dad, 2 min ago") can be built on chores
-- the same way it already can on quests (quests.approved_by_id).
-- Typed text (not uuid) to match family_members.id, which is a
-- human-readable string id (e.g. 'kid-1'), not a uuid.
alter table chore_tasks
  add column if not exists reviewed_by_id text;
