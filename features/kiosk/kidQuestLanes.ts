/**
 * kidQuestLanes — the ONE definition of "which chores may this kiosk
 * viewer see" and "which of those are up-for-grabs pool chores."
 *
 * This logic was written inside KioskTasksTab.tsx (its `visibleQuests` /
 * `poolQuests` / `poolIds` memos, and its COLUMN_STATUSES lanes). The kid
 * Overview now needs the exact same answers for its "My Chores" widget,
 * and a second copy is precisely how the two surfaces would drift into
 * disagreeing about what counts as an open pool chore — the failure mode
 * KioskTasksTab's own comments record fixing more than once. So the rules
 * live here and both callers import them; no behavior changed in the move.
 *
 * See KioskTasksTab.tsx's own long comment above `visibleQuests` for WHY
 * each exclusion exists (it mirrors QuestsScreen.tsx:596's Bounty filter
 * and the phone's per-viewer visibility rules) — that reasoning is not
 * repeated here, only the rules themselves.
 */
import type { Quest } from '@/store/questStore';
import type { FamilyMember } from '@/store/familyStore';
import { isAssignedTo } from '@/features/tasks/lib/deriveCardActions';

/**
 * The kanban's status vocabulary. Exported so any surface summarising
 * chore state uses the board's OWN labels rather than inventing a parallel
 * set a kid would then have to reconcile.
 */
export const COLUMN_STATUSES: { key: string; label: string; statuses: string[] }[] = [
  { key: 'todo',     label: 'To Do',       statuses: ['todo'] },
  { key: 'progress', label: 'In Progress', statuses: ['claimed', 'in_progress'] },
  { key: 'redo',     label: 'Needs Redo',  statuses: ['declined'] },
  { key: 'review',   label: 'In Review',   statuses: ['pending_approval'] },
];

/** Chores this viewer is allowed to see at all on a shared kiosk. */
export function visibleQuestsFor(
  quests: Quest[],
  members: FamilyMember[],
  viewer: { id: string; role: string },
): Quest[] {
  const adultMemberIds = new Set(
    members.filter(m => m.role === 'parent' || m.role === 'senior').map(m => m.id),
  );
  const isKidOrTeen = viewer.role === 'kid' || viewer.role === 'teen';
  if (!isKidOrTeen) return quests;
  return quests.filter(q => {
    if (q.isAdultTask) return false;
    if ((q as any).awaitingParentApproval) return false;
    if (q.assignedToId && adultMemberIds.has(q.assignedToId)) return false;
    if (q.isPool) return !q.inviteGrandparents;
    return isAssignedTo(q, viewer.id);
  });
}

/** Up-for-grabs bounties inside an already-visibility-filtered list. */
export function poolQuestsIn(visible: Quest[]): Quest[] {
  return visible.filter(q =>
    q.isPool && q.status === 'todo' && !q.isAdultTask &&
    !q.assignedToId && !q.inviteGrandparents,
  );
}
