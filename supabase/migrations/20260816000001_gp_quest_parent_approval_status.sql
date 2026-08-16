-- Grandparent-created quests begin in the parent safety-review queue.
-- The previous constraint omitted this valid application status, causing the
-- insert to fail after the client had optimistically shown it to the GP.

ALTER TABLE public.chore_tasks
  DROP CONSTRAINT IF EXISTS chore_tasks_status_check;

ALTER TABLE public.chore_tasks
  ADD CONSTRAINT chore_tasks_status_check
  CHECK (status = ANY (ARRAY[
    'todo',
    'claimed',
    'in_progress',
    'pending_approval',
    'pending_grandparent_approval',
    'pending_parent_approval',
    'approved',
    'auto_approved',
    'done',
    'completed',
    'declined',
    'redo_requested',
    'archived',
    'cancelled',
    'expired'
  ]));
