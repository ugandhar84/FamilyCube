/**
 * deriveCardActions — the one place "should this button show, for this
 * viewer, on this item" gets decided for quests/chores and events. Modeled
 * directly on EventDetailSheet's own showX consts (features/hub/hubComponents.tsx),
 * the one surface in the app that already got this right (one set of
 * booleans, imported by both CalendarScreen and every Hub role view via
 * TimelineCard) — extracted here as plain, non-React functions so a list
 * screen (QuestsScreen/CalendarScreen) and a component tree (Hub's per-role
 * cards) can call the exact same logic instead of each hand-rolling their
 * own version.
 *
 * deriveQuestActions ports QuestCard.tsx's own canX consts verbatim as the
 * source of truth (already correct, already battle-tested) — the fix here
 * is making them importable, not rewriting the rules. The one intentional
 * behavior change: canApprove now also respects a Temporary Approver grant
 * (choreStore.canApprove's isActiveApprover check), which today only gates
 * the store WRITE, never button visibility — a temp approver could
 * successfully tap Approve if a button existed, but no button existed for
 * them anywhere in the app.
 *
 * deriveEventActions lifts EventDetailSheet's showX consts near-verbatim —
 * this is a move, not a rewrite, so features/hub/parent/backlog/HelperEventCard.tsx's
 * independently hand-rolled Take-Over/Confirm checks can be replaced with a
 * call to this instead of a second, driftable copy of the same rules.
 */
import type { Quest } from '@/store/questStore';
import type { FamilyEvent, HelperStatus } from '@/store/eventStore';
import { eventAssignee } from '@/store/eventStore';
import { isWorkEvent } from '@/features/hub/hubUtils';
import type { FamilyMember } from '@/store/familyStore';

// Duplicated (and unexported) in QuestsScreen.tsx twice before this module
// existed — the assignment-membership check every canX predicate below
// needs. Exported so QuestCard.tsx/QuestsScreen.tsx can drop their own
// copies in favor of this one.
export function isAssignedTo(q: Pick<Quest, 'assignedToId' | 'assignedToIds'>, memberId: string): boolean {
  return q.assignedToId === memberId ||
    ((q.assignedToIds?.length ?? 0) > 0 && !!q.assignedToIds?.includes(memberId));
}

// Status-shape predicates — implicit as local consts inside QuestCard.tsx
// before this module existed (isPoolCard/isTodoCard/isReview/isDoneCard/
// isDeclined). Hub's KidQuestCard.tsx independently re-derived a subtly
// different version of some of these (its own isPool/isActionable/isGpTodo),
// which is exactly the drift this module exists to prevent — every consumer
// should read status shape from here, not re-derive it.
export function isPoolCard(q: Pick<Quest, 'isPool' | 'status'>): boolean {
  return !!q.isPool && q.status === 'todo';
}
export function isTodoCard(q: Pick<Quest, 'isPool' | 'status'>): boolean {
  return (q.status === 'todo' || q.status === 'claimed' || q.status === 'in_progress') && !isPoolCard(q);
}
export function isReviewCard(q: Pick<Quest, 'status'>): boolean {
  return q.status === 'pending_approval';
}
export function isDoneCard(q: Pick<Quest, 'status'>): boolean {
  return q.status === 'approved' || q.status === 'done';
}
export function isDeclinedCard(q: Pick<Quest, 'status'>): boolean {
  return q.status === 'declined';
}

export interface QuestActionsViewer {
  id: string;
  // undefined covers the "no activeMember resolved yet" edge case — every
  // role check below is a positive match (kid/teen, parent, senior), so an
  // undefined role naturally satisfies none of them, same as the original
  // inline isKidOrTeen/isParentOrSenior booleans evaluating false when
  // activeMember itself was null.
  role: FamilyMember['role'] | undefined;
  /** choreStore.canApprove(memberId)'s isActiveApprover check, i.e.
   *  useTemporaryApproverStore.getState().isActiveApprover(viewer.id) —
   *  pass it in so this stays a pure function with no store reads. */
  isActiveApprover?: boolean;
}

export interface QuestActions {
  canClaim: boolean;
  canSubmit: boolean;
  canResubmit: boolean;
  canKidDecline: boolean;
  canAcceptGp: boolean;
  canGpClaimPool: boolean;
  canGpDone: boolean;
  canApprove: boolean;
  canReopen: boolean;
  canEditFull: boolean;
  canEditRestricted: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

// `categoryType`/`status` off the raw ChoreTask row — QuestCard.tsx reads
// this via a live useChoreStore.getState() lookup keyed by q.id (its
// choreData local var) since a couple of GP-specific checks need the
// ChoreTask-shaped field, not the Quest-mapped one. Pass it in here instead
// of reading the store directly, so this stays a pure function testable
// without a live Zustand store.
export interface QuestActionsChoreExtra {
  categoryType?: string;
  status?: string;
}

export function deriveQuestActions(
  q: Quest,
  viewer: QuestActionsViewer,
  choreExtra?: QuestActionsChoreExtra,
): QuestActions {
  const isKidOrTeen = viewer.role === 'kid' || viewer.role === 'teen';
  const isParent = viewer.role === 'parent';
  const isSenior = viewer.role === 'senior';
  const isParentOrSenior = isParent || isSenior;
  const myId = viewer.id;

  const pool = isPoolCard(q);
  const todo = isTodoCard(q);
  const review = isReviewCard(q);
  const done = isDoneCard(q);
  const declined = isDeclinedCard(q);

  const canClaim = isKidOrTeen && pool;
  const canSubmit = isKidOrTeen && todo && !!myId && isAssignedTo(q, myId);
  const canResubmit = isKidOrTeen && declined && !!myId && isAssignedTo(q, myId);
  const canKidDecline = isKidOrTeen && todo && !q.isPool && !!myId && isAssignedTo(q, myId);
  const canAcceptGp = isKidOrTeen && !!myId && isAssignedTo(q, myId) &&
    choreExtra?.categoryType === 'grandparent_quest' && choreExtra?.status === 'todo';
  const canGpClaimPool = isSenior && q.status === 'todo' && !!q.inviteGrandparents && !q.assignedToId;
  const canGpDone = isSenior && !!myId && q.assignedToId === myId &&
    !!q.inviteGrandparents && (q.status === 'todo' || q.status === 'in_progress');
  // Temp-approver awareness folded in here — choreStore.canApprove(memberId)
  // already grants the store WRITE to an active temporary approver; this is
  // the button-visibility half that was previously missing, so a temp
  // approver saw no Approve button despite being authorized to tap one.
  const canApprove = (isParentOrSenior || !!viewer.isActiveApprover) && review;
  const canReopen = isParentOrSenior && declined;
  const canEditFull = isParent && (pool || (q.status === 'todo' && !q.assignedToId));
  const canEditRestricted = isParent && !done && !declined &&
    (q.status === 'in_progress' || q.status === 'pending_approval' || (q.status === 'todo' && !!q.assignedToId));
  const canEdit = isParent && !done && !declined;
  const canDelete = (isParent || (isSenior && q.questType === 'grandparent_quest' && q.sponsorUserId === myId)) && !done;

  return {
    canClaim, canSubmit, canResubmit, canKidDecline, canAcceptGp, canGpClaimPool, canGpDone,
    canApprove, canReopen, canEditFull, canEditRestricted, canEdit, canDelete,
  };
}

export interface EventActionsViewer {
  id: string;
  name: string;
  role: FamilyMember['role'];
  hasCar?: boolean;
}

export interface EventActions {
  assignee: { name: string | undefined; status: HelperStatus | undefined };
  isSelfAssigned: boolean;
  showRemind: boolean;
  showReassign: boolean;
  showAssignToMe: boolean;
  showOverride: boolean;
  showCantMakeIt: boolean;
  showConfirm: boolean;
}

export function deriveEventActions(
  ev: FamilyEvent,
  viewer: EventActionsViewer,
  opts?: { isPast?: boolean },
): EventActions {
  const isPast = !!opts?.isPast;
  const isViewerParent = viewer.role === 'parent';
  const isWork = isWorkEvent(ev);
  const assignee = eventAssignee(ev);
  const helperPending = assignee.status === 'pending';
  const helperRejected = assignee.status === 'rejected';
  const isSelfAssigned = !!viewer.name && assignee.name === viewer.name;
  const helperConfirmed = assignee.status === 'confirmed';

  const showRemind = !isPast && !isWork && isViewerParent && !!assignee.name && helperPending && !isSelfAssigned;
  const showReassign = !isPast && !isWork && isViewerParent && (!assignee.name || (helperPending && !isSelfAssigned) || helperRejected);
  const showAssignToMe = showReassign && !isSelfAssigned && viewer.hasCar !== false;
  const showOverride = !isPast && !isWork && isViewerParent && helperConfirmed && !isSelfAssigned;
  const showCantMakeIt = !isPast && !isWork && isSelfAssigned && (helperConfirmed || helperPending);
  const showConfirm = !isPast && !isWork && isSelfAssigned && helperPending;

  return { assignee, isSelfAssigned, showRemind, showReassign, showAssignToMe, showOverride, showCantMakeIt, showConfirm };
}
