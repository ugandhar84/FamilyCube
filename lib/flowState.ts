/**
 * flowState — one plain vocabulary for "where is this item and whose move is
 * it", shared by chores (quests) and events/rides. The stores keep their
 * detailed statuses (pending_approval, declined, redo_requested, rejected…);
 * this only maps them to five words a kid or parent can read at a glance:
 *
 *   todo        — not done yet
 *   waiting_you — the viewer has to act (approve, redo, confirm)
 *   waiting_them — someone else has to act
 *   redo        — sent back, needs another try
 *   done        — finished / approved / confirmed
 *
 * Presentation only. No store, no writes.
 */
import type { Quest } from '@/store/questStore';
import type { FamilyEvent } from '@/store/eventStore';
import type { FamilyMember } from '@/store/familyStore';

export type FlowState = 'todo' | 'waiting_you' | 'waiting_them' | 'redo' | 'done';

export const FLOW_LABEL: Record<FlowState, string> = {
  todo: 'To do',
  waiting_you: 'Waiting on you',
  waiting_them: 'Waiting on a grown-up',
  redo: 'Try again',
  done: 'Done',
};

export interface FlowInfo { state: FlowState; label: string }

type Viewer = { id: string; role: FamilyMember['role'] | undefined; isActiveApprover?: boolean };

const canReview = (v: Viewer) => v.role === 'parent' || v.role === 'senior' || !!v.isActiveApprover;

export function questFlow(q: Pick<Quest, 'status'>, viewer: Viewer): FlowInfo {
  switch (q.status) {
    case 'pending_approval':
      return canReview(viewer)
        ? { state: 'waiting_you', label: FLOW_LABEL.waiting_you }
        : { state: 'waiting_them', label: FLOW_LABEL.waiting_them };
    case 'declined':
      return { state: 'redo', label: FLOW_LABEL.redo };
    case 'approved':
    case 'done':
      return { state: 'done', label: FLOW_LABEL.done };
    default:
      return { state: 'todo', label: FLOW_LABEL.todo };
  }
}

/** Event helper/driver assignment: pending → waiting on the assignee (or on
 *  the viewer if they ARE the assignee), confirmed → done. */
export function eventAssignmentFlow(
  status: FamilyEvent['helperStatus'] | undefined,
  assigneeId: string | undefined,
  viewer: Viewer,
): FlowInfo {
  if (status === 'confirmed') return { state: 'done', label: 'Confirmed' };
  if (status === 'rejected') return { state: 'redo', label: 'Needs someone else' };
  if (status === 'pending') {
    return assigneeId && assigneeId === viewer.id
      ? { state: 'waiting_you', label: 'Waiting on you' }
      : { state: 'waiting_them', label: 'Waiting for a reply' };
  }
  return { state: 'todo', label: 'Not assigned' };
}
