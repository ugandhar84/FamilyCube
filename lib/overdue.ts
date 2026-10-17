import { parseLocalDate } from '@/lib/dates';

// Statuses where nobody still owes work on the chore: finished, closed, or
// already handed in and waiting on a parent's review.
const NOT_ACTIONABLE = ['approved', 'auto_approved', 'completed', 'done', 'declined', 'cancelled', 'archived', 'pending_approval'];

/** Same rule QuestCard uses for its "Overdue" badge: the due DATE is before today (a chore due today is not overdue until tomorrow). */
export function isChoreOverdue(c: { dueDate?: string | null; status: string; instanceDate?: string | null }, now: Date = new Date()): boolean {
  if (!c.dueDate || NOT_ACTIONABLE.includes(c.status)) return false;
  const dateStr = c.dueDate.includes('T') ? c.dueDate.split('T')[0] : c.dueDate;
  const due = parseLocalDate(dateStr).getTime();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  return Number.isFinite(due) && due < todayStart.getTime();
}

/**
 * How many overdue chores this person should see on the Tasks tab: a parent
 * sees every overdue chore in the family (they chase them); everyone else
 * sees only their own.
 */
export function countOverdueChores(
  chores: { dueDate?: string | null; status: string; assignedToId?: string | null; instanceDate?: string | null }[],
  member: { id: string; role?: string } | undefined,
): number {
  if (!member) return 0;
  const isParent = member.role === 'parent';
  let n = 0;
  for (const c of chores) {
    if (!isChoreOverdue(c)) continue;
    if (isParent || c.assignedToId === member.id) n++;
  }
  return n;
}
