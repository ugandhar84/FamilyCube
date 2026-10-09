import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Animated, Easing } from 'react-native';
import { router } from 'expo-router';
import { useQuestStore } from '@/store/choreAdapter';
import { useEventStore, eventAssignee } from '@/store/eventStore';
import { localDateStr, todayLocal } from '@/lib/dates';
import { AddQuestModal } from '@/features/quests/QuestsScreen';
import { AddEventModal } from '@/features/calendar/EventFormModal';
import SmartTaskComposer from '@/features/tasks/components/SmartTaskComposer';
import { useFamilyStore } from '@/store/familyStore';
import type { FamilyMember } from '@/store/familyStore';
import { useUIStore } from '@/store/uiStore';
import { AlertBanner } from './hubComponents';
import { localToday, hoursUntilEvent } from './hubUtils';
import { dedupeRideSeries } from './lib/dedupeRideSeries';
import { useChoreStore, type ChoreTask } from '@/store/choreStore';
import { useRewardStore } from '@/store/rewardStore';

import { ParentQuickActions } from './parent/ParentQuickActions';
import { TodayActionGrid } from './parent/TodayActionGrid';
import { RidesStatusCard } from './parent/RidesStatusCard';
import { NextUpTimeline } from './parent/NextUpCard';
import { FamilyPulseCard } from './parent/FamilyPulseCard';
import { ProfileSwitcherCard } from './parent/ProfileSwitcherCard';
import { NeedsYouCard, type NeedsYouItem } from './parent/NeedsYouCard';
import { TonightMealCard } from './parent/TonightMealCard';
import { ReviewConflictModal } from './parent/ReviewConflictModal';
import { PushbackSheet } from './parent/PushbackSheet';
import { DelegateSheet } from './parent/DelegateSheet';
import { TrialNagBanner } from './parent/TrialNagBanner';
import { KidProposalReviewScreen } from './parent/KidProposalReviewScreen';
import { SendAppreciationScreen } from './parent/SendAppreciationScreen';
import { TaskFlowChooser } from '@/features/tasks/components/TaskFlowChooser';
import { CreateResponsibilitySheet } from '@/features/tasks/components/CreateResponsibilitySheet';
import { DispatchRideSheet } from './parent/DispatchRideSheet';
import { QuestDetailModal } from '@/features/quests/components/QuestDetailModal';
import { Modal } from 'react-native';
import { useSubscriptionStore } from '@/store/subscriptionStore';

import { useParentStores } from './parent/hooks/useParentStores';
import { useParentEventClassification } from './parent/hooks/useParentEventClassification';
import { useParentModals } from './parent/hooks/useParentModals';

export function ParentView({ focusKey = 1, active, members, colors, isDark, onScanFlyer, onDescribeTask, onDescribeEvent, describeFullFormRef, onReviewOpen, onRidesOpen, onDispatchDirect, onPickupDone, onCancelTrip, activeTrip, otherActiveTrips, onUpdateEta }: {
  focusKey?: number;
  active: FamilyMember; members: FamilyMember[];
  colors: any; isDark: boolean;
  onScanFlyer: () => void;
  // TodayActionGrid's "Add a task"/"Schedule" tiles open JustDescribeItScreen
  // / JustDescribeItEventScreen — both lifted up to HubScreen (same pattern
  // as AddEventModal/FlyerScannerModal below) and rendered OUTSIDE HubScreen's
  // own ScrollView, not inline here. Rendering them as a conditional block
  // inside ParentView's own returned fragment — which HubScreen mounts
  // INSIDE its ScrollView, right after its own avatar header — nested the
  // Describe It screen's full-page layout inside that scroll content
  // instead of replacing it: live-reported as "already scrolled to top"
  // and showing a stray avatar header that real Describe It screens never
  // have (TasksScreen/CalendarScreen both early-return it as their entire
  // screen, never nest it under another header).
  onDescribeTask: () => void;
  onDescribeEvent: () => void;
  // A Describe It screen's own "adjust in full form" handoff needs to reach
  // back into ParentView's own AddQuestModal/AddEventModal pair + shared
  // addPrefill state (useParentModals()) — rather than duplicating that
  // pair up in HubScreen too, HubScreen hands ParentView a ref and calls
  // .openFullForm(kind, prefill) on it once its Describe It screen closes.
  describeFullFormRef?: React.MutableRefObject<((kind: 'quest' | 'event', prefill: Record<string, any>) => void) | null>;
  // Opens the Review inbox — lifted to HubScreen for the same reason as
  // onDescribeTask/onDescribeEvent above: it must be a true full-page
  // screen (slide/fade/swipe, stacked outside the ScrollView), not a
  // pageSheet Modal nested inside ParentView's own returned fragment.
  onReviewOpen: () => void;
  // Same lift-up, same reason — RidesControlRoomScreen/ActiveTripDetailScreen
  // were still plain pageSheet Modals (no swipe/full-bleed/hidden-tab-bar
  // treatment the Review inbox stack already got) — live-reported: "why
  // didn't we make that page similar to the review inbox ... all swipers
  // and full screen and figma rhythm."
  onRidesOpen: () => void;
  // Dispatches immediately, no modal — memberId is nextRide's kid when one
  // is linked, else undefined for a generic "family" broadcast. Matches the
  // mock's plain in-card toggle exactly (no picker ever). eventId links the
  // resulting trip to the specific calendar event being driven, when one is
  // known — closes a real gap where reassigning a DIFFERENT event's driver
  // could otherwise silently complete this trip too (see reassign_event's
  // event-scoped trip completion, this session).
  onDispatchDirect: (memberId: string | undefined, etaMinutes: number, eventId?: string) => void;
  onPickupDone: (tripId: string) => void;
  onCancelTrip: (tripId: string) => void;
  activeTrip?: { tripId: string; kidName: string; kidEmoji?: string; driverName: string; driverEmoji?: string; driverMemberId?: string; etaMinutes: number; startedAtMs?: number; phase?: import('@/store/tripStore').TripPhase } | null;
  // Every OTHER concurrently-active trip besides `activeTrip` (e.g. a
  // different parent's own trip, running at the same time as this parent's)
  // — rendered read-only below `activeTrip`'s own card so a trip started by
  // someone else is never invisible just because this parent's Hub is
  // showing their own dispatch UI in the primary slot.
  otherActiveTrips?: { tripId: string; kidName: string; kidEmoji?: string; driverName: string; driverEmoji?: string; driverMemberId?: string; etaMinutes: number; startedAtMs?: number; phase?: import('@/store/tripStore').TripPhase }[];
  onUpdateEta?: (tripId: string, etaMinutes: number) => void;
}) {
  const { familyName } = useFamilyStore();
  const { quests, approveQuest, declineQuest, updateQuest } = useQuestStore();
  const { events, updateEvent, addEvent, updateEventScoped }  = useEventStore();
  const { getParentReviewDeck } = useChoreStore();
  // Days 8-14 of the gating timeline (docs/paywall_setup_and_implementation.md):
  // trial ended, not subscribed yet — a dismissible nag, not a lock.
  // trialDaysLeft === -1 means "family data hasn't loaded yet" (computeTrial's
  // own not-yet-known state, distinct from trialDaysLeft: 0 = genuinely
  // expired) — excluding it here stops a brand-new family from flashing the
  // "trial ended" nag for the instant before their real family id loads.
  const { tier, isTrial, trialDaysLeft, loading: subLoading } = useSubscriptionStore();
  const showTrialNag = !subLoading && tier === 'free' && !isTrial && trialDaysLeft !== -1;

  const {
    groceryItems, addGroceryItem,
    kidRequests, approveRequest, declineRequest, approveItems, rejectItems, toggleGPWelcome,
    activeApproverGrants,
    grantTemporaryApprover, revokeTemporaryApprover,
    parentAssignments, addParentQuest,
    respondToParentQuest, completeParentQuest, cancelLockedAssignment, recallParentQuest, appreciationPing, getParentQuestPool,
    getPendingCashOuts, chores, addChore,
    approveGrandparentQuestAsParent, declineGrandparentQuestAsParent, grandparentApproveAndCheer,
    approveTeenReward, adjustTeenReward, declineTeenReward,
    acceptGPOffer, declineGPOffer,
    approveKidProposedChore, declineKidProposedChore,
    resolveRedoDispute,
    flagApprovalForDiscussion, standByApproval, requestApprovalReversal, coSignReversal,
    acknowledgeRecentApproval,
    getMyDirectPending, getMyLockedItems, getMyOutgoingPending, getActiveAssignmentChoreIds,
    pendingReviews,
  } = useParentStores(active);

  const {
    showAddTask, setShowAddTask,
    showAddEvent, setShowAddEvent,
    showTaskComposer, setShowTaskComposer,
    addPrefill, setAddPrefill,
    pushbackSheet, setPushbackSheet,
    delegateSheet, setDelegateSheet,
  } = useParentModals();

  // See describeFullFormRef's own doc above — HubScreen's lifted Describe
  // It screens call this after closing themselves, to fall through to this
  // component's own AddQuestModal/AddEventModal pair with the detected
  // prefill, same handoff the old inline (pre-lift) version did directly.
  useEffect(() => {
    if (!describeFullFormRef) return;
    describeFullFormRef.current = (kind, prefill) => {
      setAddPrefill(prefill as typeof addPrefill);
      setTimeout(() => {
        if (kind === 'quest') setShowAddTask(true);
        else setShowAddEvent(true);
      }, 350);
    };
    return () => { describeFullFormRef.current = null; };
  }, [describeFullFormRef, setAddPrefill, setShowAddTask, setShowAddEvent]);

  // Flow chooser + creation sheets (same as Tasks tab)
  const [showFlowChooser, setShowFlowChooser] = useState(false);
  const [showResponsibilitySheet, setShowResponsibilitySheet] = useState(false);
  const [showRideSheet, setShowRideSheet] = useState(false);
  const [rideSeedMemberId, setRideSeedMemberId] = useState<string | undefined>();
  const [rideSeedTitle, setRideSeedTitle] = useState<string | undefined>();
  const [choreConvertTitle, setChoreConvertTitle] = useState<string | undefined>();
  const [choreConvertMemberId, setChoreConvertMemberId] = useState<string | undefined>();

  // Review inbox + its sub-screens (ChoreProofReview/QuestReview/
  // RewardReview/HelpDispatchQueue) all live in HubScreen now, not here —
  // live direction: they must be true full-page screens (slide/fade/swipe,
  // stacked outside the ScrollView) same as the Describe It screens, not
  // pageSheet Modals, AND the inbox must stay mounted underneath its
  // detail screens instead of closing itself first ("real page handling,"
  // not close-then-reopen). Same lift-up-to-HubScreen pattern as
  // onDescribeTask/onDescribeEvent above — see onReviewOpen below.
  // "Needs You" card's backlog-task CTA ("See task") previously fell
  // through to the chore-APPROVAL inbox (ReviewInboxScreen) — a screen for
  // items awaiting review, which has nothing to do with an unclaimed
  // backlog task and never even named the specific task the card pointed
  // at. Opens that task's own real detail page instead (QuestDetailModal —
  // the same full command-center used everywhere else: claim, submit,
  // approve, reassign, edit, call reminder).
  const [backlogTaskDetailId, setBacklogTaskDetailId] = useState<string | null>(null);
  const [showKidProposals, setShowKidProposals] = useState(false);
  const [showSendAppreciation, setShowSendAppreciation] = useState(false);

  const allNames  = members.map(m => m.name);
  const today     = localToday();

  const {
    todayEvents,
    pendingRequests, pendingRideRequiredEvents,
    conflictReasons,
    otherParentsWorkToday,
    conflictEvents,
    neverDispatchedOverdue,
    showBanner,
    pendingKidRequests,
    approvedRideRequests,
    actionCount,
    myPending, coParentPending,
  } = useParentEventClassification(active, members, events, activeTrip, otherActiveTrips, kidRequests);

  const familyId = (active as any).familyId ?? 'family-1';

  // Scenario 1.4 — approving a kid's quest_proposal request must create a
  // real, live pool quest (not just flip the request's own status the way
  // every other kid_request approve action does). Mirrors addChore's
  // ordinary pool-quest defaults (no assignee = open pool, claimable by any
  // kid/teen), and notifies the requesting kid via chat the same way
  // approveTeenReward/declineGrandparentQuest already centralize their
  // outcome notifications.
  const approveQuestProposalHandler = (req: any, finalCoins: number, schedule?: { dueDate: string; dueTime: string; alertCall: boolean; alertCallLeadMinutes: number }) => {
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
      // A proposal approved WITH the call-reminder toggle carries its own
      // parent-picked due date/time (schedule). One approved plainly (no
      // toggle) previously got no due date at all — it showed on backlog/
      // Quests cards with no due-date label (just the "Tonight" generic
      // fallback) even though it's meant to be done same-day, and every
      // other quest-creation form (AddQuestModal, etc.) always sets one.
      // Default to end of today so it at least shows and sorts as a normal
      // dated chore; the parent's own schedule picker still wins outright
      // whenever they set one explicitly.
      dueDate: schedule?.dueDate ?? todayLocal(),
      ...(schedule ? { dueTime: schedule.dueTime, alertCall: schedule.alertCall, alertCallLeadMinutes: schedule.alertCallLeadMinutes } : {}),
    });
    approveRequest(req.id, active.id, `Approved as a ${finalCoins}-coin chore!`);
    try {
      const { useChatStore } = require('@/store/chatStore');
      useChatStore.getState().sendMessage(req.fromMemberId, active.id,
        `✅ Your chore idea "${req.detail}" was approved for ${finalCoins} coins — go ahead!`);
    } catch (e) {
      console.warn('[ParentView] approveQuestProposal notification failed', e);
    }
  };

  const declineQuestProposalHandler = (req: any, reason?: string) => {
    declineRequest(req.id, active.id, reason);
    try {
      const { useChatStore } = require('@/store/chatStore');
      useChatStore.getState().sendMessage(req.fromMemberId, active.id,
        `Your chore idea "${req.detail}" wasn't approved this time${reason ? ` — "${reason}"` : ''}.`);
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
          storePreference: item.store,
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
  // Live-reported dead-end bug: a chore whose assignedToId got cleared for
  // delegation (choreStore.ts's addParentQuest, clearStaleAssignedToId)
  // used to keep isPool at whatever it was before — false for a chore
  // that was directly assigned at creation — leaving assignedToId===null
  // but isPool===false once the fresh delegation's own
  // parent_quest_assignments row resolved to a terminal status (that fix
  // now forces isPool:true there too, but this filter shouldn't ALSO rely
  // solely on assignedToId being the single source of truth for "is this
  // really poolable" — claim_pool_quest's own server-side check requires
  // is_pool=true, so a card that can render but never successfully claim
  // is exactly the "Someone else already took that" dead end this
  // matches against directly instead of re-deriving it from assignedToId
  // alone).
  const unassignedAdultQ    = adultQuestsNoLiveAssignment.filter(q => !q.assignedToId && (q as any).isPool !== false);

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
  // Calendar events where this parent is the assigned helper/driver — show
  // in Household Backlog. Backlog is for things still needing action: once
  // confirmed, it's a settled commitment (visible in Schedule instead), not
  // something to pull off a backlog. Sourced from classifyEventUrgency
  // above (myPending) — see that file for the exact rule.
  // Live-reported: a recurring ride ("Drop Jaswi for her dance class")
  // showed EVERY future occurrence as its own pending card in the
  // Household Backlog's "You're the driver / helper" section — Sep 9, 16,
  // 23, 30, Oct 7, all stacked at once — instead of just the soonest one.
  // dedupeRideSeries (only the soonest occurrence per seriesId survives)
  // was already applied to pendingRequests/pendingRideRequiredEvents
  // above for ActionNeededSection's own cards and this file's actionCount
  // badge, but myPending/coParentPending (a SEPARATE classifyEventUrgency
  // bucket feeding THIS section) never got the same treatment — the two
  // buckets look similar but are independently derived, so fixing one
  // silently left the other exposed to the identical bug.
  //
  // Each list deduped in its OWN call, not a shared one — dedupeRideSeries'
  // seenSeries set spans every list passed together (fine for two lists
  // that never actually share a seriesId), but myPending/coParentPending
  // are partitioned by ASSIGNEE identity (mine vs the co-parent's), not by
  // occurrence-of-series: the same recurring series could have THIS
  // parent assigned to one future occurrence and the co-parent assigned
  // to a different one, and each side still needs its own soonest-
  // occurrence representative — a shared call would incorrectly let
  // whichever list is processed first suppress the other's legitimate
  // occurrence of the same series.
  const [myHelperEvents] = dedupeRideSeries(myPending);
  const [coParentHelperEvents] = dedupeRideSeries(coParentPending);

  const backlogCount = questPool.length + myAdultQuests.length + othersAdultQuests.length + myHelperEvents.length
    + coParentHelperEvents.length;

  // The next confirmed ride THIS parent is driving today, soonest first —
  // Pick-up Radar's "Up Next" card links to this instead of only ever
  // offering the manual "pick anyone" dispatch modal.
  const myUpcomingRides = todayEvents
    .filter(e => {
      const a = eventAssignee(e);
      // id-based — falls back to name only for an external, non-member
      // assignee with no id at all.
      const isMine = a.id ? a.id === active.id : a.name === active.name;
      return isMine && a.status === 'confirmed' && !!e.memberId
      && hoursUntilEvent(e.date, e.time) >= -0.5;
    })
    .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
  const nextRide = myUpcomingRides[0];
  // pendingReviews (Chore Reviews) intentionally excluded — GreetingHeader
  // already counts those itself via useQuestStore, which reads the same
  // underlying chores array; including it here would double-count.
  const otherAttentionCount = actionCount + backlogCount;
  // Review inbox's true combined total — chores/quests awaiting approval,
  // reward redemptions pending approval, AND kid requests (ride/tutor/
  // permission/emergency/etc. via kidRequestStore) — live-requested fold-
  // in. Kid requests previously had a fully-built review UI
  // (HelpDispatchQueue) that was completely orphaned/unreachable from any
  // screen (the Household Backlog section that used to host it was
  // removed); reconnecting it here instead of rebuilding its approve/
  // decline/assign logic a second time. getParentReviewDeck() is the exact
  // same source ReviewInboxScreen itself reads, so this count and that
  // screen's list can't structurally diverge.
  const pendingRedemptionsCount = useRewardStore(s => s.redemptions.filter(r => r.status === 'pending').length);
  const pendingKidRequestsCount = kidRequests.filter((r: any) => r.status === 'pending').length;
  const pendingReviewCount = getParentReviewDeck().length + actionCount + pendingRedemptionsCount + pendingKidRequestsCount;
  // "Add a task" tile's own status counters — pending (todo, assigned but
  // not started), in-progress (claimed/started), unassigned (open pool) —
  // computed straight off the live quests array so they can't drift from
  // whatever ReviewInbox/ChoreReview elsewhere derive from the same data.
  const tasksPendingCount    = quests.filter(q => q.status === 'todo' && !!q.assignedToId).length;
  const tasksInProgressCount = quests.filter(q => q.status === 'in_progress' || q.status === 'claimed').length;
  const tasksUnassignedCount = quests.filter(q => q.status === 'todo' && !q.assignedToId).length;
  // Completed today — approved/done chores whose approvedAt falls on
  // today's date, so this count resets each day instead of accumulating
  // every chore ever finished (matches the rest of this tile's counters,
  // which are all "right now, today" snapshots, not all-time totals).
  const tasksCompletedTodayStr = new Date().toISOString().slice(0, 10);
  const tasksCompletedCount  = quests.filter(q =>
    (q.status === 'done' || q.status === 'approved') &&
    !!q.approvedAt && q.approvedAt.slice(0, 10) === tasksCompletedTodayStr
  ).length;

  // "Next up" — today's not-yet-passed events (NextUpTimeline shows up to
  // 3). Same source/filter as TodayView's own `upcoming` list (today's
  // non-work events, sorted, hoursUntilEvent > -0.5 so something
  // just-started still counts as "up next" rather than vanishing early).
  const nextUpDateStr = localToday();
  const upcomingTodayEvents = events
    .filter(e => e.date === nextUpDateStr && hoursUntilEvent(e.date, e.time) > -0.5)
    .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));

  // Single most-urgent item for NeedsYouCard — priority: scheduling
  // conflict → overdue trip → pending chore approval → backlog task.
  //
  // Live direction: "is it good to show here? or we can reserve this for
  // very urgent tasks?" — this used to surface the FIRST pending item in
  // each category unconditionally, so a chore a kid submitted 30 seconds
  // ago occupied the same top-of-Hub slot as a genuine scheduling
  // conflict, every single time the Hub opened. A parent habituates to
  // ignoring a banner that fires on routine events, which defeats the
  // point of having an urgent-attention slot at all. Each non-conflict
  // branch now needs a real urgency signal (overdue, waiting a while, or
  // starting soon) before it's allowed to claim this slot — a fresh,
  // ordinary pending item instead counts toward the Review inbox's badge
  // and (once built) the evening wrap-up card, not this one.
  const URGENT_WAIT_MS = 2 * 60 * 60_000;     // 2h — a submission/request sitting unanswered this long is genuinely stale, not just "new"
  const URGENT_RIDE_WINDOW_MS = 2 * 60 * 60_000; // 2h — a ride without a driver starting this soon is a real problem, not routine planning
  const minsAgo = (iso?: string) => iso ? Date.now() - new Date(iso).getTime() : 0;

  const conflictEvent = conflictEvents[0] ?? neverDispatchedOverdue[0];

  const pendingApprovalChore = (() => {
    const c = pendingReviews[0] as any;
    if (!c) return null;
    const overdue = c.dueDate && c.dueDate < localDateStr(new Date());
    const stale = minsAgo(c.submittedAt) > URGENT_WAIT_MS;
    return (overdue || stale) ? c : null;
  })();

  const pendingKidRequest = (() => {
    const r = (kidRequests as any[]).find(req => req.status === 'pending');
    if (!r) return null;
    const flagged = r.urgency === 'urgent' || r.urgency === 'emergency';
    const stale = minsAgo(r.requestedAt) > URGENT_WAIT_MS;
    return (flagged || stale) ? r : null;
  })();

  // myHelperEvents: events where THIS parent is the assigned driver/helper
  // but hasn't confirmed yet (status 'pending'). These are the most
  // action-required items for the parent — they're assigned to them
  // specifically and awaiting their "Confirm I'll do it" response. Always
  // urgent regardless of timing — it's a direct ask of this specific
  // parent, not a general household item.
  const myPendingHelperEvent = myHelperEvents[0];

  const pendingRideEvent = (() => {
    const e = pendingRideRequiredEvents[0];
    if (!e) return null;
    return hoursUntilEvent(e.date, e.time) * 60 * 60_000 <= URGENT_RIDE_WINDOW_MS ? e : null;
  })();

  // Backlog was never a real "urgent" signal (it's explicitly the
  // household's routine, un-time-boxed queue) — dropped from this slot
  // entirely rather than gated, since there's no timing field that would
  // ever make it genuinely urgent. (backlogTask itself removed — its only
  // consumer was the needsYouItem 'backlog' branch, also removed.)

  // dueDate/dueTime now carried as their own fields (see NeedsYouCard's own
  // comment) instead of interpolated raw into reason — conflictEvent's own
  // date/time, myPendingHelperEvent's raw 24h time string, and the backlog
  // task's raw ISO dueDate were all previously baked straight into the
  // reason text with no formatting, violating the app's 12h/human-date rule.
  const needsYouItem: NeedsYouItem | null = conflictEvent
    ? { kind: 'conflict', title: conflictEvent.title,
        reason: conflictReasons?.get(conflictEvent.id) ?? 'Confirmed but never started — check in.',
        dueDate: conflictEvent.date, dueTime: conflictEvent.time }
    : pendingApprovalChore
    ? { kind: 'approval', title: pendingApprovalChore.title ?? 'Chore awaiting review',
        reason: (pendingApprovalChore.dueDate && pendingApprovalChore.dueDate < localDateStr(new Date()))
          ? 'Overdue — a family member completed this and is waiting for your approval.'
          : 'Waiting a while — a family member completed this and is waiting for your approval.',
        dueDate: pendingApprovalChore.dueDate, dueTime: pendingApprovalChore.dueTime }
    : pendingKidRequest
    ? { kind: 'approval', title: pendingKidRequest.detail ?? 'Request from a kid', reason: `${members.find(m => m.id === pendingKidRequest.fromMemberId)?.name?.split(' ')[0] ?? 'A family member'} is waiting for your response.` }
    : myPendingHelperEvent
    ? { kind: 'approval', title: myPendingHelperEvent.title,
        reason: `You're assigned${myPendingHelperEvent.location ? ` · ${myPendingHelperEvent.location}` : ''} — confirm you can make it.`,
        dueDate: myPendingHelperEvent.date, dueTime: myPendingHelperEvent.time }
    : pendingRideEvent
    ? { kind: 'approval', title: pendingRideEvent.title, reason: "Starting soon — who's driving?",
        dueDate: pendingRideEvent.date, dueTime: pendingRideEvent.time }
    : null;

  // ReviewConflictModal's context rows — only relevant for conflict kind.
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const needsYouRelatedContext = conflictEvent
    ? conflictEvents
        .filter(e => e.id !== conflictEvent.id)
        .slice(0, 2)
        .map(e => ({
          title: e.title,
          detail: e.time ? `${e.time}${e.location ? ` · ${e.location}` : ''}` : (e.location ?? ''),
          meta: conflictReasons?.get(e.id) ?? 'Also today',
        }))
    : [];

  const handlePullTask = (chore: ChoreTask) => {
    addParentQuest(chore.id, active.id, active.id, 'PULL');
  };

  // Was UTC-today compared against reviewedAt's UTC-timestamp prefix — a
  // chore reviewed at 8pm in a timezone west of UTC has a UTC date already
  // one day ahead, dropping it off "reviewed today" for hours. See
  // choreStore.ts's getChildDashboard for the same class of fix.
  const todayStr = todayLocal();
  const reviewedToday = chores.filter(c => {
    if (c.status !== 'approved' && c.status !== 'auto_approved') return false;
    if (!c.reviewedAt) return false;
    const d = new Date(c.reviewedAt);
    return !isNaN(d.getTime()) && localDateStr(d) === todayStr;
  }).length;
  const pendingCashOuts = getPendingCashOuts();
  const kids = members.filter(m => m.role === 'kid');
  const avgStreak = kids.length > 0
    ? Math.round(kids.reduce((s, k) => s + ((k as any).streak ?? 0), 0) / kids.length)
    : 0;
  const leaderboardKids = [...kids].sort((a, b) =>
    ((b as any).streak ?? 0) - ((a as any).streak ?? 0)
  );

  const pad = { paddingHorizontal: 16 };

  // Staggered entrance — 7 sections, driven by focusKey from HubScreen.
  // focusKey=0 means "subpage pop — show immediately"; any other value plays
  // the full animation. The hook pattern can't be used here because ParentView
  // is a child inside HubScreen's ScrollView and useFocusEffect never fires.
  const CARD_COUNT = 7;
  const opacities = useRef(Array.from({ length: CARD_COUNT }, () => new Animated.Value(0))).current;
  const translateYs = useRef(Array.from({ length: CARD_COUNT }, () => new Animated.Value(18))).current;

  const cardAnims = opacities.map((opacity, i) => ({ opacity, translateY: translateYs[i] }));

  useEffect(() => {
    if (focusKey === 0) {
      opacities.forEach(v => v.setValue(1));
      translateYs.forEach(v => v.setValue(0));
      return;
    }
    opacities.forEach(v => v.setValue(0));
    translateYs.forEach(v => v.setValue(18));
    const anims = opacities.map((op, i) =>
      Animated.parallel([
        Animated.timing(op, { toValue: 1, duration: 280, delay: 60 + i * 55,
          easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(translateYs[i], { toValue: 0, duration: 300, delay: 60 + i * 55,
          easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ])
    );
    Animated.parallel(anims).start();
  }, [focusKey]);

  // Parent Hub is now a pixel-faithful rebuild of the Figma Make
  // "Scrollable Content Design" prototype's HomePage (design/Scrollable
  // Content Design/src/App.tsx — see that folder's own CSS for every exact
  // value used): Greeting → Family Pulse → Needs You → Next Up timeline →
  // Quick Actions → Tonight → (urgent AlertBanner, if anything's actually
  // time-sensitive).
  //
  // Per explicit direction, every pre-reskin Hub section NOT in the Figma
  // source — ParentQuickActions, the old Timeline/Approve-strip TodayView,
  // ActionNeededSection, HouseholdBacklogSection, ChoreReviewSection,
  // GpCanHelpSection, Pick-up Radar/EnRouteBanner, MedicationsCard,
  // TemporaryApproverCard, FamilyGamesSection, HomeownerNotesSection,
  // SchoolTodaySection — has been REMOVED (not hidden) from this screen.
  // That real, working functionality (chore approvals, household backlog,
  // GP help requests, ride dispatch, medications, temp-approver grants,
  // games, homeowner notes, school overview) is no longer reachable from
  // the parent Hub as of this pass. PushbackSheet/DelegateSheet below are
  // now unreachable too (their only triggers lived in the removed
  // HouseholdBacklogSection) — left rendered/wired rather than deleted
  // since removing them risked missing some other trigger path.
  return (
    <>
      {showTrialNag && <TrialNagBanner colors={colors} isDark={isDark} />}

      <Animated.View style={{ opacity: cardAnims[0].opacity, transform: [{ translateY: cardAnims[0].translateY }] }}>
        <FamilyPulseCard colors={colors} isDark={isDark} members={members} hasUrgentItem={!!needsYouItem} familyName={familyName || undefined} />
      </Animated.View>

      {/* "Viewing as" card — matches the Figma prototype's own
          .profile-switcher position exactly (between Family Pulse and
          Needs You). Opens the real PersonaSwitcherDropdown, same
          mechanism AppHeader's compact mode already uses. */}
      <Animated.View style={{ opacity: cardAnims[1].opacity, transform: [{ translateY: cardAnims[1].translateY }] }}>
        <ProfileSwitcherCard colors={colors} isDark={isDark} active={active} />
      </Animated.View>

      {needsYouItem && (
        <Animated.View style={{ opacity: cardAnims[2].opacity, transform: [{ translateY: cardAnims[2].translateY }] }}>
        <NeedsYouCard item={needsYouItem} onReview={() => {
          if (needsYouItem.kind === 'conflict') setReviewModalOpen(true);
          else if (myPendingHelperEvent && needsYouItem.title === myPendingHelperEvent.title) {
            // Same stale-route fix as NextUpCard's own goToSchedule — /calendar
            // is a disused standalone route outside the real tab bar; the
            // actual Schedule view lives in the Tasks tab's embedded segment.
            useUIStore.getState().setRequestedTasksSegment('schedule');
            useUIStore.getState().setRequestedEventDetailId(myPendingHelperEvent.id);
            router.push('/(tabs)/tasks' as any);
          }
          // 'backlog' branch removed — backlogTask was dropped from
          // needsYouItem's own possible kinds (never a real urgency
          // signal, see the computation above's own comment), so this
          // callback no longer needs to route for it.
          else onReviewOpen();
        }} />
        </Animated.View>
      )}
      {backlogTaskDetailId && (() => {
        const fullQuest = quests.find(q => q.id === backlogTaskDetailId);
        if (!fullQuest) { setBacklogTaskDetailId(null); return null; }
        return (
          <QuestDetailModal
            quest={fullQuest}
            onClose={() => setBacklogTaskDetailId(null)}
            canEdit
            isParent
          />
        );
      })()}

      {/* "NEXT UP" — up to 3 upcoming events today, matching the Figma
          prototype's own multi-row timeline exactly (not a single event). */}
      <Animated.View style={{ opacity: cardAnims[3].opacity, transform: [{ translateY: cardAnims[3].translateY }] }}>
        <NextUpTimeline
          colors={colors} isDark={isDark}
          events={upcomingTodayEvents}
          conflictReasons={conflictReasons}
        />
      </Animated.View>

      <Animated.View style={{ opacity: cardAnims[4].opacity, transform: [{ translateY: cardAnims[4].translateY }] }}>
        <TodayActionGrid
          colors={colors} isDark={isDark}
          groceryCount={groceryItems.length}
          reviewCount={pendingReviewCount}
          tasksPendingCount={tasksPendingCount}
          tasksInProgressCount={tasksInProgressCount}
          tasksUnassignedCount={tasksUnassignedCount}
          tasksCompletedCount={tasksCompletedCount}
          todayEventsCount={todayEvents.length}
          pendingRidesCount={pendingRideRequiredEvents.length}
          onCapture={onDescribeTask}
          onCreateEvent={onDescribeEvent}
          onReview={onReviewOpen}
        />
      </Animated.View>

      {/* Rides status — live-requested Hub-home entry point into
          RidesControlRoomScreen (already built, was unreachable from
          anywhere). Headlines whichever ride is furthest along (an active
          dispatched trip beats a merely-requested one with no driver yet),
          using the trip's REAL phase (tripViews now carries it through —
          see HubScreen.tsx) so this card's progress bar matches
          RidesControlRoomScreen's own PHASE_STAGES exactly instead of
          guessing a stage from elapsed time. */}
      <Animated.View style={{ opacity: cardAnims[5].opacity, transform: [{ translateY: cardAnims[5].translateY }] }}>
        {(() => {
          // Live-reported bug (still present after fixing RidesStatusCard's
          // OWN idle-return): this wrapping IIFE had its own separate
          // `if (!headlineTrip && !headlineRideEvent) return null` — even
          // once the component itself was made to always render when
          // called, this outer check meant it was never CALLED at all
          // whenever there was no active trip and no pending ride. "I
          // asked you to add the full width card ... I still didn't see it
          // home" — this was why. Removed; RidesStatusCard now always
          // mounts and handles its own idle state.
          const allActiveTrips = [...(activeTrip ? [activeTrip] : []), ...(otherActiveTrips ?? [])];
          const headlineTrip = allActiveTrips[0];
          const headlineRideEvent = !headlineTrip ? pendingRideEvent : undefined;
          const label = headlineTrip
            ? `${headlineTrip.driverName.split(' ')[0]} driving ${headlineTrip.kidName.split(' ')[0]}`
            : headlineRideEvent?.title;
          const otherCount = (allActiveTrips.length + pendingRideRequiredEvents.length)
            - (headlineTrip ? 1 : 0) - (headlineRideEvent ? 1 : 0);
          return (
            <RidesStatusCard
              colors={colors} isDark={isDark}
              pendingCount={Math.max(0, otherCount)}
              withoutDriverCount={pendingRideRequiredEvents.length}
              ongoingCount={allActiveTrips.length}
              activeTripLabel={label}
              activePhase={headlineTrip?.phase}
              onPress={onRidesOpen}
            />
          );
        })()}
      </Animated.View>

      {/* "TONIGHT" — dinner preview, matching the Figma prototype's own
          .evening card. Renders nothing when there's no dinner planned. */}
      <Animated.View style={{ opacity: cardAnims[6].opacity, transform: [{ translateY: cardAnims[6].translateY }] }}>
        <TonightMealCard colors={colors} isDark={isDark} familyId={familyId} members={members} />
      </Animated.View>

      {/* AlertBanner stays — it carries real action buttons
          (Dismiss/Assign/Dispatch) for scheduling conflicts and
          confirmed-but-never-dispatched trips, genuinely time-sensitive,
          not routine display like NextUpTimeline above it. */}
      {showBanner && (
        <AlertBanner
          conflictEvents={conflictEvents}
          neverDispatchedEvents={neverDispatchedOverdue}
          conflictReasons={conflictReasons}
          members={members} colors={colors} isDark={isDark} updateEvent={updateEvent}
          activeName={active.name} activeMemberId={active.id}
          onDispatch={onDispatchDirect}
        />
      )}

      <ReviewConflictModal
        visible={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        conflictEvent={conflictEvent ?? null}
        relatedContext={needsYouRelatedContext}
        onApprove={() => {
          if (conflictEvent) updateEvent(conflictEvent.id, { conflictAcknowledged: true });
        }}
      />

      <PushbackSheet
        target={pushbackSheet}
        onClose={() => setPushbackSheet(null)}
        respondToParentQuest={respondToParentQuest}
      />

      {/* Unified "Add Task" quick-action entry point — same
          SmartTaskComposer the Tasks tab's own FAB opens. Its "adjust in
          full form" handoff falls through to the AddQuestModal/
          AddEventModal pair right below via the same addPrefill state the
          voice-intake handoff already uses, so there's one shared manual
          fallback, not a second parallel pair of modals. */}
      <SmartTaskComposer
        visible={showTaskComposer}
        members={members}
        activeMemberId={active.id}
        familyId={(active as any).familyId ?? ''}
        onClose={() => setShowTaskComposer(false)}
        onCreated={() => setShowTaskComposer(false)}
        onOpenFullForm={(kind, prefill) => {
          setShowTaskComposer(false);
          setAddPrefill(prefill);
          if (kind === 'quest') setShowAddTask(true);
          else setShowAddEvent(true);
        }}
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
        initialStep={addPrefill ? 'review' : undefined}
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
        // Smart Tasker already detected title/category/who/when by the
        // time it hands off here — restarting at step 1 blank (only the
        // category pre-selected) threw that context away and looked like
        // the parsed data had been dropped entirely (live-reported).
        // TasksScreen.tsx's own AddEventModal call already does this; Hub's
        // separate copy of the same handoff never got the same fix.
        initialStep={addPrefill ? 'review' : undefined}
      />

      <DelegateSheet
        target={delegateSheet} questPool={questPool} members={members} active={active}
        onClose={() => setDelegateSheet(null)}
        updateQuest={updateQuest}
        addParentQuest={addParentQuest}
      />

      {/* ── Task creation (chooser → responsibility or ride) ─────────── */}
      <TaskFlowChooser
        visible={showFlowChooser}
        onClose={() => setShowFlowChooser(false)}
        onChooseResponsibility={() => setShowResponsibilitySheet(true)}
        onChooseRide={() => setShowRideSheet(true)}
      />

      <CreateResponsibilitySheet
        visible={showResponsibilitySheet}
        onClose={() => { setShowResponsibilitySheet(false); setChoreConvertTitle(undefined); setChoreConvertMemberId(undefined); }}
        prefillTitle={choreConvertTitle}
        prefillMemberId={choreConvertMemberId}
        onCreated={() => setShowResponsibilitySheet(false)}
        onConvertToRide={(seed) => {
          setShowResponsibilitySheet(false);
          setRideSeedTitle(seed.title);
          setRideSeedMemberId(seed.memberId);
          setTimeout(() => setShowRideSheet(true), 300);
        }}
      />

      <DispatchRideSheet
        visible={showRideSheet}
        onClose={() => { setShowRideSheet(false); setRideSeedMemberId(undefined); setRideSeedTitle(undefined); }}
        seedMemberId={rideSeedMemberId}
        onDispatched={() => setShowRideSheet(false)}
        onConvertToChore={(seed) => {
          setShowRideSheet(false);
          setChoreConvertTitle(seed.title);
          setChoreConvertMemberId(seed.memberId);
          setTimeout(() => setShowResponsibilitySheet(true), 300);
        }}
      />

      <Modal visible={showKidProposals} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowKidProposals(false)}>
        <KidProposalReviewScreen onClose={() => setShowKidProposals(false)} />
      </Modal>


      {/* ── Send appreciation ─────────────────────────────────────── */}
      <Modal visible={showSendAppreciation} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowSendAppreciation(false)}>
        <SendAppreciationScreen onClose={() => setShowSendAppreciation(false)} />
      </Modal>
    </>
  );
}
