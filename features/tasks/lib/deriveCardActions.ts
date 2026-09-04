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
  canGiveBack: boolean;
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

  // A chore a GP backed out of (backoutGpWelcomeChore) goes back to
  // isPool:true/status:'todo' so it's re-claimable by another GP — but
  // those are the exact same two fields the kid/teen pool checks, so
  // without this exclusion the same dropped chore also reappeared in the
  // Bounty board, i.e. it fell through to the general pool instead of
  // staying GP-pool-only per the master flow spec.
  const canClaim = isKidOrTeen && pool && !q.inviteGrandparents;
  const canSubmit = isKidOrTeen && todo && !!myId && isAssignedTo(q, myId);
  const canResubmit = isKidOrTeen && declined && !!myId && isAssignedTo(q, myId);
  const canKidDecline = isKidOrTeen && todo && !q.isPool && !!myId && isAssignedTo(q, myId);
  // Live QA finding: only grandparents had a quick "give it back before
  // starting" undo (backoutGpWelcomeChore) — a kid/teen who claimed an
  // ordinary pool chore had no equivalent, only the heavier Can't-Make-It
  // flow (asks for a reason, offers a named handoff). claimedAt is only
  // ever set by a real self-claim from the pool (claimPoolQuest) — never
  // by a parent's direct assignment — so it's a reliable signal for "this
  // is genuinely a change-of-mind on my own claim," distinct from
  // canKidDecline's broader "I can't do this assigned chore" case.
  const canGiveBack = isKidOrTeen && (q.status === 'todo' || q.status === 'in_progress') &&
    !!myId && isAssignedTo(q, myId) && !!q.claimedAt;
  const canAcceptGp = isKidOrTeen && !!myId && isAssignedTo(q, myId) &&
    choreExtra?.categoryType === 'grandparent_quest' && choreExtra?.status === 'todo';
  const canGpClaimPool = isSenior && q.status === 'todo' && !!q.inviteGrandparents && !q.assignedToId;
  const canGpDone = isSenior && !!myId && q.assignedToId === myId &&
    !!q.inviteGrandparents && (q.status === 'todo' || q.status === 'in_progress');
  // Temp-approver awareness folded in here — choreStore.canApprove(memberId)
  // already grants the store WRITE to an active temporary approver; this is
  // the button-visibility half that was previously missing, so a temp
  // approver saw no Approve button despite being authorized to tap one.
  //
  // review (isReviewCard) is true for the SHIM-collapsed Quest status
  // 'pending_approval', which choreAdapter's choreStatusToQuestStatus also
  // maps 'pending_grandparent_approval' and 'gp_offer_pending' onto (see
  // that function's own comments) — those two are a GRANDPARENT's own
  // review, not a parent's. approveQuest ultimately calls choreStore's
  // approveChore, which requires the RAW status === 'pending_approval' and
  // silently no-ops on anything else (same guard ParentReviewDeck.tsx's
  // pendingSubmissions filter was fixed to respect — see its comment on
  // gpOffersPending). Without this exclusion, QuestsScreen's Review tab and
  // QuestCard rendered a live, tappable "Approve" button for a parent on a
  // GP-sponsored offer/completion that only the sponsoring grandparent can
  // actually act on — a dead button producing zero visible effect, the
  // exact class of bug already found and fixed once in ParentReviewDeck but
  // never propagated to this shared derivation. Only gate on choreExtra when
  // it's actually been supplied (some callers, e.g. multi-participant rows,
  // don't have a single ChoreTask row to pass) — undefined stays permissive
  // rather than silently hiding the button where no raw status is available.
  const gpOnlyReview = choreExtra?.status === 'pending_grandparent_approval' || choreExtra?.status === 'gp_offer_pending';
  const canApprove = (isParentOrSenior || !!viewer.isActiveApprover) && review && !gpOnlyReview;
  const canReopen = isParentOrSenior && declined;
  const canEditFull = isParent && (pool || (q.status === 'todo' && !q.assignedToId));
  const canEditRestricted = isParent && !done && !declined &&
    (q.status === 'in_progress' || q.status === 'pending_approval' || (q.status === 'todo' && !!q.assignedToId));
  const canEdit = isParent && !done && !declined;
  const canDelete = (isParent || (isSenior && q.questType === 'grandparent_quest' && q.sponsorUserId === myId)) && !done;

  return {
    canClaim, canSubmit, canResubmit, canKidDecline, canGiveBack, canAcceptGp, canGpClaimPool, canGpDone,
    canApprove, canReopen, canEditFull, canEditRestricted, canEdit, canDelete,
  };
}

export interface EventActionsViewer {
  id: string;
  name: string;
  role: FamilyMember['role'];
  hasCar?: boolean;
}

// Which field-pair an event's assignee actually lives in — a Ride-category
// event uses helper/helperStatus, a non-Ride event with rideRequired:true
// uses driverName/driverStatus. Was independently re-derived verbatim in at
// least 3 places (hubComponents.tsx's EventDetailSheet, HelperEventCard.tsx,
// and this exact expression) before being lifted here — every consumer
// should import this instead of re-deriving it, to avoid the 3 copies
// silently drifting apart. Preserves the exact original expression
// (including its slightly odd operator-precedence-driven shape) rather than
// "fixing" it, since that would be a behavior change outside this refactor's
// scope.
export function eventAssigneeRole(ev: Pick<FamilyEvent, 'driverName' | 'helper' | 'rideRequired'>): 'helper' | 'driver' {
  return ev.driverName || (ev.rideRequired && !ev.helper) ? 'driver' : 'helper';
}

export interface EventActions {
  // Mirrors eventAssignee()'s own return shape (this IS that return value,
  // just passed through) — id is the real member id when the assignee is
  // a real family member, undefined for an external non-member name.
  assignee: { name: string | undefined; id: string | undefined; status: HelperStatus | undefined };
  assigneeRole: 'helper' | 'driver';
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
  const assigneeRole = eventAssigneeRole(ev);
  const helperPending = assignee.status === 'pending';
  const helperRejected = assignee.status === 'rejected';
  // id-based when the assignee is a real member (the normal case); only an
  // external, non-member assignee (no id at all — e.g. a name typed into
  // the free-text fallback field) falls back to a name compare, since
  // there's nothing else to compare against for someone with no member
  // row. A name compare is fragile (a rename, two members sharing a first
  // name, or any drift between what's stored and the viewer's current
  // display name) and was only ever a stand-in for a real id column,
  // which calendar_events now has (driver_id/helper_id).
  const isSelfAssigned = assignee.id ? assignee.id === viewer.id : (!!viewer.name && assignee.name === viewer.name);
  const helperConfirmed = assignee.status === 'confirmed';

  // Live-reported: a plain synced event with no location at all (a "Rent"
  // reminder synced from Apple/Google, category 'Event') showed a full
  // "Who's driving?" assignment picker — this whole family of actions was
  // designed around events someone actually needs to physically go to
  // (Ride/Medical/Sports/etc — anywhere a helper/driver concept makes
  // sense), and was previously gated purely on category/status with no
  // check for whether the event has anywhere to go at all. Requiring a
  // real location matches helperMissing's own narrower gate elsewhere in
  // this app (hubComponents.tsx) and the user's own call: "if the
  // location is set then we can show who is handling."
  //
  // Only gates OFFERING the picker on an event with no assignee yet — a
  // second live-reported bug: some synced events (e.g. a health system's
  // Google Calendar invite) put the real address inside the description/
  // notes text instead of the structured location field, so hasLocation
  // read false even though the event clearly has somewhere to go — and an
  // assignee had already been set (pending) by an earlier code path. That
  // left a stuck "Pending" badge with zero way to act on it: Remind,
  // Reassign, Confirm, and Can't were all suppressed. Once a real assignee
  // already exists, the location question is moot (something already
  // decided this event needs a driver/helper) — always allow acting on an
  // existing assignment regardless of hasLocation; hasLocation only
  // controls whether a BRAND NEW assignment gets offered on an
  // unassigned event.
  const hasLocation = !!ev.location;
  const hasAssignee = !!assignee.name;
  const showRemind = !isPast && !isWork && isViewerParent && (hasLocation || hasAssignee) && !!assignee.name && helperPending && !isSelfAssigned;
  const showReassign = !isPast && !isWork && isViewerParent && (hasAssignee ? (helperPending && !isSelfAssigned) || helperRejected : hasLocation);
  const showAssignToMe = showReassign && !isSelfAssigned && viewer.hasCar !== false;
  const showOverride = !isPast && !isWork && isViewerParent && helperConfirmed && !isSelfAssigned;
  const showCantMakeIt = !isPast && !isWork && isSelfAssigned && (helperConfirmed || helperPending);
  const showConfirm = !isPast && !isWork && isSelfAssigned && helperPending;

  return { assignee, assigneeRole, isSelfAssigned, showRemind, showReassign, showAssignToMe, showOverride, showCantMakeIt, showConfirm };
}

export interface EventEditPermission {
  // Full edit surface (reassign helper/driver, change memberIds, GP/Teen
  // pool toggles, etc.) — parent, or a senior editing an event they're the
  // subject/organiser of.
  canEditFull: boolean;
  // Can still change SOME fields (notes/alertCall/date-time) but not the
  // full reassignment surface — a kid/teen's own still-pending request, or
  // a senior's own event.
  canEditRestricted: boolean;
  // Read-only — past, an already-approved event viewed by the requesting
  // kid, or ANY event viewed by a teen who isn't its own pending request.
  restricted: boolean;
  isOwnPending: boolean;
}

// Extracted from EventFormModal.tsx's EditEventModal (isParent/isPast/
// isOwnPending/isOwnEventBySenior/isForeignToTeen/restricted) so a second
// surface with edit access to a calendar event — the kiosk's own event
// editor — can call the EXACT same rule instead of a second, driftable
// copy. Live-reported gap this closes: KioskEventEditor.tsx had ZERO role
// checks at all, so any kid/teen active on a shared kiosk device could
// edit or delete ANY family event, matching neither this permission model
// nor RBAC in general.
export function deriveEventEditPermission(
  ev: Pick<FamilyEvent, 'date' | 'time' | 'approvalPending' | 'memberId' | 'memberIds' | 'category' | 'rideRequired' | 'isOpenToGrandparents'>,
  viewer: { id: string; role: FamilyMember['role'] },
): EventEditPermission {
  const isParent = viewer.role === 'parent';
  const isKid = viewer.role === 'kid';
  const isTeen = viewer.role === 'teen';
  const isSenior = viewer.role === 'senior';

  const isPast = (() => {
    if (!ev.date) return false;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (ev.date < todayStr) return true;
    if (ev.date > todayStr) return false;
    if (!ev.time) return false;
    const [h, m] = ev.time.split(':').map(Number);
    return h < today.getHours() || (h === today.getHours() && m <= today.getMinutes());
  })();

  const isOwnPending = (isKid || isTeen) && !!ev.approvalPending && ev.memberId === viewer.id;
  const isOwnEventBySenior = isSenior && (
    ev.memberId === viewer.id ||
    (!ev.memberId && !ev.memberIds?.length &&
      (ev.category !== 'Ride' && !ev.rideRequired ? true : !!ev.isOpenToGrandparents))
  );
  const isParentApproved = !ev.approvalPending;
  const isForeignToTeen = isTeen && !isOwnPending;
  const restricted = isPast || (isKid && isParentApproved) || isForeignToTeen;

  return {
    canEditFull: !restricted && (isParent || isOwnEventBySenior),
    canEditRestricted: !restricted && !isParent && (isOwnPending || isOwnEventBySenior),
    restricted,
    isOwnPending,
  };
}
