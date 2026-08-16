-- One-time reconciliation for rows left inconsistent while the Household Backlog
-- loop was live (missing WITH CHECK dropped inserts; 'completed' chores mapped
-- back to 'todo'; the pool had no status filter).
-- Every statement is guarded, so re-running is a no-op.

DO $$
DECLARE
  closed_terminal int;
  closed_dupes    int;
  closed_orphans  int;
BEGIN
  -- 1. Chore already finished, assignment still open → close the assignment.
  --    This is what leaves a second "✓ Done" card behind after the chore is done.
  WITH updated AS (
    UPDATE parent_quest_assignments a
       SET status       = 'COMPLETED',
           completed_at = COALESCE(a.completed_at, now()),
           updated_at   = now()
      FROM chore_tasks ct
     WHERE ct.id = a.chore_id
       AND a.status NOT IN ('COMPLETED', 'DECLINED')
       AND ct.status IN ('approved', 'auto_approved', 'completed', 'declined', 'expired')
    RETURNING 1
  )
  SELECT count(*) INTO closed_terminal FROM updated;

  -- 2. Repeated "I'll take it" taps stacked multiple open assignments on one
  --    chore. Keep the newest, close the rest.
  WITH ranked AS (
    SELECT id,
           row_number() OVER (PARTITION BY chore_id ORDER BY created_at DESC, id DESC) AS rn
      FROM parent_quest_assignments
     WHERE status NOT IN ('COMPLETED', 'DECLINED')
  ),
  updated AS (
    UPDATE parent_quest_assignments a
       SET status     = 'DECLINED',
           updated_at = now()
      FROM ranked r
     WHERE r.id = a.id
       AND r.rn > 1
    RETURNING 1
  )
  SELECT count(*) INTO closed_dupes FROM updated;

  -- 3. Assignment claims a chore that has since been handed to someone else (or
  --    pushed back to the pool) — a stale claim that would hide it from others.
  WITH updated AS (
    UPDATE parent_quest_assignments a
       SET status     = 'DECLINED',
           updated_at = now()
      FROM chore_tasks ct
     WHERE ct.id = a.chore_id
       AND a.status IN ('ACCEPTED', 'IN_PROGRESS')
       AND (ct.assigned_to_id IS NULL OR ct.assigned_to_id <> a.assigned_to)
    RETURNING 1
  )
  SELECT count(*) INTO closed_orphans FROM updated;

  RAISE NOTICE 'reconcile: % closed on finished chores, % duplicate claims, % stale claims',
    closed_terminal, closed_dupes, closed_orphans;
END $$;
