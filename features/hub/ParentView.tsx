import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TYPO } from '@/constants/theme';
import { useQuestStore } from '@/store/choreAdapter';
import { useEventStore, eventAssignee } from '@/store/eventStore';
import { useGroceryStore } from '@/store/groceryStore';
import { useKidRequestStore } from '@/store/kidRequestStore';
import { useTemporaryApproverStore } from '@/store/temporaryApproverStore';
import { AddQuestModal } from '@/features/quests/QuestsScreen';
import { AddEventModal } from '@/features/calendar/EventFormModal';
import type { FamilyMember } from '@/store/familyStore';
import { AlertBanner, PickupRadarStatus } from './hubComponents';
import { localToday, hoursUntilEvent, isWorkEvent, minutesBetween } from './hubUtils';
import { TodayView, GreetingHeader } from './TodayView';
import { useChoreStore } from '@/store/choreStore';
import type { ChoreTask } from '@/store/choreStore';

import { ParentQuickActions } from './parent/ParentQuickActions';
import { TemporaryApproverCard } from './parent/TemporaryApproverCard';
import { FamilyRadarSection } from './parent/FamilyRadarSection';
import { EnRouteBanner } from './parent/EnRouteBanner';
import { ActionNeededSection } from './parent/ActionNeededSection';
import { GpCanHelpSection } from './parent/GpCanHelpSection';
import { HouseholdBacklogSection } from './parent/HouseholdBacklogSection';
import { ChoreReviewSection } from './parent/ChoreReviewSection';
import { PushbackSheet } from './parent/PushbackSheet';
import { DelegateSheet } from './parent/DelegateSheet';

export function ParentView({ active, members, colors, isDark, onScanFlyer, onDispatchDirect, onPickupDone, onCancelTrip, activeTrip, otherActiveTrips, onUpdateEta }: {
  active: FamilyMember; members: FamilyMember[];
  colors: any; isDark: boolean;
  onScanFlyer: () => void;
  // Dispatches immediately, no modal — memberId is nextRide's kid when one
  // is linked, else undefined for a generic "family" broadcast. Matches the
  // mock's plain in-card toggle exactly (no picker ever).
  onDispatchDirect: (memberId: string | undefined, etaMinutes: number) => void;
  onPickupDone: (tripId: string) => void;
  onCancelTrip: (tripId: string) => void;
  activeTrip?: { tripId: string; kidName: string; kidEmoji?: string; driverName: string; driverEmoji?: string; driverMemberId?: string; etaMinutes: number; startedAtMs?: number } | null;
  // Every OTHER concurrently-active trip besides `activeTrip` (e.g. a
  // different parent's own trip, running at the same time as this parent's)
  // — rendered read-only below `activeTrip`'s own card so a trip started by
  // someone else is never invisible just because this parent's Hub is
  // showing their own dispatch UI in the primary slot.
  otherActiveTrips?: { tripId: string; kidName: string; kidEmoji?: string; driverName: string; driverEmoji?: string; driverMemberId?: string; etaMinutes: number; startedAtMs?: number }[];
  onUpdateEta?: (tripId: string, etaMinutes: number) => void;
}) {
  const { quests, approveQuest, declineQuest, updateQuest } = useQuestStore();
  const { events, updateEvent, addEvent, updateEventScoped }  = useEventStore();
  const { items: groceryItems, load: loadGrocery, addItem: addGroceryItem } = useGroceryStore();
  const { requests: kidRequests, loaded: kidRequestsLoaded, loadFromStorage: loadKidRequests,
          approveRequest, declineRequest, approveItems, rejectItems, toggleGPWelcome } = useKidRequestStore();
  const { grants: approverGrants, loaded: approverGrantsLoaded, loadFromStorage: loadApproverGrants,
          grantTemporaryApprover, revokeTemporaryApprover, getActiveGrantsForFamily } = useTemporaryApproverStore();

  const {
    parentAssignments, createAndAddParentQuest, addParentQuest,
    respondToParentQuest, completeParentQuest, cancelLockedAssignment, recallParentQuest, appreciationPing, getParentQuestPool,
    getPendingCashOuts, chores, addChore, getParentReviewDeck,
    approveGrandparentQuestAsParent, declineGrandparentQuestAsParent, grandparentApproveAndCheer,
    approveTeenReward, adjustTeenReward, declineTeenReward,
    acceptGPOffer, declineGPOffer,
    flagApprovalForDiscussion, standByApproval, requestApprovalReversal, coSignReversal,
    acknowledgeRecentApproval,
    getMyDirectPending, getMyLockedItems, getMyOutgoingPending, getActiveAssignmentChoreIds,
    loadFromStorage: loadChores, syncFromDB: syncChores,
  } = useChoreStore();
  const pendingReviews = getParentReviewDeck();

  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  // Quick-action entry points go through the Speak it/Type it chooser first
  // (matching the existing pet-appointment voice flow) — HouseholdBacklog's
  // own "add task" trigger below still opens the manual quest form directly,
  // since that's a narrower, already-scoped-to-backlog action.
  // "Adjust in full form" handoff from VoiceIntakeReviewSheet — seeds
  // whichever manual modal opens next with the AI-extracted fields.
  const [addPrefill, setAddPrefill] = useState<{
    title: string; category?: string; memberId?: string; startAt?: string;
    notes?: string; coins?: number; photoRequired?: boolean;
  } | undefined>(undefined);
  const [pushbackSheet, setPushbackSheet] = useState<{ assignmentId: string; choreTitle: string; assignedBy: string; assignedTo: string } | null>(null);
  const [delegateSheet, setDelegateSheet] = useState<{ choreId: string; choreTitle: string } | null>(null);

  useEffect(() => { loadGrocery((active as any).familyId ?? 'family-1'); }, [(active as any).familyId]);
  useEffect(() => { if (!kidRequestsLoaded) loadKidRequests(); }, [kidRequestsLoaded]);
  useEffect(() => { if (!approverGrantsLoaded) loadApproverGrants(); }, [approverGrantsLoaded]);
  const activeApproverGrants = getActiveGrantsForFamily();
  // This must run even when the review section starts collapsed. Otherwise a
  // parent who opens the Hub after a grandparent creates a quest never joins
  // the chore realtime channel and cannot see the safety-review request.
  useEffect(() => {
    loadChores().then(() => { void syncChores(); });
  }, [loadChores, syncChores]);

  const allNames  = members.map(m => m.name);
  const today     = localToday();

  // All events today (sorted) — Work events hidden from timeline but used for conflict detection
  const allTodayEvents = events
    .filter(e => e.date === today)
    .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
  const workEvents    = allTodayEvents.filter(e => isWorkEvent(e));
  const todayEvents   = allTodayEvents.filter(e => !isWorkEvent(e));

  // Excludes rideRequired — that field pair (driverName/driverStatus) is
  // handled entirely by pendingRideRequiredEvents below via
  // RideRequiredEventCard. Without this exclusion, a KID-created
  // rideRequired event (which also sets approvalPending=true at creation,
  // same as a plain Ride request) matched here first and rendered via
  // RideRequestCard instead — a card that reads/writes helper/helperStatus,
  // which this event never uses, so "I'll Drive" silently wrote to a field
  // nothing else in the app was watching while the event stayed stuck
  // "needs a driver" forever on its actual field pair (QA Round 11, High
  // Finding H2).
  const pendingRequests  = events.filter(e =>
    e.approvalPending && !e.rideRequired && !isWorkEvent(e) && hoursUntilEvent(e.date, e.time) >= 0
  );
  // A non-Ride event (Sports/Study/Medical/etc) with its own "needs a ride"
  // toggle (rideRequired) previously had NO presence in Action Needed at
  // all — only category:'Ride' events fed pendingRequests above. A parent
  // had to notice it buried in the day's Schedule/Agenda instead, and each
  // materialized occurrence of a recurring rideRequired series showed its
  // own separate "no driver" indicator there with no way to decide once.
  // This treats "still needs a driver" the same way regardless of which
  // field pair the event uses (helper/helperStatus for Ride,
  // driverName/driverStatus for rideRequired) — both feed the same Action
  // Needed surface and the same series-dedup/carry-forward behavior.
  const pendingRideRequiredEvents = events.filter(e => {
    if (!e.rideRequired || isWorkEvent(e) || hoursUntilEvent(e.date, e.time) < 0) return false;
    // rideRequired's assignee can live in EITHER field pair — driverName/
    // driverStatus (assigned via RideRequiredEventCard/reassign_event) or
    // helper/helperStatus (assigned via the plain Ride-category create
    // form, which never touches driverName at all). Checking driverName
    // alone missed every rideRequired event whose driver actually landed
    // in the helper pair — it silently never showed up in Action Needed,
    // however unconfirmed it stayed (reported live: an unconfirmed
    // today-driver ride wasn't surfacing on the parent's Hub at all).
    const a = eventAssignee(e);
    return !a.name || a.status === 'pending';
  });
  // pending_approval and pending_grandparent_approval both collapse to the
  // same client-side status (choreAdapter's choreStatusToQuestStatus) — a
  // grandparent_quest awaiting its sponsor's review must NOT show up in the
  // parent's own queue, that review belongs to the grandparent who created it.
  // Quest/chore approvals live ONLY in "Chore Reviews" (ParentReviewDeck) —
  // previously also duplicated here in "Action Needed" with a different
  // card design for the exact same item. actionCount below intentionally
  // excludes these; ChoreReviewSection's own badge covers them.

  const rejectedHelperEvents = todayEvents.filter(e => eventAssignee(e).status === 'rejected');

  // ── Conflict detection ────────────────────────────────────────────────────
  const conflictReasons = new Map<string, string>(); // eventId → reason label
  const upcomingEvents = todayEvents.filter(e => hoursUntilEvent(e.date, e.time) >= 0);

  // A: kid double-booked (same memberId, same date, <30 min, non-Work)
  const timedMemberEvents = upcomingEvents.filter(e => !!e.time && !!e.memberId);
  for (let i = 0; i < timedMemberEvents.length; i++) {
    for (let j = i + 1; j < timedMemberEvents.length; j++) {
      const a = timedMemberEvents[i], b = timedMemberEvents[j];
      if (a.memberId !== b.memberId) continue;
      if (minutesBetween(a.time!, b.time!) < 30) {
        const kidName = members.find(m => m.id === a.memberId)?.name.split(' ')[0] ?? 'Kid';
        const label = `${kidName} double-booked`;
        if (!conflictReasons.has(a.id)) conflictReasons.set(a.id, label);
        if (!conflictReasons.has(b.id)) conflictReasons.set(b.id, label);
      }
    }
  }

  // B: helper/driver double-booked (same helper name, <30 min, not rejected, non-Work)
  const timedHelperEvents = upcomingEvents.filter(e => !!e.time && !!e.helper && e.helperStatus !== 'rejected');
  for (let i = 0; i < timedHelperEvents.length; i++) {
    for (let j = i + 1; j < timedHelperEvents.length; j++) {
      const a = timedHelperEvents[i], b = timedHelperEvents[j];
      if (a.helper !== b.helper) continue;
      if (minutesBetween(a.time!, b.time!) < 30) {
        const label = `${a.helper!.split(' ')[0]} assigned to 2 events`;
        if (!conflictReasons.has(a.id)) conflictReasons.set(a.id, label);
        if (!conflictReasons.has(b.id)) conflictReasons.set(b.id, label);
      }
    }
  }

  // C: family event vs. Work event overlap — only for upcoming work events too
  const upcomingWorkEvents = workEvents.filter(e => hoursUntilEvent(e.date, e.time) >= 0);
  for (const familyEv of timedMemberEvents) {
    for (const workEv of upcomingWorkEvents) {
      if (familyEv.memberId !== workEv.memberId) continue;
      if (!workEv.time) continue;
      if (minutesBetween(familyEv.time!, workEv.time) < 30) {
        const memberName = members.find(m => m.id === familyEv.memberId)?.name.split(' ')[0] ?? 'their';
        if (!conflictReasons.has(familyEv.id)) {
          conflictReasons.set(familyEv.id, `Conflicts with ${memberName}'s work`);
        }
      }
    }
  }

  // D: family event vs. THE OTHER PARENT's work block — e.g. a ride
  // assigned to Alex during a window Alex is actually at work. Distinct
  // from check C, which only catches a kid's own event colliding with a
  // work event for that same person — this catches a helper assignment
  // colliding with the helper's own work schedule.
  const timedHelperAssignments = upcomingEvents.filter(e => !!e.time && !!e.helper && e.helperStatus !== 'rejected');
  for (const familyEv of timedHelperAssignments) {
    const helperMember = members.find(m => m.name === familyEv.helper);
    if (!helperMember) continue;
    for (const workEv of upcomingWorkEvents) {
      if (workEv.memberId !== helperMember.id) continue;
      if (!workEv.time) continue;
      if (minutesBetween(familyEv.time!, workEv.time) < 30) {
        if (!conflictReasons.has(familyEv.id)) {
          conflictReasons.set(familyEv.id, `Conflicts with ${helperMember.name.split(' ')[0]}'s work`);
        }
      }
    }
  }

  // Other parents' Work events today, for the read-only coordination strip
  // on TodayView — never the viewer's own (they don't need to be told about
  // their own work block).
  const otherParentsWorkToday = workEvents
    .filter(e => e.memberId && e.memberId !== active.id)
    .map(e => ({
      id: e.id, title: e.title,
      time: e.time, ownerName: members.find(m => m.id === e.memberId)?.name.split(' ')[0] ?? 'Parent',
    }));

  const conflictEventIds = new Set(conflictReasons.keys());
  const conflictEvents   = todayEvents.filter(e => e.conflict || conflictEventIds.has(e.id));

  // Escalation: helper/driver pending + no response + < 1 hr away — was
  // helper-only, so a driverName-based kid ride request (every kid ride
  // request now uses this pair) never escalated into this urgency banner
  // at all, no matter how close the deadline (QA sweep, kid-role audit,
  // Medium — feeds directly off the same field-pair gap fixed elsewhere).
  const pendingNoResponse = todayEvents.filter(e => {
    const a = eventAssignee(e);
    return !!a.name && a.status === 'pending' &&
      hoursUntilEvent(e.date, e.time) < 1 && hoursUntilEvent(e.date, e.time) >= 0;
  });

  // Escalation: transport event unassigned + < 2 hr away — same fix.
  const unassignedUrgent = todayEvents.filter(e => {
    const a = eventAssignee(e);
    if (!e.location || e.approvalPending || a.name || e.declinedBy) return false;
    if (a.status === 'rejected') return false;
    const h = hoursUntilEvent(e.date, e.time);
    return h >= 0 && h < 2;
  });

  const urgentRejected = rejectedHelperEvents.filter(ev => {
    const h = hoursUntilEvent(ev.date, ev.time);
    return h >= 0 && h < 4;
  });

  // Escalation: driver CONFIRMED, scheduled time already passed by 5+ min,
  // but no trip was ever dispatched for this pickup — the one gap none of
  // the other 3 escalations above cover. pendingNoResponse only matches
  // status 'pending' (and stops matching once the event's time is already
  // in the past, since it requires hoursUntilEvent >= 0). unassignedUrgent
  // explicitly excludes any event with an assignee name. So a ride that
  // went all the way to "confirmed" and then nobody actually tapped
  // Dispatch/En Route for was invisible to every parent-facing escalation —
  // and to the OTHER parent specifically, since only the driving parent's
  // own device runs HubScreen's TripEffects overdue timer, and that timer
  // only exists once a trip row exists at all. The kid still gets a manual
  // "driver hasn't arrived" alert (KidUrgentAlerts) they can tap to send,
  // but nothing pushes to the parents automatically. Matches tripStore's
  // own 5-minute overdue grace window for consistency.
  // (Direct question: "does the app escalate if either side fails to
  // confirm" — this was the one path with no escalation on either side.)
  const activeTripDriverNames = new Set(
    [activeTrip, ...(otherActiveTrips ?? [])]
      .filter((t): t is NonNullable<typeof t> => !!t)
      .map(t => t.driverName)
  );
  const neverDispatchedOverdue = todayEvents.filter(e => {
    const a = eventAssignee(e);
    if (!a.name || a.status !== 'confirmed' || e.approvalPending) return false;
    if (activeTripDriverNames.has(a.name)) return false; // a trip IS running, just use the normal overdue path
    const h = hoursUntilEvent(e.date, e.time);
    return h < 0 && h > -2; // same 2hr outer bound as unassignedUrgent, so a days-old stale row doesn't linger forever
  });

  const showBanner     = conflictEvents.length > 0 || urgentRejected.length > 0 ||
                         pendingNoResponse.length > 0 || unassignedUrgent.length > 0 ||
                         neverDispatchedOverdue.length > 0;
  const pendingKidRequests = kidRequests.filter(r => {
    // Coordinated live-DB QA (Round 20, High) — a multi-item grocery/
    // supplies request transitions to 'partial' the moment any item is
    // decided while others remain undecided (kidRequestStore.ts's
    // approveItems/rejectItems). This filter only ever matched 'pending',
    // so a request with one genuinely still-open item vanished from BOTH
    // parents' Action Needed the instant the first item was decided — with
    // no history view on the parent side to ever find it again.
    // GroceryRequestCard already renders only the still-pending items
    // within a request regardless of its overall status, so surfacing
    // 'partial' here is safe — it won't show anything already resolved.
    if (!['pending', 'partial'].includes(r.status)) return false;
    // Auto-expire checkin requests older than 2 hours
    if (r.type === 'checkin') {
      const ageHours = (Date.now() - new Date(r.requestedAt).getTime()) / 3_600_000;
      if (ageHours > 2) return false;
    }
    // Hide grocery/supplies delegation cards that have no items — nothing
    // actionable to show. A cash-out request is ALSO type 'delegation' but
    // is plain text with no items by design (see TeenView's requestCashOut)
    // — this filter used to drop those silently before they ever reached
    // the parent's Action Needed feed at all.
    if (r.type === 'delegation' && (r.items?.length ?? 0) === 0 && !r.detail.startsWith('💵')) return false;
    return true;
  });
  // Approved ride/help requests still pending a helper — parent can flag these for GP
  const approvedRideRequests = kidRequests.filter(r =>
    r.status === 'approved' &&
    ['ride', 'tutor', 'cheer'].includes(r.type) &&
    !r.assignedHelper
  );
  // Matches ActionNeededSection's own series dedup (only the soonest
  // occurrence of a recurring ride series renders as a card there) — this
  // badge count must agree with what's actually shown, or the "12 pending"
  // badge and a list of 1 card look like a bug on their own. Both
  // pendingRequests (Ride category) and pendingRideRequiredEvents (any
  // other category's own ride need) go through the same series collapse.
  const allPendingRides = [...pendingRequests, ...pendingRideRequiredEvents];
  const dedupedSeriesCount = new Set(allPendingRides.filter(e => e.seriesId).map(e => e.seriesId)).size;
  const seriesOverflowCount = allPendingRides.filter(e => e.seriesId).length - dedupedSeriesCount;
  const actionCount = allPendingRides.length - seriesOverflowCount + pendingKidRequests.length;

  const familyId = (active as any).familyId ?? 'family-1';

  // Scenario 1.4 — approving a kid's quest_proposal request must create a
  // real, live pool quest (not just flip the request's own status the way
  // every other kid_request approve action does). Mirrors addChore's
  // ordinary pool-quest defaults (no assignee = open pool, claimable by any
  // kid/teen), and notifies the requesting kid via chat the same way
  // approveTeenReward/declineGrandparentQuest already centralize their
  // outcome notifications.
  const approveQuestProposalHandler = (req: any, finalCoins: number) => {
    addChore({
      title: req.detail,
      categoryType: 'routine',
      category: 'Other',
      basePoints: 0,
      coinsReward: finalCoins,
      xpReward: 10,
      status: 'todo',
      isPool: true,
      requiresPhotoProof: false,
      recurrenceRule: { frequency: 'once' },
      familyId: (active as any).familyId,
      createdById: active.id,
    });
    approveRequest(req.id, active.id, `Approved as a ${finalCoins}-coin quest!`);
    try {
      const { useChatStore } = require('@/store/chatStore');
      useChatStore.getState().sendMessage(req.fromMemberId, active.id,
        `✅ Your quest idea "${req.detail}" was approved for ${finalCoins} coins — go ahead!`);
    } catch (e) {
      console.warn('[ParentView] approveQuestProposal notification failed', e);
    }
  };

  const declineQuestProposalHandler = (req: any, reason?: string) => {
    declineRequest(req.id, active.id, reason);
    try {
      const { useChatStore } = require('@/store/chatStore');
      useChatStore.getState().sendMessage(req.fromMemberId, active.id,
        `Your quest idea "${req.detail}" wasn't approved this time${reason ? ` — "${reason}"` : ''}.`);
    } catch (e) {
      console.warn('[ParentView] declineQuestProposal notification failed', e);
    }
  };

  const approveItemsAndSync = async (reqId: string, itemIds: string[], isSuppliesReq: boolean) => {
    const req = kidRequests.find(r => r.id === reqId);
    if (!req) return;
    approveItems(reqId, itemIds, active.id);
    if (req.items) {
      const approved = req.items.filter(it => itemIds.includes(it.id));
      for (const item of approved) {
        await addGroceryItem({
          familyId,
          name: item.name,
          quantity: item.qty || undefined,
          category: isSuppliesReq ? 'Supplies' : (item.category ?? 'Other'),
          addedBy: req.fromMemberId,
        });
      }
    }
  };

  // Parent Quest pool (PULL mode backlog) + direct assignments pending response
  // Merges chore-based parent_only_quest pool AND questStore isAdultTask quests
  const chorePool        = getParentQuestPool();
  const adultMemberIds   = new Set(members.filter(m => m.role === 'parent' || m.role === 'senior').map(m => m.id));
  const doneStatuses     = new Set(['done', 'approved', 'archived', 'cancelled', 'completed']);

  // Adult quests: parent_only_quest type OR directly assigned to a parent/senior
  // Rides/pickups are FamilyEvents, not Quests — a Quest can never actually
  // have category 'Ride' (not a valid QuestCategory value), so that dead
  // exclusion check is removed; ride tasks were never reachable here to
  // begin with, they live on the calendar, not the Household Backlog.
  const adultQuests = quests.filter(q => {
    if (doneStatuses.has(q.status)) return false;
    if (q.isAdultTask) return true;                                          // category_type === 'parent_only_quest' or shopping
    if (q.assignedToId != null && adultMemberIds.has(q.assignedToId)) return true;  // directly assigned to adult (parent/GP)
    return false;
  });

  // A chore/quest can carry a stale System-B assignedToId while a NEWER
  // System-A delegation (parent_quest_assignments row) is actually live and
  // pending on someone else — DelegateSheet's reassign flow creates a fresh
  // PENDING System-A row without ever touching the old assignedToId (see
  // its onPress handler, which calls addParentQuest, not updateChore/
  // updateQuest, for any non-quest-row chore). Without this exclusion, the
  // PREVIOUS assignee kept showing up in othersAdultQuests/myAdultQuests
  // with Nudge/Reclaim actions — even after they'd already reassigned it
  // away and the new assignee had a live, unanswered Accept/Decline card
  // waiting for them via System A. getActiveAssignmentChoreIds() (below)
  // is the same "has a live System-A row" check the pool below already
  // uses to avoid double-listing a chore; applying it here too makes
  // System A the single source of truth once a delegation is actually in
  // flight, instead of the two systems disagreeing about who a chore is
  // "really" assigned to.
  const activeAssignmentChoreIds = getActiveAssignmentChoreIds();
  const adultQuestsNoLiveAssignment = adultQuests.filter(q => !activeAssignmentChoreIds.has(q.id));

  // Split adult quests: mine (assigned to me), others' (assigned to someone else), unassigned (pool)
  const myAdultQuests       = adultQuestsNoLiveAssignment.filter(q => q.assignedToId === active.id);
  const othersAdultQuests   = adultQuestsNoLiveAssignment.filter(q => q.assignedToId && q.assignedToId !== active.id);
  const unassignedAdultQ    = adultQuestsNoLiveAssignment.filter(q => !q.assignedToId);

  const choreIds         = new Set(chorePool.map(c => c.id));
  // Pool = unassigned adult quests + chore-based pool (no duplicates)
  const questPool        = [
    ...chorePool.filter(c => !activeAssignmentChoreIds.has(c.id)),
    ...unassignedAdultQ.filter(q => !choreIds.has(q.id) && !activeAssignmentChoreIds.has(q.id)).map(q => ({
      id: q.id, title: q.title, description: q.description, dueDate: q.dueDate,
      categoryType: 'parent_only_quest' as const, category: q.category,
      basePoints: q.coins, coinsReward: q.coins, xpReward: 0, status: 'todo' as const,
      assignedToId: undefined, isPrivateParent: true, requiresPhotoProof: false,
      redoCount: 0, recurrenceRule: { frequency: 'once' as const },
      createdAt: (q as any).createdAt ?? new Date().toISOString(), _isQuestRow: true,
      shoppingItems: (q as any).shoppingItems, shoppingStore: (q as any).shoppingStore, shoppingBudget: (q as any).shoppingBudget,
    })),
  ];

  // IDs already rendered in System B (direct assignedToId) — exclude from System A (parentAssignments)
  const systemBIds = new Set([...myAdultQuests, ...othersAdultQuests].map(q => q.id));

  // Shared with QuestsScreen.tsx via choreStore selectors rather than each
  // screen re-deriving this filtering independently — a change to the
  // snooze-expiry or bounce rules now only has to happen in one place.
  const myDirectPending   = getMyDirectPending(active.id);
  const myLockedItems     = getMyLockedItems(active.id);
  // getMyAccepted/AcceptedQuestCard removed — respondToParentQuest's ACCEPT
  // branch always syncs chore_tasks.assigned_to_id in the same action that
  // sets the assignment's status to ACCEPTED, so the "accepted but
  // assignedToId still unset" state getMyAccepted filtered for can never
  // actually occur; it was permanently dead code. MyAdultQuestCard
  // (System B, rendered via myAdultQuests below) is the real, reachable
  // card for an accepted delegation — confirmed via live QA to render
  // with the correct Done/Reassign/Nudge-back actions.
  const myOutgoingPending = getMyOutgoingPending(active.id);
  // Calendar events where this parent is the assigned helper/driver — show in HB.
  // Backlog is for things still needing action: once confirmed, it's a settled
  // commitment (visible in Schedule instead), not something to pull off a backlog.
  const myHelperEvents = events.filter(e => {
    if (!e.helper || e.helper !== active.name) return false;
    if (e.helperStatus === 'rejected' || e.helperStatus === 'confirmed') return false;
    return (e.date ?? '') >= today;
  });

  // A ride the OTHER parent opened to helpers, or that's been claimed by
  // a GP/teen but not yet confirmed, previously fell through every parent
  // surface: pendingRequests requires approvalPending (already cleared
  // once opened), pendingRideRequiredEvents requires rideRequired (this
  // is category:'Ride'), myHelperEvents requires this parent to BE the
  // assignee. A parent had zero visibility into a co-parent's outstanding
  // ride until it either got confirmed or stalled long enough to trip the
  // <1hr escalation banner (QA Round 12, Finding M3 — confirmed still
  // open). Read-only awareness only, deliberately no claim/assign action
  // here — offering one would reopen the exact claim-race class Round 11
  // just closed, from a third surface.
  const familyRideCoordination = events.filter(e => {
    if (e.createdBy === active.id || isWorkEvent(e)) return false;
    if (!(e.isOpenToGrandparents || e.isOpenToTeens)) return false;
    if (eventAssignee(e).status === 'confirmed') return false;
    return hoursUntilEvent(e.date, e.time) >= 0;
  });

  const backlogCount = questPool.length + myAdultQuests.length + othersAdultQuests.length + myHelperEvents.length;

  // The next confirmed ride THIS parent is driving today, soonest first —
  // Pick-up Radar's "Up Next" card links to this instead of only ever
  // offering the manual "pick anyone" dispatch modal.
  const myUpcomingRides = todayEvents
    .filter(e => { const a = eventAssignee(e); return a.name === active.name && a.status === 'confirmed' && !!e.memberId
      && hoursUntilEvent(e.date, e.time) >= -0.5; })
    .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
  const nextRide = myUpcomingRides[0];
  // pendingReviews (Chore Reviews) intentionally excluded — GreetingHeader
  // already counts those itself via useQuestStore, which reads the same
  // underlying chores array; including it here would double-count.
  const otherAttentionCount = actionCount + backlogCount;

  const handlePullTask = (chore: ChoreTask) => {
    addParentQuest(chore.id, active.id, active.id, 'PULL');
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const reviewedToday = chores.filter(c =>
    (c.status === 'approved' || c.status === 'auto_approved') &&
    (c.reviewedAt ?? '').startsWith(todayStr)
  ).length;
  const pendingCashOuts = getPendingCashOuts();
  const kids = members.filter(m => m.role === 'kid');
  const avgStreak = kids.length > 0
    ? Math.round(kids.reduce((s, k) => s + ((k as any).streak ?? 0), 0) / kids.length)
    : 0;
  const leaderboardKids = [...kids].sort((a, b) =>
    ((b as any).streak ?? 0) - ((a as any).streak ?? 0)
  );

  const pad = { paddingHorizontal: 16 };

  // Order matches the reference mock's Hub sequence — Greeting → Quick
  // Actions → Today's Timeline → Action Needed → Household Backlog →
  // Pick-up Radar — with Family Cube's own sections (not present in the
  // mock at all) placed next to whichever mock section they're closest
  // to in spirit: AlertBanner right after Greeting (urgency-first, same
  // position it already had), HouseholdSnapshotCard right after Quick
  // Actions (a stats/summary block), GpCanHelpSection right after Action
  // Needed (both are "needs a decision" sections), ChoreReviewSection
  // right after Household Backlog (both are chore/task related).
  return (
    <>
      <GreetingHeader colors={colors} isDark={isDark} activeMember={active} otherAttentionCount={otherAttentionCount} />

      {showBanner && (
        <AlertBanner
          conflictEvents={conflictEvents} rejectedEvents={urgentRejected}
          pendingNoResponseEvents={pendingNoResponse} unassignedUrgentEvents={unassignedUrgent}
          neverDispatchedEvents={neverDispatchedOverdue}
          conflictReasons={conflictReasons}
          members={members} colors={colors} isDark={isDark} updateEvent={updateEvent}
          activeName={active.name}
          onDispatch={onDispatchDirect}
        />
      )}

      {/* Entry point for the new persistent Family Settings screen — invite
          members by email or share the join code, anytime (not just once
          during onboarding). */}
      <Pressable
        onPress={() => router.push('/family-settings' as any)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end',
          marginHorizontal: 16, marginBottom: 8 }}>
        <Ionicons name="people" size={13} color={colors.textTertiary} />
        <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.textTertiary }}>Family Settings</Text>
      </Pressable>

      <ParentQuickActions colors={colors} isDark={isDark} groceryCount={groceryItems.length} onScanFlyer={onScanFlyer}
        onAddQuest={() => setShowAddTask(true)} onAddEvent={() => setShowAddEvent(true)} />

      <TodayView
        colors={colors}
        isDark={isDark}
        activeMember={active}
        members={members}
        onAddQuest={() => setShowAddTask(true)}
        onAddEvent={() => setShowAddEvent(true)}
        onAddGrocery={() => router.push('/(tabs)/grocery' as any)}
        conflictReasons={conflictReasons}
        otherParentsWorkToday={otherParentsWorkToday}
      />

      <ActionNeededSection
        actionCount={actionCount}
        pendingRequests={pendingRequests}
        pendingRideRequiredEvents={pendingRideRequiredEvents}
        awaitingApproval={[]}
        pendingKidRequests={pendingKidRequests}
        events={events}
        active={active} members={members} allNames={allNames} colors={colors} isDark={isDark}
        updateEvent={updateEvent} addEvent={addEvent} updateEventScoped={updateEventScoped}
        approveQuest={approveQuest} declineQuest={declineQuest}
        approveRequest={approveRequest} declineRequest={declineRequest}
        toggleGPWelcome={toggleGPWelcome}
        approveItemsAndSync={approveItemsAndSync} rejectItems={rejectItems}
        approveQuestProposal={approveQuestProposalHandler} declineQuestProposal={declineQuestProposalHandler}
      />

      <GpCanHelpSection requests={approvedRideRequests} members={members} colors={colors} isDark={isDark} toggleGPWelcome={toggleGPWelcome} />

      <HouseholdBacklogSection
        active={active} members={members} colors={colors} isDark={isDark}
        questPool={questPool} myAdultQuests={myAdultQuests} othersAdultQuests={othersAdultQuests}
        myDirectPending={myDirectPending} myLockedItems={myLockedItems}
        myOutgoingPending={myOutgoingPending}
        myHelperEvents={myHelperEvents} familyRideCoordination={familyRideCoordination} systemBIds={systemBIds} parentAssignments={parentAssignments}
        updateQuest={updateQuest} updateEvent={updateEvent} updateEventScoped={updateEventScoped}
        completeParentQuest={completeParentQuest} respondToParentQuest={respondToParentQuest}
        cancelLockedAssignment={cancelLockedAssignment} recallParentQuest={recallParentQuest}
        appreciationPing={appreciationPing} handlePullTask={handlePullTask}
        onAddTask={() => setShowAddTask(true)}
        onDelegate={(choreId, choreTitle) => setDelegateSheet({ choreId, choreTitle })}
        onRespond={(assignmentId, choreTitle, assignedBy, assignedTo) => setPushbackSheet({ assignmentId, choreTitle, assignedBy, assignedTo })}
      />

      <ChoreReviewSection
        active={active} members={members} colors={colors} isDark={isDark}
        chores={chores} pendingReviewsCount={pendingReviews.length}
        approveGrandparentQuestAsParent={approveGrandparentQuestAsParent}
        declineGrandparentQuestAsParent={declineGrandparentQuestAsParent}
        grandparentApproveAndCheer={grandparentApproveAndCheer}
        approveTeenReward={approveTeenReward}
        adjustTeenReward={adjustTeenReward}
        declineTeenReward={declineTeenReward}
        acceptGPOffer={acceptGPOffer}
        declineGPOffer={declineGPOffer}
        flagApprovalForDiscussion={flagApprovalForDiscussion}
        standByApproval={standByApproval}
        requestApprovalReversal={requestApprovalReversal}
        coSignReversal={coSignReversal}
        acknowledgeRecentApproval={acknowledgeRecentApproval}
      />

      {/* Only the driver gets editable controls (ETA slider, Pickup Done) —
          another parent sees the same read-only status view kids/teens/GP
          get, so two parents can't fight over the same trip. */}
      {activeTrip && activeTrip.driverMemberId !== active.id ? (
        <PickupRadarStatus colors={colors} isDark={isDark} activeTrip={activeTrip} />
      ) : (
        <EnRouteBanner
          colors={colors} isDark={isDark}
          members={members} activeMemberId={active.id}
          onDispatchRide={(etaMinutes, memberId) => onDispatchDirect(memberId ?? nextRide?.memberId, etaMinutes)}
          onPickupDone={() => activeTrip && onPickupDone(activeTrip.tripId)}
          onCancelTrip={() => activeTrip && onCancelTrip(activeTrip.tripId)}
          nextRide={nextRide ? {
            kidName: members.find(m => m.id === nextRide.memberId)?.name.split(' ')[0] ?? 'Family',
            kidEmoji: members.find(m => m.id === nextRide.memberId)?.emoji,
            title: nextRide.title,
            time: nextRide.time,
            location: nextRide.location,
            hoursUntil: hoursUntilEvent(nextRide.date, nextRide.time),
          } : null}
          activeTrip={activeTrip}
          onUpdateEta={(etaMinutes) => activeTrip && onUpdateEta?.(activeTrip.tripId, etaMinutes)}
        />
      )}

      {/* Every OTHER family member's concurrently-active trip — e.g. the
          other parent driving a different pickup right now. Always
          read-only here regardless of who's driving it, since the slot
          above already covers this parent's own trip (interactive) or the
          single most-relevant other trip (read-only); this covers however
          many MORE trips are active beyond that one. */}
      {otherActiveTrips?.map(trip => (
        <PickupRadarStatus key={trip.tripId} colors={colors} isDark={isDark} activeTrip={trip} />
      ))}

      <View style={pad}>
        <FamilyRadarSection members={members} colors={colors} isDark={isDark} />
      </View>

      {/* Family Leaderboard (HouseholdSnapshotCard) hidden from the Hub per
          explicit request — component/data left fully intact, just not
          rendered, so this is a one-line revert if it's ever wanted back. */}

      {/* Scenarios 9.2/9.3 — temporary-approver / caregiver-mode grants. */}
      <View style={pad}>
        <TemporaryApproverCard
          active={active} members={members} colors={colors} isDark={isDark}
          activeGrants={activeApproverGrants}
          grantTemporaryApprover={grantTemporaryApprover}
          revokeTemporaryApprover={revokeTemporaryApprover}
        />
      </View>

      <PushbackSheet
        target={pushbackSheet} colors={colors} isDark={isDark}
        onClose={() => setPushbackSheet(null)}
        respondToParentQuest={respondToParentQuest}
      />

      <AddQuestModal
        visible={showAddTask}
        onClose={() => { setShowAddTask(false); setAddPrefill(undefined); }}
        activeMemberId={active.id}
        prefill={addPrefill ? {
          title: addPrefill.title,
          coins: addPrefill.coins,
          assignedToId: addPrefill.memberId,
          photoRequired: addPrefill.photoRequired,
          dueDate: addPrefill.startAt ? addPrefill.startAt.slice(0, 10) : undefined,
        } : undefined}
      />

      {/* Same AddEventModal Calendar uses — opened right over the Hub
          instead of navigating away to the Calendar tab, either directly
          (HouseholdBacklog's own trigger) or via the chooser's "Type it"
          below. */}
      <AddEventModal
        visible={showAddEvent}
        onClose={() => { setShowAddEvent(false); setAddPrefill(undefined); }}
        activeMemberId={active.id}
        prefill={addPrefill ? {
          title: addPrefill.title,
          category: addPrefill.category as any,
          memberId: addPrefill.memberId,
          startAt: addPrefill.startAt,
          notes: addPrefill.notes,
        } : undefined}
      />

      <DelegateSheet
        target={delegateSheet} questPool={questPool} members={members} active={active} colors={colors} isDark={isDark}
        onClose={() => setDelegateSheet(null)}
        updateQuest={updateQuest}
        addParentQuest={addParentQuest}
      />
    </>
  );
}
