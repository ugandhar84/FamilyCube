import { useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput, Modal, ScrollView, Alert, Image, TouchableOpacity } from 'react-native';
import {
  Sparkles, PlusCircle, Calendar, ShoppingCart, Navigation,
  ChevronUp, ChevronDown, Camera, Coins, Car, Hand,
  Unlock, HelpCircle, Pill, Check, X, MessageSquare,
  ClipboardList, UserPlus, ThumbsUp, Clock, AlertCircle, ArrowRightLeft, MessageCircle,
} from 'lucide-react-native';
import { router } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import FamilyAvatar from '@/components/FamilyAvatar';
import { useQuestStore } from '@/store/choreAdapter';
import { useEventStore } from '@/store/eventStore';
import { useGroceryStore } from '@/store/groceryStore';
import { useKidRequestStore } from '@/store/kidRequestStore';
import { SUPPLIES_PREFIX, GROCERY_PREFIX, decodeGroceryRequest, decodeRideLate } from '@/features/hub/KidModals';
import { AddQuestModal } from '@/features/quests/QuestsScreen';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';
import {
  SectionCard, CollapsibleCard, AlertBanner, TimelineCard, InlineReassignPanel,
} from './hubComponents';
import { localToday, fmtHumanDate, fmtTime, hoursUntilEvent, isWorkEvent, minutesBetween } from './hubUtils';
import { TodayView } from './TodayView';
import { ParentReviewDeck } from '@/features/chores/ParentReviewDeck';
import { useChoreStore } from '@/store/choreStore';
import type { ChoreTask, ParentQuestAssignment } from '@/store/choreStore';
import AppBottomSheet from '@/components/AppBottomSheet';
import { useChatStore } from '@/store/chatStore';

// ─── Inline reply card — question/permission/medical (collapsible) ───────────
function InlineReplyCard({ req, kidName, isPermission, isQuestion, isMedical, accent, colors, isDark, onApprove, onDecline }: {
  req: any; kidName: string;
  isPermission: boolean; isQuestion: boolean; isMedical: boolean;
  accent: string; colors: any; isDark: boolean;
  onApprove: (reply: string) => void;
  onDecline: (reply: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [reply, setReply] = useState('');
  const canSubmit = !isQuestion || reply.trim().length > 0;

  const TypeIcon = isMedical ? Pill : isPermission ? Unlock : HelpCircle;
  const typeLabel = isMedical ? 'Medical Alert' : isPermission ? 'Permission' : 'Question';

  return (
    <View style={{ borderRadius: 16, borderWidth: 1.5, borderColor: accent + '40', backgroundColor: isDark ? colors.card : accent + '06', overflow: 'hidden' }}>
      {/* Always-visible header row — tap to expand */}
      <Pressable onPress={() => setExpanded(e => !e)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: accent + '20', alignItems: 'center', justifyContent: 'center' }}>
          <TypeIcon size={16} color={accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: accent }}>{typeLabel} — {kidName}</Text>
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 1 }} numberOfLines={1}>
            {req.detail.length > 55 ? req.detail.slice(0, 55) + '…' : req.detail}
          </Text>
        </View>
        <View style={{ backgroundColor: accent + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginRight: 4 }}>
          <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: accent }}>Pending</Text>
        </View>
        {expanded ? <ChevronUp size={16} color={colors.textTertiary} /> : <ChevronDown size={16} color={colors.textTertiary} />}
      </Pressable>

      {expanded && (
        <>
          {/* Divider */}
          <View style={{ height: 1, backgroundColor: accent + '20', marginHorizontal: 14 }} />

          {/* Full message */}
          <View style={{ marginHorizontal: 14, marginTop: 10, borderRadius: 12, padding: 12,
            backgroundColor: isDark ? '#1e293b' : '#fff',
            borderLeftWidth: 3, borderLeftColor: accent }}>
            <Text style={{ fontSize: TYPO.caption, color: colors.textPrimary, lineHeight: 19 }}>
              "{req.detail}"
            </Text>
          </View>

          {/* Reply input */}
          <View style={{ marginHorizontal: 14, marginTop: 10, borderRadius: 12, borderWidth: 1.5,
            borderColor: reply.trim() ? accent + '60' : colors.border,
            backgroundColor: isDark ? colors.surface : '#fff',
            flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10 }}>
            <MessageSquare size={14} color={reply.trim() ? accent : colors.textTertiary} style={{ marginTop: 2 }} />
            <TextInput
              style={{ flex: 1, fontSize: TYPO.caption, color: colors.textPrimary, minHeight: 36 }}
              placeholder={isQuestion ? 'Type your reply… (required)' : 'Add a reply (optional)'}
              placeholderTextColor={colors.textTertiary}
              value={reply}
              onChangeText={setReply}
              multiline
              textAlignVertical="top"
            />
          </View>

          {/* Action buttons */}
          <View style={{ flexDirection: 'row', gap: 8, padding: 14 }}>
            <Pressable
              onPress={() => onApprove(reply.trim())}
              disabled={!canSubmit}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                backgroundColor: canSubmit ? '#10B981' : (isDark ? '#374151' : '#D1D5DB'),
                paddingVertical: 11, borderRadius: 12 }}>
              <Check size={14} color="#fff" />
              <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: '#fff' }}>
                {isPermission ? 'Allow' : isMedical ? 'Acknowledged' : 'Reply'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onDecline(reply.trim())}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                backgroundColor: isDark ? '#EF444420' : '#FEF2F2',
                borderWidth: 1.5, borderColor: '#EF444430',
                paddingVertical: 11, borderRadius: 12 }}>
              <X size={14} color="#EF4444" />
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#EF4444' }}>
                {isPermission ? 'No' : 'Dismiss'}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

export function ParentView({ active, members, colors, isDark, onScanFlyer, onEnRoute }: {
  active: FamilyMember; members: FamilyMember[];
  colors: any; isDark: boolean;
  onScanFlyer: () => void;
  onEnRoute: () => void;
}) {
  const { quests, approveQuest, declineQuest, updateQuest } = useQuestStore();
  const { events, updateEvent, addEvent }  = useEventStore();
  const { items: groceryItems, load: loadGrocery, addItem: addGroceryItem } = useGroceryStore();
  const { requests: kidRequests, loaded: kidRequestsLoaded, loadFromStorage: loadKidRequests,
          approveRequest, declineRequest, approveItems, rejectItems, toggleGPWelcome } = useKidRequestStore();
  const [showPast, setShowPast] = useState(false);
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});

  // Household Backlog / Parent Quest state
  const {
    parentAssignments, createAndAddParentQuest, addParentQuest,
    respondToParentQuest, completeParentQuest, appreciationPing, getParentQuestPool,
    getPendingCashOuts, chores, addChore, getParentReviewDeck,
    approveGrandparentQuestAsParent, declineGrandparentQuestAsParent,
    loadFromStorage: loadChores, syncFromDB: syncChores,
  } = useChoreStore();
  const pendingReviews = getParentReviewDeck();
  // Every Hub section defaults collapsed — Action Needed and Household Backlog
  // are the only two that auto-open, and only when there's something pending
  // on this parent specifically (see the effect below).
  const [choreReviewExpanded, setChoreReviewExpanded] = useState(false);
  const [backlogExpanded, setBacklogExpanded] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [pushbackSheet, setPushbackSheet] = useState<{ assignmentId: string; choreTitle: string } | null>(null);
  const [pushbackDetail, setPushbackDetail] = useState('');
  const [delegateSheet, setDelegateSheet] = useState<{ choreId: string; choreTitle: string } | null>(null);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const toggleCard = (id: string) => setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));

  useEffect(() => { loadGrocery((active as any).familyId ?? 'family-1'); }, [(active as any).familyId]);
  useEffect(() => { if (!kidRequestsLoaded) loadKidRequests(); }, [kidRequestsLoaded]);
  // This must run even when the review section starts collapsed. Otherwise a
  // parent who opens the Hub after a grandparent creates a quest never joins
  // the chore realtime channel and cannot see the safety-review request.
  useEffect(() => {
    loadChores().then(() => { void syncChores(); });
  }, [loadChores, syncChores]);

  const gpPendingCount = chores.filter(c =>
    c.categoryType === 'grandparent_quest' && c.status === 'pending_parent_approval'
  ).length;

  const allNames  = members.map(m => m.name);
  const today     = localToday();

  // All events today (sorted) — Work events hidden from timeline but used for conflict detection
  const allTodayEvents = events
    .filter(e => e.date === today)
    .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
  const workEvents    = allTodayEvents.filter(e => isWorkEvent(e));
  const todayEvents   = allTodayEvents.filter(e => !isWorkEvent(e));

  const pendingRequests  = events.filter(e =>
    e.approvalPending && !isWorkEvent(e) && hoursUntilEvent(e.date, e.time) >= 0
  );
  const awaitingApproval = quests.filter(q => q.status === 'pending_approval');

  const rejectedHelperEvents = todayEvents.filter(e => e.helperStatus === 'rejected');

  // ── Conflict detection ────────────────────────────────────────────────────
  const conflictReasons = new Map<string, string>(); // eventId → reason label

  // Only check upcoming events — past conflicts are irrelevant and unactionable
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

  const conflictEventIds = new Set(conflictReasons.keys());
  const conflictEvents   = todayEvents.filter(e => e.conflict || conflictEventIds.has(e.id));

  // Escalation: helper pending + no response + < 1 hr away
  const pendingNoResponse = todayEvents.filter(e =>
    !!e.helper && e.helperStatus === 'pending' &&
    hoursUntilEvent(e.date, e.time) < 1 && hoursUntilEvent(e.date, e.time) >= 0
  );

  // Escalation: transport event unassigned + < 2 hr away
  // Exclude events already shown in urgentRejected (declined driver) to avoid duplicate banners
  const unassignedUrgent = todayEvents.filter(e => {
    if (!e.location || e.approvalPending || e.helper || e.declinedBy) return false;
    if (e.helperStatus === 'rejected') return false;
    const h = hoursUntilEvent(e.date, e.time);
    return h >= 0 && h < 2;
  });

  const urgentRejected = rejectedHelperEvents.filter(ev => {
    const h = hoursUntilEvent(ev.date, ev.time);
    return h >= 0 && h < 4;
  });
  const showBanner     = conflictEvents.length > 0 || urgentRejected.length > 0 ||
                         pendingNoResponse.length > 0 || unassignedUrgent.length > 0;
  const pendingKidRequests = kidRequests.filter(r => {
    if (r.status !== 'pending') return false;
    // Auto-expire checkin requests older than 2 hours
    if (r.type === 'checkin') {
      const ageHours = (Date.now() - new Date(r.requestedAt).getTime()) / 3_600_000;
      if (ageHours > 2) return false;
    }
    // Hide grocery/supplies delegation cards that have no items — nothing actionable to show
    if (r.type === 'delegation' && (r.items?.length ?? 0) === 0) return false;
    return true;
  });
  // Approved ride/help requests still pending a helper — parent can flag these for GP
  const approvedRideRequests = kidRequests.filter(r =>
    r.status === 'approved' &&
    ['ride', 'tutor', 'cheer'].includes(r.type) &&
    !r.assignedHelper
  );
  const actionCount    = pendingRequests.length + awaitingApproval.length + pendingKidRequests.length;

  const familyId = (active as any).familyId ?? 'family-1';

  const approveItemsAndSync = async (reqId: string, itemIds: string[], isSuppliesReq: boolean) => {
    console.log(`[ParentView] approveItemsAndSync called — reqId=${reqId} itemIds=${JSON.stringify(itemIds)} supplies=${isSuppliesReq}`);
    const req = kidRequests.find(r => r.id === reqId);
    if (!req) {
      console.warn(`[ParentView] approveItemsAndSync ABORTED — no kid request found with id=${reqId}`);
      return;
    }
    approveItems(reqId, itemIds, active.id);
    if (req.items) {
      const approved = req.items.filter(it => itemIds.includes(it.id));
      console.log(`[ParentView] approveItemsAndSync → adding ${approved.length} item(s) to groceryStore:`, approved.map(i => i.name));
      for (const item of approved) {
        const created = await addGroceryItem({
          familyId,
          name: item.name,
          quantity: item.qty || undefined,
          category: isSuppliesReq ? 'Supplies' : (item.category ?? 'Other'),
          addedBy: req.fromMemberId,
        });
        console.log(`[ParentView] approveItemsAndSync → "${item.name}" ${created ? 'added ✓ id=' + created.id : 'FAILED to add ✗'}`);
      }
    } else {
      console.log('[ParentView] approveItemsAndSync — request has no items[] to sync');
    }
  };
  const pad            = { paddingHorizontal: 16 };

  // Parent Quest pool (PULL mode backlog) + direct assignments pending response
  // Merges chore-based parent_only_quest pool AND questStore isAdultTask quests
  const chorePool        = getParentQuestPool();
  const adultMemberIds   = new Set(members.filter(m => m.role === 'parent' || m.role === 'senior').map(m => m.id));
  const doneStatuses     = new Set(['done', 'approved', 'archived', 'cancelled', 'completed']);
  // DEBUG: Log all shopping quests to inspect their fields
  const shoppingQuests = quests.filter(q => q.categoryType === 'shopping' || (q as any).shoppingItems);
  if (shoppingQuests.length > 0) {
    console.log('🛒 DEBUG: Shopping quests found:', shoppingQuests.length);
    shoppingQuests.forEach(q => {
      console.log('  Quest:', {
        id: q.id.slice(0, 8),
        title: q.title,
        categoryType: q.categoryType,
        questType: q.questType,
        isAdultTask: q.isAdultTask,  // ← Should now be TRUE after choreAdapter.ts fix
        assignedToId: q.assignedToId?.slice(0, 8),
        status: q.status,
        hasShoppingItems: !!(q as any).shoppingItems,
      });
    });
  }
  
  console.log('🔍 DEBUG: Total quests:', quests.length, '| Adult members:', adultMemberIds.size);
  console.log('🔍 DEBUG: Adult member IDs:', Array.from(adultMemberIds).map(id => id.slice(0, 8)));

  // Adult quests: parent_only_quest type OR directly assigned to a parent/senior
  // EXCLUDE ride/pickup/dropoff tasks (category === 'Ride') — GP ride tasks go to calendar, not Household Backlog
  const adultQuests      = quests.filter(q => {
    if (doneStatuses.has(q.status)) return false;
    
    // Filter out ride tasks (identified by category field)
    if (q.category === 'Ride') {
      console.log('🚗 DEBUG: Excluding ride task from Household Backlog:', q.title.slice(0, 40), '| category:', q.category);
      return false;
    }
    
    if (q.isAdultTask) return true;                                          // category_type === 'parent_only_quest' or shopping
    if (q.assignedToId != null && adultMemberIds.has(q.assignedToId)) return true;  // directly assigned to adult (parent/GP)
    return false;
  });
  
  console.log('✅ DEBUG: adultQuests matched:', adultQuests.length);
  if (adultQuests.length > 0) {
    adultQuests.forEach(q => {
      console.log('  Adult quest:', {
        id: q.id.slice(0, 8),
        title: q.title.slice(0, 30),
        isAdultTask: q.isAdultTask,
        assignedTo: q.assignedToId?.slice(0, 8) || 'unassigned',
        status: q.status,
      });
    });
  }

  // Split adult quests: mine (assigned to me), others' (assigned to someone else), unassigned (pool)
  const myAdultQuests       = adultQuests.filter(q => q.assignedToId === active.id);
  const othersAdultQuests   = adultQuests.filter(q => q.assignedToId && q.assignedToId !== active.id);
  const unassignedAdultQ    = adultQuests.filter(q => !q.assignedToId);
  
  console.log('📊 DEBUG: Split adult quests - Mine:', myAdultQuests.length, '| Others:', othersAdultQuests.length, '| Unassigned:', unassignedAdultQ.length);

  const choreIds         = new Set(chorePool.map(c => c.id));
  // Pool = unassigned adult quests + chore-based pool (no duplicates)
  const questPool        = [
    ...chorePool,
    ...unassignedAdultQ.filter(q => !choreIds.has(q.id)).map(q => ({
      id: q.id, title: q.title, description: q.description, dueDate: q.dueDate,
      categoryType: 'parent_only_quest' as const, category: q.category,
      basePoints: q.coins, coinsReward: q.coins, xpReward: 0, status: 'todo' as const,
      assignedToId: undefined, isPrivateParent: true, requiresPhotoProof: false,
      redoCount: 0, recurrenceRule: { frequency: 'once' as const },
      createdAt: (q as any).createdAt ?? new Date().toISOString(), _isQuestRow: true,
      shoppingItems: (q as any).shoppingItems, shoppingStore: (q as any).shoppingStore, shoppingBudget: (q as any).shoppingBudget,
    })),
  ];
  
  console.log('🎯 DEBUG: questPool size:', questPool.length, '| chorePool:', chorePool.length, '| unassignedAdultQ added:', unassignedAdultQ.filter(q => !choreIds.has(q.id)).length);
  
  // IDs already rendered in System B (direct assignedToId) — exclude from System A (parentAssignments)
  // ONLY include myAdultQuests + othersAdultQuests (direct assignments), NOT unassignedAdultQ (they go to pool)
  const systemBIds       = new Set([...myAdultQuests, ...othersAdultQuests].map(q => q.id));

  // A SNOOZED assignment is rendered nowhere, so once its 48h window lapses it
  // has to fall back into the pending list or the task is lost for good.
  const nowIso           = new Date().toISOString();
  const myDirectPending  = parentAssignments.filter(a =>
    a.assignedTo === active.id && !a.isLocked && !systemBIds.has(a.choreId) &&
    (a.status === 'PENDING' ||
     (a.status === 'SNOOZED' && (!a.snoozeUntil || a.snoozeUntil <= nowIso)))
  );
  const myLockedItems    = parentAssignments.filter(a =>
    a.assignedTo === active.id && a.isLocked && !systemBIds.has(a.choreId)
  );
  const myAccepted       = parentAssignments.filter(a =>
    a.assignedTo === active.id && (a.status === 'ACCEPTED' || a.status === 'IN_PROGRESS') && !systemBIds.has(a.choreId)
  );
  // Calendar events where this parent is the assigned helper/driver — show in HB.
  // Backlog is for things still needing action: once confirmed, it's a settled
  // commitment (visible in Schedule instead), not something to pull off a backlog.
  const myHelperEvents = events.filter(e => {
    if (!e.helper || e.helper !== active.name) return false;
    if (e.helperStatus === 'rejected' || e.helperStatus === 'confirmed') return false;
    // Only upcoming (today and future)
    const today = new Date().toISOString().slice(0, 10);
    return (e.date ?? '') >= today;
  });

  const parentMembers    = members.filter(m => m.role === 'parent');

  // Household Backlog auto-opens only when there's something pending on THIS
  // parent — their own claimed items, the open pool, or a helper request —
  // not just because someone else's spouse has a task sitting there.
  const myBacklogPendingCount = questPool.length + myAdultQuests.length + myHelperEvents.length
    + myDirectPending.length + myAccepted.length + myLockedItems.length;
  useEffect(() => {
    if (myBacklogPendingCount > 0) setBacklogExpanded(true);
  }, [myBacklogPendingCount > 0]);

  // Quick Stats derivations
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);

  // Per-event coins input for ride dispatch (keyed by event id)
  const [rideCoinsByEvent, setRideCoinsByEvent] = useState<Record<string, string>>({});
  const setRideCoins = (evId: string, val: string) =>
    setRideCoinsByEvent(prev => ({ ...prev, [evId]: val }));

  const to24HourTime = (raw: string): string | undefined => {
    const normalized = raw.trim();
    if (/^\d{2}:\d{2}$/.test(normalized)) return normalized;
    const m = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return undefined;
    let hour = parseInt(m[1], 10);
    const minute = parseInt(m[2], 10);
    const meridiem = m[3].toUpperCase();
    if (hour === 12) hour = 0;
    if (meridiem === 'PM') hour += 12;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  };

  const parseRideMeta = (encoded: string | undefined, fallbackDate?: string) => {
    const rideCode = encoded?.startsWith('RIDE:') ? encoded : null;
    const isBothWays = rideCode === 'RIDE:both' || rideCode?.startsWith('RIDE:both:');
    const isDropoff  = rideCode === 'RIDE:dropoff';
    const isPickup   = rideCode === 'RIDE:pickup' || rideCode?.startsWith('RIDE:pickup:');
    let pickupDate = fallbackDate;
    let pickupTime: string | undefined;

    if (rideCode?.startsWith('RIDE:both:') || rideCode?.startsWith('RIDE:pickup:')) {
      const payload = rideCode.slice(rideCode.indexOf(':', 5) + 1).trim();
      // New format: YYYY-MM-DDTHH:mm
      const localStamp = payload.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/);
      if (localStamp) {
        pickupDate = localStamp[1];
        pickupTime = localStamp[2];
      } else {
        // Legacy format: h:mm AM/PM
        pickupTime = to24HourTime(payload);
      }
    }

    return {
      isBothWays,
      isDropoff,
      isPickup,
      pickupDate,
      pickupTime,
      pickupLabel: pickupTime ? fmtTime(pickupTime) : undefined,
    };
  };

  // Chore Management modal state
  const [showChoreModal, setShowChoreModal] = useState(false);
  const [choreType, setChoreType] = useState<'citizenship' | 'routine' | 'bounty'>('routine');
  const [choreTitle, setChoreTitle] = useState('');
  const [choreDesc, setChoreDesc] = useState('');
  const [chorePoints, setChorePoints] = useState('50');
  const [chorePhoto, setChorePhoto] = useState(false);
  const [choreAssignTo, setChoreAssignTo] = useState('');
  const [choreFreq, setChoreFreq] = useState<'daily' | 'weekly' | 'once' | 'first_come'>('daily');

  const handleCreateChore = () => {
    if (!choreTitle.trim()) return;
    const isNew = choreType === 'bounty';
    addChore({
      title:            choreTitle.trim(),
      description:      choreDesc.trim() || undefined,
      categoryType:     choreType,
      category:         choreType,
      basePoints:       choreType === 'citizenship' ? 0 : parseInt(chorePoints, 10) || 50,
      coinsReward:      0,
      xpReward:         0,
      status:           isNew ? 'todo' : 'todo',
      assignedToId:     choreAssignTo || undefined,
      createdById:      active.id,
      requiresPhotoProof: chorePhoto,
      recurrenceRule:   { frequency: isNew ? 'first_come' : choreFreq, durationDays: isNew ? 7 : undefined },
    });
    setChoreTitle('');
    setChoreDesc('');
    setChorePoints('50');
    setChorePhoto(false);
    setChoreAssignTo('');
    setShowChoreModal(false);
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

  const handlePullTask = (chore: ChoreTask) => {
    addParentQuest(chore.id, active.id, active.id, 'PULL');
  };

  const handlePushback = (action: 'SNOOZE' | 'BLOCKER' | 'TRADE' | 'DISCUSS') => {
    if (!pushbackSheet) return;
    respondToParentQuest(pushbackSheet.assignmentId, { action, details: pushbackDetail.trim() || undefined });
    setPushbackSheet(null);
    setPushbackDetail('');
  };

  return (
    <>
      {/* 0. TodayView — animated header + timeline */}
      <TodayView
        colors={colors}
        isDark={isDark}
        activeMember={active}
        members={members}
        onAddQuest={() => router.push('/(tabs)/quests')}
        onAddEvent={() => router.push('/(tabs)/calendar')}
        onAddGrocery={() => router.push('/(tabs)/grocery' as any)}
      />

      {/* 2. Alert Banner */}
      {showBanner && (
        <AlertBanner
          conflictEvents={conflictEvents} rejectedEvents={urgentRejected}
          pendingNoResponseEvents={pendingNoResponse} unassignedUrgentEvents={unassignedUrgent}
          conflictReasons={conflictReasons}
          members={members} colors={colors} isDark={isDark} updateEvent={updateEvent}
        />
      )}

      {/* 3. Quick Action Tiles */}
      <View style={{
        flexDirection: 'row', gap: 8,
        marginHorizontal: 16, marginBottom: 12,
        backgroundColor: isDark ? colors.card : '#FFFFFF',
        borderRadius: 24, padding: 10,
        borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0',
      }}>
        <Pressable onPress={onScanFlyer} style={{ flex: 1, backgroundColor: BRAND.purple, borderRadius: 18, paddingVertical: 12, alignItems: 'center', gap: 5 }}>
          <Sparkles size={18} color="#fff" />
          <Text style={{ fontSize: 10, fontWeight: '900', color: '#fff' }}>Scan Flyer</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/(tabs)/quests')} style={{ flex: 1, backgroundColor: isDark ? colors.surface : '#F1F5F9', borderRadius: 18, paddingVertical: 12, alignItems: 'center', gap: 5, borderWidth: 1, borderColor: isDark ? colors.border : '#E2E8F0' }}>
          <PlusCircle size={18} color="#10B981" />
          <Text style={{ fontSize: 10, fontWeight: '700', color: isDark ? colors.textPrimary : '#334155' }}>Quest</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/(tabs)/calendar')} style={{ flex: 1, backgroundColor: isDark ? colors.surface : '#F1F5F9', borderRadius: 18, paddingVertical: 12, alignItems: 'center', gap: 5, borderWidth: 1, borderColor: isDark ? colors.border : '#E2E8F0' }}>
          <Calendar size={18} color={BRAND.purple} />
          <Text style={{ fontSize: 10, fontWeight: '700', color: isDark ? colors.textPrimary : '#334155' }}>Event</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/(tabs)/grocery' as any)} style={{ flex: 1, backgroundColor: isDark ? colors.surface : '#F1F5F9', borderRadius: 18, paddingVertical: 12, alignItems: 'center', gap: 5, borderWidth: 1, borderColor: isDark ? colors.border : '#E2E8F0' }}>
          <ShoppingCart size={18} color="#0ea5e9" />
          <Text style={{ fontSize: 10, fontWeight: '700', color: isDark ? colors.textPrimary : '#334155' }} numberOfLines={1}>
            {groceryItems.length > 0 ? `${groceryItems.length} items` : 'Grocery'}
          </Text>
        </Pressable>
      </View>

      {/* 3b. Household Snapshot + Family Leaderboard */}
      <View style={pad}>
        <View style={{
          backgroundColor: isDark ? colors.card : '#fff',
          borderRadius: 20, borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0',
          overflow: 'hidden', marginBottom: 12,
        }}>
          {/* Stat row */}
          <View style={{ flexDirection: 'row', borderBottomWidth: leaderboardOpen ? 1 : 0, borderBottomColor: isDark ? colors.border : '#F1F5F9' }}>
            {[
              { label: 'Reviewed', value: String(reviewedToday), emoji: '✅', color: '#10B981' },
              { label: 'Avg Streak', value: `🔥${avgStreak}d`, emoji: '', color: '#F97316' },
              { label: 'Cash-outs', value: String(pendingCashOuts.length), emoji: '💵', color: BRAND.amber },
            ].map((s, i, arr) => (
              <View key={s.label} style={{
                flex: 1, alignItems: 'center', paddingVertical: 14,
                borderRightWidth: i < arr.length - 1 ? 1 : 0,
                borderRightColor: isDark ? colors.border : '#F1F5F9',
              }}>
                <Text style={{ fontSize: TYPO.title, fontWeight: '900', color: s.color }}>{s.value}</Text>
                <Text style={{ fontSize: TYPO.micro, fontWeight: '600', color: colors.textTertiary, marginTop: 2 }}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* Leaderboard toggle */}
          <Pressable
            onPress={() => setLeaderboardOpen(o => !o)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 }}>
            <Text style={{ fontSize: 16 }}>🏆</Text>
            <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary }}>
              Family Leaderboard
            </Text>
            {leaderboardKids.length > 0 && (
              <View style={{ backgroundColor: BRAND.purple, borderRadius: 10, minWidth: 20, paddingHorizontal: 6, paddingVertical: 2, alignItems: 'center' }}>
                <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: '#fff' }}>{leaderboardKids.length}</Text>
              </View>
            )}
            {leaderboardOpen
              ? <ChevronUp size={16} color={colors.textTertiary} />
              : <ChevronDown size={16} color={colors.textTertiary} />}
          </Pressable>

          {leaderboardOpen && (
            <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 6 }}>
              {leaderboardKids.length === 0 ? (
                <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, textAlign: 'center', paddingVertical: 10 }}>
                  No kids added yet
                </Text>
              ) : leaderboardKids.map((kid, idx) => {
                // Same field Kid Hub reads (mainCoins ?? coins) — this used to
                // read a separately-derived ledger total that could show a
                // different number than what the kid saw on their own device.
                const kidCoins = (kid as any).mainCoins ?? (kid as any).coins ?? 0;
                const streak = (kid as any).streak ?? 0;
                const medals = ['🥇', '🥈', '🥉'];
                return (
                  <View key={kid.id} style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    paddingVertical: 10, paddingHorizontal: 10,
                    backgroundColor: idx === 0
                      ? (isDark ? BRAND.amber + '15' : BRAND.amber + '10')
                      : (isDark ? colors.surface : '#F8FAFC'),
                    borderRadius: 12,
                    borderWidth: idx === 0 ? 1 : 0,
                    borderColor: BRAND.amber + '40',
                  }}>
                    <Text style={{ fontSize: 18, width: 24 }}>{medals[idx] ?? '·'}</Text>
                    <FamilyAvatar
                      name={kid.name} emoji={(kid as any).emoji} avatarUrl={(kid as any).avatarUrl}
                      siblings={members.map(m => m.name)} size={30}
                      ringColor={idx === 0 ? BRAND.amber : BRAND.purple} ringWidth={1.5}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>
                        {kid.name.split(' ')[0]}
                      </Text>
                      {streak > 0 && (
                        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>🔥 {streak} day streak</Text>
                      )}
                    </View>
                    {idx === 0 && (
                      <View style={{ backgroundColor: BRAND.amber, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: '#fff' }}>Top</Text>
                      </View>
                    )}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3,
                      backgroundColor: BRAND.amber + '18', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5 }}>
                      <Text style={{ fontSize: 12 }}>🪙</Text>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: BRAND.amber }}>{kidCoins}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </View>

      {/* 3c. Dispatch En Route */}
      <View style={pad}>
        <View style={{
          backgroundColor: isDark ? '#0D2B1F' : '#ECFDF5',
          borderRadius: 24, borderWidth: 1, borderColor: isDark ? '#10B98140' : '#A7F3D0',
          padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12,
        }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: isDark ? '#10B98130' : '#D1FAE5', alignItems: 'center', justifyContent: 'center' }}>
            <Navigation size={22} color="#059669" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: isDark ? '#34D399' : '#065F46' }}>Start Pickup / Trip</Text>
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>Broadcast "En Route" with ETA to family chat</Text>
          </View>
          <Pressable onPress={onEnRoute} style={{ backgroundColor: '#10B981', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 9 }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>En Route</Text>
          </Pressable>
        </View>
      </View>

      {/* 4. Action Needed — ride approvals + quest reviews + kid requests unified */}
      {actionCount > 0 && (
        <View style={pad}>
          <SectionCard
            icon={<Sparkles size={16} color="#EF4444" />}
            title="Action Needed" badge={actionCount} badgeColor="#EF4444"
            collapsible defaultExpanded
            colors={colors} isDark={isDark}>

            {/* ── Ride / event requests ── */}
            {pendingRequests.map(ev => {
              const requester = ev.helperRequestedBy ?? members.find(m => m.id === ev.memberId)?.name ?? 'Kid';
              const rideMeta = parseRideMeta(ev.returnTime, ev.date);
              const isBothWays = rideMeta.isBothWays;
              const isDropoff  = rideMeta.isDropoff;
              const isPickup   = rideMeta.isPickup;
              const returnTimeStr = rideMeta.pickupLabel;

              // Parsed coins the parent optionally set for this ride
              const coinsStr   = rideCoinsByEvent[ev.id] ?? '';
              const coinsVal   = coinsStr.trim() ? parseInt(coinsStr, 10) : undefined;
              const splitCoins = coinsVal ? Math.floor(coinsVal / 2) : undefined;

              // Open to ALL helpers (GP + teen) — first to claim wins
              const openToHelpers = (rideCoins?: number) => {
                updateEvent(ev.id, {
                  approvalPending:      false,
                  helperStatus:         undefined,
                  returnTime:           undefined,
                  isOpenToGrandparents: true,
                  isOpenToTeens:        true,
                  rideCoins:            rideCoins,
                });
              };

              // Fork both-ways ride → 2 separate event cards
              const forkRide = (selfDrive: boolean) => {
                // Drop-off leg: keep original event, update time slot shown in timeline
                updateEvent(ev.id, {
                  approvalPending:      false,
                  helper:               selfDrive ? active.name : undefined,
                  helperStatus:         selfDrive ? 'confirmed' : undefined,
                  returnTime:           undefined,
                  title:                `${ev.title} — Drop-off`,
                  notes:                ev.notes,
                  color:                '#10B981',
                  isOpenToGrandparents: !selfDrive,
                  isOpenToTeens:        !selfDrive,
                  rideCoins:            selfDrive ? undefined : splitCoins,
                  pickupLocation:       ev.pickupLocation,
                  dropLocation:         ev.dropLocation,
                });
                // Pickup leg: new event at return time, locations reversed
                addEvent({
                  title:                `${ev.title} — Pickup`,
                  date:                 rideMeta.pickupDate ?? ev.date,
                  time:                 rideMeta.pickupTime ?? ev.time,
                  type:                 'event',
                  category:             'Ride',
                  allDay:               false,
                  memberId:             ev.memberId,
                  approvalPending:      false,
                  conflict:             false,
                  helper:               selfDrive ? active.name : undefined,
                  helperStatus:         selfDrive ? 'confirmed' : undefined,
                  notes:                ev.notes ? `(Return) ${ev.notes}` : `Pickup leg for "${ev.title}"`,
                  color:                '#6366F1',
                  isOpenToGrandparents: !selfDrive,
                  isOpenToTeens:        !selfDrive,
                  rideCoins:            selfDrive ? undefined : splitCoins,
                  pickupLocation:       ev.dropLocation,   // reversed for return leg
                  dropLocation:         ev.pickupLocation,
                });
              };

              const forkAndApprove = () => forkRide(false);

              return (
                <CollapsibleCard key={ev.id} flat accent={BRAND.amber} colors={colors} isDark={isDark} defaultExpanded={true}
                  summary={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Hand size={16} color={BRAND.amber} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.amber }} numberOfLines={1}>
                          {isBothWays ? '🔄 Both ways · ' : isDropoff ? '📍 Drop-off · ' : isPickup ? '🏁 Pickup · ' : '🚗 Ride · '}{ev.title}
                        </Text>
                        <Text style={{ fontSize: TYPO.label, color: BRAND.amber, opacity: 0.8 }}>
                          {requester} · {ev.time ? fmtTime(ev.time) : 'time TBD'}{ev.location ? ` · ${ev.location}` : ''}
                          {isBothWays && returnTimeStr ? ` · pickup ${returnTimeStr}` : ''}
                        </Text>
                      </View>
                      <View style={{ backgroundColor: BRAND.amber + '30', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: BRAND.amber }}>Pending</Text>
                      </View>
                    </View>
                  }>

                  {ev.notes && (
                    <View style={{ backgroundColor: isDark ? '#1e293b' : '#fefce8', borderRadius: 8, padding: 10, borderLeftWidth: 3, borderLeftColor: BRAND.amber }}>
                      <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, fontStyle: 'italic' }}>"{ev.notes}"</Text>
                    </View>
                  )}

                  {/* Optional coins for teen drivers — hidden when no teens in family */}
                  {members.some(m => m.role === 'teen') && <View style={{ borderRadius: 10, borderWidth: 1,
                    borderColor: isDark ? '#334155' : '#E2E8F0',
                    backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 6 }}>
                    <Text style={{ fontSize: 14 }}>🪙</Text>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, flex: 1 }}>
                      Coins for teen driver
                      {isBothWays && coinsVal ? ` (split ${splitCoins}+${splitCoins})` : ''}
                    </Text>
                    <TextInput
                      value={coinsStr}
                      onChangeText={v => setRideCoins(ev.id, v.replace(/[^0-9]/g, ''))}
                      keyboardType="number-pad"
                      placeholder="optional"
                      placeholderTextColor={colors.textTertiary}
                      style={{ width: 72, textAlign: 'right', fontSize: TYPO.caption, fontWeight: '800',
                        color: BRAND.amber, paddingVertical: 10 }}
                    />
                  </View>}

                  {isBothWays ? (
                    /* Both-ways: Approve & Split → 2 open cards */
                    <View style={{ gap: 8 }}>
                      <View style={{ backgroundColor: isDark ? '#0f2a20' : '#ecfdf5', borderRadius: 10, padding: 10, gap: 4, borderWidth: 1, borderColor: '#10B98130' }}>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#10B981' }}>📍 Drop-off · {ev.time ? fmtTime(ev.time) : 'time TBD'}</Text>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#6366F1', marginTop: 2 }}>🏁 Pickup · {returnTimeStr ?? 'time TBD'}</Text>
                        <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 4 }}>
                          Creates 2 cards — GP or teen first to claim each leg wins.
                          {splitCoins ? ` +${splitCoins} coins each leg.` : ''}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Pressable onPress={forkAndApprove}
                          style={{ flex: 2, backgroundColor: '#10B981', paddingVertical: 10, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>✅ Approve & Split</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => forkRide(true)}
                          style={{ flex: 1, backgroundColor: '#10B98120', borderWidth: 1, borderColor: '#10B98140', paddingVertical: 10, borderRadius: 12, alignItems: 'center' }}>
                          <Car size={13} color="#10B981" />
                          <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#10B981' }}>I'll Drive</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    /* Single-leg: I'll Drive OR open to all helpers */
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Pressable
                        onPress={() => updateEvent(ev.id, { approvalPending: false, helperStatus: 'confirmed', helper: active.name, returnTime: undefined })}
                        style={{ flex: 1, backgroundColor: '#10B981', paddingVertical: 11, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                        <Car size={14} color="#fff" />
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>I'll Drive</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => openToHelpers(coinsVal)}
                        style={{ flex: 1, backgroundColor: BRAND.amber + '20', borderWidth: 1.5, borderColor: BRAND.amber + '50', paddingVertical: 11, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 5 }}>
                        <Text style={{ fontSize: 13 }}>🤝</Text>
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.amber }}>Open to Helpers</Text>
                      </Pressable>
                    </View>
                  )}
                </CollapsibleCard>
              );
            })}

            {/* ── Quest approvals ── */}
            {awaitingApproval.map(q => {
              const kid = members.find(m => m.id === q.assignedToId);
              return (
                <CollapsibleCard key={q.id} flat accent={BRAND.purple} colors={colors} isDark={isDark} defaultExpanded={true}
                  summary={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Camera size={16} color={BRAND.purple} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.purple }} numberOfLines={1}>
                          Quest done — {q.title}
                        </Text>
                        {kid && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                            <FamilyAvatar name={kid.name} emoji={kid.emoji} avatarUrl={kid.avatarUrl}
                              siblings={allNames} size={14} ringColor={BRAND.purple} ringWidth={1} />
                            <Coins size={11} color={BRAND.amber} />
                            <Text style={{ fontSize: TYPO.label, color: BRAND.purple, fontWeight: '600' }}>
                              {kid.name.split(' ')[0]} wants {q.coins} coins
                            </Text>
                          </View>
                        )}
                      </View>
                      <View style={{ backgroundColor: BRAND.purple + '30', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: BRAND.purple }}>Review</Text>
                      </View>
                    </View>
                  }>
                  {/* Submitted proof — photo + note, so the parent can actually review before paying */}
                  {q.photoUrl ? (
                    <TouchableOpacity
                      onPress={() => router.push({ pathname: '/(tabs)/quests', params: { questId: q.id } } as any)}
                      style={{ borderRadius: 12, overflow: 'hidden', marginBottom: 10 }}>
                      <Image
                        source={{ uri: q.photoUrl }}
                        style={{ width: '100%', height: 140, backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }}
                        resizeMode="cover"
                      />
                      <View style={{ position: 'absolute', bottom: 8, right: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.6)' }}>
                        <Text style={{ fontSize: TYPO.micro, color: '#fff', fontWeight: '700' }}>Tap to enlarge</Text>
                      </View>
                    </TouchableOpacity>
                  ) : q.photoRequired ? (
                    <View style={{ borderRadius: 12, marginBottom: 10, padding: 10, alignItems: 'center', gap: 4,
                      backgroundColor: isDark ? '#1C1200' : '#FFF7ED', borderWidth: 1, borderColor: '#FCD34D60' }}>
                      <Text style={{ fontSize: TYPO.label, color: '#D97706', fontWeight: '700' }}>⚠️ Photo proof missing</Text>
                    </View>
                  ) : null}
                  {q.completionNote ? (
                    <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, fontStyle: 'italic', marginBottom: 10 }}>
                      "{q.completionNote}"
                    </Text>
                  ) : null}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      onPress={() => Alert.prompt(
                        'Decline Quest',
                        `Let ${kid?.name.split(' ')[0] ?? 'them'} know why "${q.title}" needs another try.`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Decline', style: 'destructive', onPress: (reason: string | undefined) => declineQuest(q.id, active.id, reason?.trim() || 'Needs another try') },
                        ],
                        'plain-text',
                      )}
                      style={{ flex: 1, backgroundColor: '#EF444415', borderWidth: 1, borderColor: '#EF444440',
                        paddingVertical: 10, borderRadius: 12, alignItems: 'center' }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#EF4444' }}>✕ Decline</Text>
                    </Pressable>
                    <Pressable onPress={() => approveQuest(q.id, active.id)}
                      style={{ flex: 2, backgroundColor: BRAND.purple, paddingVertical: 10, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                      <Coins size={14} color="#fff" />
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>Approve & Pay {q.coins} Coins</Text>
                    </Pressable>
                  </View>
                </CollapsibleCard>
              );
            })}

            {/* ── Kid requests: checkins, questions, permissions, grocery, supplies ── */}
            {pendingKidRequests.map(req => {
              const kid = members.find(m => m.id === req.fromMemberId);
              const kidName = kid?.name.split(' ')[0] ?? 'Kid';
              const isSupplies   = req.detail.startsWith(SUPPLIES_PREFIX);
              const isGrocery    = req.type === 'delegation' && !isSupplies && (req.items?.length ?? 0) > 0;
              const isPermission = req.type === 'permission';
              const isQuestion   = req.type === 'question';
              const isMedical    = req.type === 'medication';
              const isCheckin    = req.type === 'checkin';
              const accent = isMedical ? '#EF4444' : isGrocery ? '#10B981' : isSupplies ? '#6366F1' : isPermission ? BRAND.amber : isQuestion ? BRAND.purple : BRAND.teal;
              const pendingItems = (req.items ?? []).filter(it => it.status === 'pending');

              // ── Check-in: acknowledgment row (not a permission) ──
              if (isCheckin) {
                return (
                  <View key={req.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                    backgroundColor: isDark ? '#1e293b' : '#F0FDF4', borderRadius: 14, padding: 12,
                    borderLeftWidth: 3, borderLeftColor: BRAND.teal }}>
                    <Text style={{ fontSize: 22 }}>{req.detail.includes('late') || req.detail.includes('Late') ? '🏃' : req.detail.includes('home') || req.detail.includes('Home') ? '🏠' : '🎒'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.teal }}>{kidName}</Text>
                      <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }} numberOfLines={2}>{req.detail}</Text>
                    </View>
                    <Pressable onPress={() => approveRequest(req.id, active.id)}
                      style={{ backgroundColor: BRAND.teal, borderRadius: 10,
                        paddingHorizontal: 12, paddingVertical: 8 }}>
                      <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Got it 👍</Text>
                    </Pressable>
                  </View>
                );
              }

              // ── "My driver hasn't arrived" — a stranded kid, not an approval ──
              // Without this branch an emergency request falls through to the
              // grocery/supplies fallback and renders as "Supplies — 0 items".
              const rideLate = decodeRideLate(req.detail)
                // Requests raised before the structured payload existed carry a
                // plain sentence — still show the alert card, just thinner.
                ?? (req.type === 'emergency'
                  ? { eventId: '', title: req.detail.replace(/^My driver.*?for /i, '').replace(/^"|"$/g, '') || 'a ride',
                      time: undefined, driver: undefined, location: req.location,
                      dropLocation: undefined, sentAt: req.requestedAt }
                  : null);
              if (rideLate) {
                const ev = events.find(e => e.id === rideLate.eventId);
                const waitedMin = Math.max(0, Math.round((Date.now() - new Date(rideLate.sentAt).getTime()) / 60000));
                const lateBy = (() => {
                  if (!rideLate.time) return null;
                  const [h, m] = rideLate.time.split(':').map(Number);
                  const due = new Date(); due.setHours(h, m, 0, 0);
                  const mins = Math.round((Date.now() - due.getTime()) / 60000);
                  return mins > 0 ? mins : null;
                })();
                const driverName = rideLate.driver ?? ev?.helper;
                const pickup     = rideLate.location ?? ev?.pickupLocation ?? ev?.location;
                const dropOff    = rideLate.dropLocation ?? ev?.dropLocation;
                const resolve = (note: string, chat: string) => {
                  approveRequest(req.id, active.id, note);
                  useChatStore.getState().sendMessage('all', active.id, chat);
                };
                return (
                  <CollapsibleCard key={req.id} accent="#EF4444" colors={colors} isDark={isDark} defaultExpanded
                    summary={
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={{ fontSize: 22 }}>🚨</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: '#EF4444' }}>
                            {kidName} is still waiting
                          </Text>
                          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 1 }} numberOfLines={1}>
                            {rideLate.title}{rideLate.time ? ` · was ${fmtTime(rideLate.time)}` : ''}
                          </Text>
                        </View>
                        <View style={{ backgroundColor: '#EF444420', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: '#EF4444' }}>
                            {lateBy ? `${lateBy}m late` : `${waitedMin}m ago`}
                          </Text>
                        </View>
                      </View>
                    }>
                    {/* Everything the parent needs to judge the situation at a glance */}
                    <View style={{ borderRadius: 12, padding: 10, gap: 6,
                      backgroundColor: isDark ? colors.surface : '#FEF2F2',
                      borderWidth: 1, borderColor: '#EF444425' }}>
                      {[
                        ['🚗', 'Driver', driverName ?? 'Nobody assigned'],
                        ['📍', 'Pickup', pickup ?? '—'],
                        ...(dropOff ? [['🏁', 'Drop-off', dropOff]] : []),
                        ['🕒', 'Scheduled', rideLate.time ? fmtTime(rideLate.time) : '—'],
                        ['⏱️', 'Waiting', `${waitedMin} min since ${kidName} raised it`],
                      ].map(([icon, label, value]) => (
                        <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ fontSize: 13 }}>{icon}</Text>
                          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textTertiary, width: 68 }}>{label}</Text>
                          <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary }} numberOfLines={2}>{value}</Text>
                        </View>
                      ))}
                    </View>

                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Pressable onPress={() => resolve(
                        "On my way",
                        `🚗 ${active.name.split(' ')[0]} is on the way to ${kidName} for "${rideLate.title}" — hang tight!`)}
                        style={{ flex: 1, backgroundColor: '#10B981', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>🚗 I'm on my way</Text>
                      </Pressable>
                      <Pressable onPress={() => router.push('/(tabs)/chat')}
                        style={{ borderWidth: 1.5, borderColor: BRAND.teal + '60', borderRadius: 10,
                          paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' }}>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: BRAND.teal }}>💬 Message</Text>
                      </Pressable>
                    </View>
                    {/* No driver, or the assigned one is unreachable — open it up */}
                    {ev && (
                      <Pressable onPress={() => {
                        updateEvent(ev.id, { isOpenToGrandparents: true, isOpenToTeens: true, helperStatus: undefined });
                        resolve('Opened to other helpers',
                          `🆘 ${kidName} needs a ride for "${rideLate.title}" — can anyone pick this up?`);
                      }}
                        style={{ borderWidth: 1.5, borderColor: BRAND.amber + '60', borderRadius: 10,
                          paddingVertical: 10, alignItems: 'center' }}>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: BRAND.amber }}>
                          🙋 Ask someone else to go
                        </Text>
                      </Pressable>
                    )}
                  </CollapsibleCard>
                );
              }

              // ── Ride / Tutor / Cheer: approve + GP Welcome toggle ──
              if (req.type === 'ride' || req.type === 'tutor' || req.type === 'cheer') {
                const typeEmoji  = req.type === 'ride' ? '🚗' : req.type === 'tutor' ? '📚' : '🎉';
                const typeLabel  = req.type === 'ride' ? 'Ride Request' : req.type === 'tutor' ? 'Tutor Request' : 'Cheer Request';
                const isGPOpen   = !!req.openToGP;
                return (
                  <View key={req.id} style={{ borderRadius: 14, borderWidth: 1.5,
                    borderColor: BRAND.teal + '50', backgroundColor: isDark ? '#0D2A2A' : '#F0FDFA',
                    overflow: 'hidden' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }}>
                      <Text style={{ fontSize: 22 }}>{typeEmoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.teal }}>{kidName} — {typeLabel}</Text>
                        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 1 }} numberOfLines={2}>{req.detail}</Text>
                        {req.scheduledDate || req.scheduledTime ? (
                          <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 2 }}>
                            {req.scheduledDate ?? ''}{req.scheduledTime ? ` at ${req.scheduledTime}` : ''}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    {/* GP Welcome toggle — parent can flag at approval time */}
                    <Pressable onPress={() => toggleGPWelcome(req.id, !isGPOpen)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                        marginHorizontal: 12, marginBottom: 8, padding: 8, borderRadius: 10,
                        backgroundColor: isGPOpen ? (isDark ? '#14291a' : '#DCFCE7') : (isDark ? colors.surface2 : '#F1F5F9'),
                        borderWidth: 1, borderColor: isGPOpen ? '#22c55e' : (isDark ? colors.border : '#CBD5E1') }}>
                      <Text style={{ fontSize: 14 }}>👴</Text>
                      <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '700',
                        color: isGPOpen ? '#22c55e' : colors.textSecondary }}>
                        {isGPOpen ? 'GP Welcome — grandparent can take this' : 'Offer to GP (grandparent can help)'}
                      </Text>
                      <Text style={{ fontSize: 12 }}>{isGPOpen ? '✅' : '○'}</Text>
                    </Pressable>
                    <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 12 }}>
                      <Pressable onPress={() => approveRequest(req.id, active.id)}
                        style={{ flex: 1, backgroundColor: BRAND.teal, borderRadius: 10,
                          paddingVertical: 9, alignItems: 'center' }}>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>✓ Approve</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          const kid = members.find(m => m.id === req.fromMemberId);
                          const kidFirst = kid?.name.split(' ')[0] ?? 'your kid';
                          Alert.prompt(
                            'Decline Request',
                            `Add a note for ${kidFirst} — why can't this happen?`,
                            [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Send & Decline', style: 'destructive', onPress: (note: string | undefined) => {
                                const finalNote = note?.trim() || undefined;
                                declineRequest(req.id, active.id, finalNote);
                                const msg = `❌ ${active.name.split(' ')[0]} declined your ${req.type} request: "${req.detail}"${finalNote ? `\n📝 "${finalNote}"` : ''}`;
                                useChatStore.getState().sendMessage('all', active.id, msg);
                              }},
                            ],
                            'plain-text',
                            '',
                          );
                        }}
                        style={{ flex: 1, backgroundColor: '#EF444415', borderWidth: 1,
                          borderColor: '#EF444440', borderRadius: 10, paddingVertical: 9, alignItems: 'center' }}>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#EF4444' }}>✕ Decline</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              }

              // ── Question / Permission / Medical: inline reply card ──
              if (isQuestion || isPermission || isMedical) {
                return (
                  <InlineReplyCard
                    key={req.id}
                    req={req}
                    kidName={kidName}
                    isPermission={isPermission}
                    isQuestion={isQuestion}
                    isMedical={isMedical}
                    accent={accent}
                    colors={colors}
                    isDark={isDark}
                    onApprove={(reply) => approveRequest(req.id, active.id, reply || undefined)}
                    onDecline={(reply) => declineRequest(req.id, active.id, reply || undefined)}
                  />
                );
              }

              // ── Grocery / Supplies: collapsible with item-level approve ──
              // Same rounded-card model as the old "Who Needs Help" cards — not the
              // flat divider style, so each request reads as its own distinct card.
              const hasItems = (req.items ?? []).length > 0;
              // Legacy single-item encoding (no items[]) — decode instead of showing raw JSON
              const decodedGrocery = !hasItems && req.detail.startsWith(GROCERY_PREFIX) ? decodeGroceryRequest(req.detail) : null;
              const rawDetailText = !hasItems && !decodedGrocery && req.detail && req.detail !== SUPPLIES_PREFIX && req.detail !== GROCERY_PREFIX
                ? req.detail.replace(SUPPLIES_PREFIX, '').trim()
                : null;
              return (
                <CollapsibleCard key={req.id} accent={accent} colors={colors} isDark={isDark}
                  defaultExpanded={isGrocery} // Grocery expanded by default, Supplies collapsed
                  summary={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: accent + '20', alignItems: 'center', justifyContent: 'center' }}>
                        {isGrocery ? <ShoppingCart size={14} color={accent} /> : <Sparkles size={14} color={accent} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: accent }} numberOfLines={1}>
                          {isGrocery ? 'Grocery' : 'Supplies'} — {kidName}
                        </Text>
                        <Text style={{ fontSize: TYPO.label, color: accent, opacity: 0.8 }}>
                          {req.items?.length ?? 0} items · {pendingItems.length} pending
                        </Text>
                      </View>
                      <View style={{ backgroundColor: accent + '30', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: accent }}>Pending</Text>
                      </View>
                    </View>
                  }>
                  {/* Request detail — only for legacy requests with no items[] to list instead */}
                  {decodedGrocery && (
                    <View style={{ marginBottom: 10, borderRadius: 12, padding: 12,
                      backgroundColor: isDark ? '#1e293b' : '#fff',
                      borderLeftWidth: 3, borderLeftColor: accent }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>
                        {decodedGrocery.name}{decodedGrocery.qty ? ` × ${decodedGrocery.qty}` : ''}
                      </Text>
                      {decodedGrocery.notes ? (
                        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>"{decodedGrocery.notes}"</Text>
                      ) : null}
                    </View>
                  )}
                  {rawDetailText && (
                    <View style={{ marginBottom: 10, borderRadius: 12, padding: 12,
                      backgroundColor: isDark ? '#1e293b' : '#fff',
                      borderLeftWidth: 3, borderLeftColor: accent }}>
                      <Text style={{ fontSize: TYPO.caption, color: colors.textPrimary }}>
                        "{rawDetailText}"
                      </Text>
                    </View>
                  )}

                  {/* Item list */}
                  {(req.items ?? []).length > 0 ? (
                    <>
                      <View style={{ gap: 6, marginBottom: 8 }}>
                        {req.items.map(item => (
                          <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                            backgroundColor: isDark ? '#1e293b' : '#F8FAFC', borderRadius: 10, padding: 10 }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{item.name}</Text>
                              {item.qty ? <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Qty: {item.qty}</Text> : null}
                            </View>
                            {item.status === 'pending' ? (
                              <View style={{ flexDirection: 'row', gap: 6 }}>
                                <Pressable onPress={() => approveItemsAndSync(req.id, [item.id], isSupplies)}
                                  style={{ backgroundColor: accent + '20', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                                  <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: accent }}>✓ Add</Text>
                                </Pressable>
                                <Pressable onPress={() => rejectItems(req.id, [item.id], active.id)}
                                  style={{ backgroundColor: '#EF444420', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                                  <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#EF4444' }}>✕</Text>
                                </Pressable>
                              </View>
                            ) : (
                              <View style={{ backgroundColor: item.status === 'approved' ? '#10B98120' : '#EF444420', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                                <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: item.status === 'approved' ? '#10B981' : '#EF4444' }}>
                                  {item.status === 'approved' ? '✓ Added' : '✕ No'}
                                </Text>
                              </View>
                            )}
                          </View>
                        ))}
                      </View>
                      {pendingItems.length > 1 && (
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <Pressable onPress={() => approveItemsAndSync(req.id, pendingItems.map(i => i.id), isSupplies)}
                            style={{ flex: 1, backgroundColor: accent + '15', borderWidth: 1, borderColor: accent + '40', paddingVertical: 8, borderRadius: 10, alignItems: 'center' }}>
                            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: accent }}>Add All</Text>
                          </Pressable>
                          <Pressable onPress={() => rejectItems(req.id, pendingItems.map(i => i.id), active.id)}
                            style={{ flex: 1, backgroundColor: '#EF444415', borderWidth: 1, borderColor: '#EF444430', paddingVertical: 8, borderRadius: 10, alignItems: 'center' }}>
                            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#EF4444' }}>Reject All</Text>
                          </Pressable>
                        </View>
                      )}
                    </>
                  ) : (
                    /* No items — show overall approve/decline buttons */
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Pressable onPress={() => approveRequest(req.id, active.id)}
                        style={{ flex: 1, backgroundColor: accent, borderRadius: 10,
                          paddingVertical: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                        <Check size={14} color="#fff" />
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>Approve</Text>
                      </Pressable>
                      <Pressable onPress={() => declineRequest(req.id, active.id)}
                        style={{ flex: 1, backgroundColor: '#EF444415', borderWidth: 1,
                          borderColor: '#EF444440', borderRadius: 10, paddingVertical: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                        <X size={14} color="#EF4444" />
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#EF4444' }}>Decline</Text>
                      </Pressable>
                    </View>
                  )}
                </CollapsibleCard>
              );
            })}

          </SectionCard>
        </View>
      )}

      {/* 4b-GP. Approved rides/help awaiting a helper — offer to GP */}
      {approvedRideRequests.length > 0 && (
        <View style={pad}>
          <View style={{ backgroundColor: isDark ? colors.card : '#fff',
            borderRadius: 18, borderWidth: 1, borderColor: isDark ? '#3b5a3b' : '#BBF7D0',
            overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, paddingBottom: 10,
              borderBottomWidth: 1, borderBottomColor: isDark ? '#1a2e1a' : '#D1FAE5' }}>
              <View style={{ width: 32, height: 32, borderRadius: 16,
                backgroundColor: isDark ? '#14291a' : '#ECFDF5', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 16 }}>👴</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: isDark ? '#86efac' : '#166534' }}>
                  GP Can Help
                </Text>
                <Text style={{ fontSize: TYPO.label, color: isDark ? '#4ade80' : '#166534', opacity: 0.8 }}>
                  Approved requests a grandparent could handle
                </Text>
              </View>
            </View>
            <View style={{ padding: 12, gap: 8 }}>
              {approvedRideRequests.map(req => {
                const kid = members.find(m => m.id === req.fromMemberId);
                const kidName = kid?.name.split(' ')[0] ?? 'Kid';
                const typeEmoji = req.type === 'ride' ? '🚗' : req.type === 'tutor' ? '📚' : '🎉';
                const isOpen = !!req.openToGP;
                return (
                  <View key={req.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                    borderRadius: 12, padding: 10,
                    backgroundColor: isOpen
                      ? (isDark ? '#14291a' : '#F0FDF4')
                      : (isDark ? colors.surface : '#F8FAFC'),
                    borderWidth: 1,
                    borderColor: isOpen
                      ? (isDark ? '#166534' : '#86EFAC')
                      : (isDark ? colors.border : '#E2E8F0') }}>
                    <Text style={{ fontSize: 20 }}>{typeEmoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>
                        {kidName} — {req.detail}
                      </Text>
                      {req.scheduledDate || req.scheduledTime ? (
                        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 1 }}>
                          {req.scheduledDate ?? ''}{req.scheduledTime ? ` at ${req.scheduledTime}` : ''}
                        </Text>
                      ) : null}
                    </View>
                    <Pressable
                      onPress={() => toggleGPWelcome(req.id, !isOpen)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
                        paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
                        backgroundColor: isOpen
                          ? (isDark ? '#14291a' : '#DCFCE7')
                          : (isDark ? colors.surface2 : '#F1F5F9'),
                        borderWidth: 1,
                        borderColor: isOpen ? '#22c55e' : (isDark ? colors.border : '#CBD5E1') }}>
                      <Text style={{ fontSize: 11 }}>{isOpen ? '✅' : '👴'}</Text>
                      <Text style={{ fontSize: TYPO.label, fontWeight: '800',
                        color: isOpen ? '#22c55e' : colors.textSecondary }}>
                        {isOpen ? 'GP Open' : 'Offer GP'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      )}

      {/* 4b. Household Backlog — Parent-only quests */}
      <View style={pad}>
        <View style={{
          backgroundColor: isDark ? colors.card : '#fff',
          borderRadius: 20, borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0',
          overflow: 'hidden', marginBottom: 12,
        }}>
          {/* Header */}
          <Pressable onPress={() => setBacklogExpanded(e => !e)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, paddingBottom: 12 }}>
            <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: BRAND.purple + '20', alignItems: 'center', justifyContent: 'center' }}>
              <ClipboardList size={18} color={BRAND.purple} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>Household Backlog</Text>
                {(questPool.length + myAdultQuests.length + othersAdultQuests.length + myHelperEvents.length) > 0 && (
                  <View style={{ backgroundColor: BRAND.purple, borderRadius: 10, minWidth: 20, paddingHorizontal: 6, paddingVertical: 2, alignItems: 'center' }}>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: '#fff' }}>
                      {questPool.length + myAdultQuests.length + othersAdultQuests.length + myHelperEvents.length}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 1 }}>
                pull what you can handle
              </Text>
            </View>
            <Pressable onPress={() => setShowAddTask(true)}
              style={{ backgroundColor: BRAND.purple, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, marginRight: 6 }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>+ Add</Text>
            </Pressable>
            {backlogExpanded
              ? <ChevronUp size={16} color={colors.textTertiary} />
              : <ChevronDown size={16} color={colors.textTertiary} />}
          </Pressable>

          {backlogExpanded && (
            <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 8 }}>

              {/* My assigned adult quests (questStore) — show with Done + Delegate */}
              {myAdultQuests.length > 0 && (
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.purple, marginBottom: 2 }}>
                    Assigned to you
                  </Text>
                  {myAdultQuests.map(q => {
                    const isExp = expandedCards[q.id] ?? false;
                    return (
                    <View key={q.id} style={{
                      borderRadius: 14, borderWidth: 1.5, borderColor: BRAND.purple + '40',
                      backgroundColor: isDark ? BRAND.purple + '10' : '#F5F3FF', overflow: 'hidden',
                    }}>
                      {/* Header row — always visible */}
                      <Pressable onPress={() => toggleCard(q.id)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{q.title}</Text>
                          {q.dueDate && !isExp ? (
                            <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 1 }}>Due {q.dueDate}</Text>
                          ) : null}
                        </View>
                        {isExp ? <ChevronUp size={14} color={colors.textTertiary} /> : <ChevronDown size={14} color={colors.textTertiary} />}
                      </Pressable>
                      {/* Action buttons — always visible */}
                      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 12 }}>
                        <Pressable onPress={() => {
                          // A pulled/delegated chore has both a chore row and an assignment row.
                          // Finish them together, or the assignment resurfaces its own Done card.
                          const a = parentAssignments.find(x => x.choreId === q.id && x.status !== 'COMPLETED' && x.status !== 'DECLINED');
                          if (a) completeParentQuest(a.id, active.id);
                          else updateQuest(q.id, { status: 'done' });
                        }}
                          style={{ flex: 1, backgroundColor: BRAND.teal, borderRadius: 10, paddingVertical: 8, alignItems: 'center' }}>
                          <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>✓ Done</Text>
                        </Pressable>
                        <Pressable onPress={() => setDelegateSheet({ choreId: q.id, choreTitle: q.title })}
                          style={{ flex: 1, borderWidth: 1.5, borderColor: BRAND.amber + '60', borderRadius: 10, paddingVertical: 8, alignItems: 'center' }}>
                          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.amber }}>📤 Reassign</Text>
                        </Pressable>
                      </View>
                      {/* Expanded detail */}
                      {isExp && (
                        <View style={{ borderTopWidth: 1, borderTopColor: BRAND.purple + '30', padding: 12, gap: 6 }}>
                          {q.description ? <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{q.description}</Text> : null}
                          {q.dueDate ? <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }}>Due {q.dueDate}</Text> : null}
                        </View>
                      )}
                    </View>
                    );
                  })}
                </View>
              )}

              {/* Others' assigned quests — readonly with Nudge + Reclaim */}
              {othersAdultQuests.length > 0 && (
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, marginBottom: 2 }}>
                    Assigned to others
                  </Text>
                  {othersAdultQuests.map(q => {
                    const assignee   = members.find(m => m.id === q.assignedToId);
                    const choreData  = useChoreStore.getState().chores.find(c => c.id === q.id);
                    const si         = choreData?.shoppingItems ?? (q as any).shoppingItems;
                    const ss         = choreData?.shoppingStore ?? (q as any).shoppingStore;
                    const isExp      = expandedCards[`o_${q.id}`] ?? false;
                    const hasDetail  = q.description || si?.length > 0 || ss || q.dueDate;

                    const sendNudge = () => {
                      const msg = `👋 Hey ${assignee?.name?.split(' ')[0] ?? 'partner'}, just a nudge — "${q.title}" is still open. Need any help?`;
                      useChatStore.getState().sendMessage('all', active.id, msg);
                      Alert.alert('Nudge sent!', `A reminder was posted to family chat for ${assignee?.name ?? 'your partner'}.`);
                    };

                    const reclaim = () => Alert.alert(
                      'Reclaim task',
                      `Reassign "${q.title}" to yourself?`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Reclaim', onPress: () => updateQuest(q.id, { assignedToId: active.id }) },
                      ]
                    );

                    return (
                      <View key={q.id} style={{
                        borderRadius: 14, borderWidth: 1.5,
                        borderColor: BRAND.amber + '50',
                        backgroundColor: isDark ? BRAND.amber + '08' : '#FFFBEB',
                        overflow: 'hidden',
                      }}>
                        {/* Header row — always visible */}
                        <Pressable onPress={() => hasDetail && toggleCard(`o_${q.id}`)}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, paddingBottom: 8 }}>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              {si?.length > 0 && <Text style={{ fontSize: 13 }}>🛍️</Text>}
                              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>
                                {q.title}
                              </Text>
                            </View>
                            <Text style={{ fontSize: TYPO.label, color: BRAND.amber, marginTop: 2, fontWeight: '600' }}>
                              → {assignee?.name ?? 'Partner'}{q.dueDate ? ` · Due ${q.dueDate}` : ''}
                            </Text>
                            {si?.length > 0 && !isExp && (
                              <Text style={{ fontSize: TYPO.micro, color: isDark ? '#2DD4BF' : '#0D9488', marginTop: 2 }}>
                                {si.length} item{si.length !== 1 ? 's' : ''}{ss ? ` · ${ss}` : ''}
                              </Text>
                            )}
                          </View>
                          {hasDetail ? (isExp
                            ? <ChevronUp size={14} color={colors.textTertiary} />
                            : <ChevronDown size={14} color={colors.textTertiary} />
                          ) : null}
                        </Pressable>

                        {/* Expanded detail — shopping list + description */}
                        {isExp && (
                          <View style={{ borderTopWidth: 1, borderTopColor: BRAND.amber + '30', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4, gap: 8 }}>
                            {q.description ? (
                              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{q.description}</Text>
                            ) : null}
                            {si?.length > 0 && (
                              <View style={{ borderRadius: 10, borderWidth: 1,
                                borderColor: isDark ? BRAND.teal + '40' : '#99F6E4',
                                backgroundColor: isDark ? BRAND.teal + '10' : '#F0FDFA', overflow: 'hidden' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                                  paddingHorizontal: 10, paddingVertical: 7,
                                  borderBottomWidth: 1, borderBottomColor: isDark ? BRAND.teal + '30' : '#99F6E4' }}>
                                  <Text style={{ fontSize: 12 }}>🛍️</Text>
                                  <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '700', color: isDark ? '#2DD4BF' : '#0D9488' }}>
                                    {ss ? `Shop at ${ss}` : 'Shopping List'}
                                  </Text>
                                </View>
                                {si.map((item: string, i: number) => (
                                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                                    paddingHorizontal: 10, paddingVertical: 6,
                                    borderBottomWidth: i < si.length - 1 ? 1 : 0,
                                    borderBottomColor: isDark ? BRAND.teal + '20' : '#CCFBF1' }}>
                                    <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 1.5,
                                      borderColor: isDark ? '#2DD4BF' : '#0D9488' }} />
                                    <Text style={{ fontSize: TYPO.label, color: colors.textPrimary }}>{item}</Text>
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>
                        )}

                        {/* GP Welcome toggle — GP can buy supplies / scan receipt */}
                        {(() => {
                          const isGPOpen = !!(choreData?.openToGP ?? (q as any).openToGP);
                          return (
                            <Pressable onPress={() => useChoreStore.getState().updateChore(q.id, { openToGP: !isGPOpen })}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 7,
                                marginHorizontal: 12, marginBottom: 6, padding: 8, borderRadius: 10,
                                backgroundColor: isGPOpen ? (isDark ? '#14291a' : '#DCFCE7') : (isDark ? colors.surface2 : '#F8FAFC'),
                                borderWidth: 1, borderColor: isGPOpen ? '#22c55e' : (isDark ? colors.border : '#E2E8F0') }}>
                              <Text style={{ fontSize: 13 }}>👴</Text>
                              <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '700',
                                color: isGPOpen ? '#22c55e' : colors.textSecondary }}>
                                {isGPOpen ? 'GP Welcome — can buy & scan receipt' : 'Offer to GP (buy supplies + receipt scan)'}
                              </Text>
                              <Text style={{ fontSize: 11 }}>{isGPOpen ? '✅' : '○'}</Text>
                            </Pressable>
                          );
                        })()}

                        {/* Action buttons — Nudge + Reclaim always visible */}
                        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 12, paddingTop: 4 }}>
                          <Pressable onPress={sendNudge}
                            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                              backgroundColor: isDark ? '#1C1000' : '#FEF3C7',
                              borderWidth: 1.5, borderColor: BRAND.amber + '60',
                              borderRadius: 10, paddingVertical: 8 }}>
                            <MessageCircle size={13} color={BRAND.amber} />
                            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: BRAND.amber }}>Nudge</Text>
                          </Pressable>
                          <Pressable onPress={reclaim}
                            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                              backgroundColor: BRAND.purple + '18',
                              borderWidth: 1.5, borderColor: BRAND.purple + '50',
                              borderRadius: 10, paddingVertical: 8 }}>
                            <ArrowRightLeft size={13} color={BRAND.purple} />
                            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: BRAND.purple }}>Reclaim</Text>
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Direct assignments pending my response */}
              {myDirectPending.length > 0 && (
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.amber, marginBottom: 2 }}>
                    Assigned to you — needs response
                  </Text>
                  {myDirectPending.map(a => {
                    const chore = questPool.find(c => c.id === a.choreId);
                    if (!chore) return null;
                    const assigner = members.find(m => m.id === a.assignedBy);
                    const isExp = expandedCards[`dp_${a.id}`] ?? false;
                    return (
                      <View key={a.id} style={{
                        borderRadius: 14, borderWidth: 1.5, borderColor: BRAND.amber + '50',
                        backgroundColor: isDark ? BRAND.amber + '10' : BRAND.amber + '08', overflow: 'hidden',
                      }}>
                        {/* Header — always visible */}
                        <Pressable onPress={() => toggleCard(`dp_${a.id}`)}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, paddingBottom: 8 }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{chore.title}</Text>
                            <Text style={{ fontSize: TYPO.label, color: BRAND.amber, marginTop: 2 }}>
                              From {assigner?.name ?? 'Partner'}
                            </Text>
                          </View>
                          {isExp ? <ChevronUp size={14} color={colors.textTertiary} /> : <ChevronDown size={14} color={colors.textTertiary} />}
                        </Pressable>
                        {/* Action buttons — always visible */}
                        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 12 }}>
                          <Pressable onPress={() => respondToParentQuest(a.id, { action: 'ACCEPT' })}
                            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                              backgroundColor: '#10B981', borderRadius: 10, paddingVertical: 8 }}>
                            <Check size={14} color="#fff" />
                            <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>Accept</Text>
                          </Pressable>
                          <Pressable onPress={() => setPushbackSheet({ assignmentId: a.id, choreTitle: chore.title })}
                            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                              borderWidth: 1.5, borderColor: BRAND.amber + '60',
                              borderRadius: 10, paddingVertical: 8 }}>
                            <MessageCircle size={14} color={BRAND.amber} />
                            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.amber }}>Respond</Text>
                          </Pressable>
                        </View>
                        {/* Expanded detail */}
                        {isExp && chore.description && (
                          <View style={{ borderTopWidth: 1, borderTopColor: BRAND.amber + '30', padding: 12 }}>
                            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{chore.description}</Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Locked (Two-Bounce) items */}
              {myLockedItems.map(a => {
                const chore = questPool.find(c => c.id === a.choreId);
                if (!chore) return null;
                return (
                  <View key={a.id} style={{
                    borderRadius: 14, borderWidth: 1.5, borderColor: '#EF444440',
                    backgroundColor: isDark ? '#EF444410' : '#FEF2F2', padding: 12, flexDirection: 'row', gap: 10, alignItems: 'center',
                  }}>
                    <AlertCircle size={16} color="#EF4444" />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{chore.title}</Text>
                      <Text style={{ fontSize: TYPO.label, color: '#EF4444', marginTop: 2 }}>Discuss offline — bounced twice</Text>
                    </View>
                  </View>
                );
              })}

              {/* Accepted / In Progress */}
              {myAccepted.map(a => {
                const chore = questPool.find(c => c.id === a.choreId);
                if (!chore) return null;
                const isExp = expandedCards[`ac_${a.id}`] ?? false;
                const hasDetail = chore.description || (chore as any).shoppingItems?.length > 0;
                return (
                  <View key={a.id} style={{
                    borderRadius: 14, borderWidth: 1.5, borderColor: BRAND.teal + '40',
                    backgroundColor: isDark ? BRAND.teal + '10' : BRAND.teal + '08', overflow: 'hidden',
                  }}>
                    {/* Header — always visible */}
                    <Pressable onPress={() => hasDetail && toggleCard(`ac_${a.id}`)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, paddingBottom: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{chore.title}</Text>
                        <Text style={{ fontSize: TYPO.label, color: BRAND.teal, marginTop: 2 }}>You've got this one ✓</Text>
                      </View>
                      {hasDetail ? (isExp ? <ChevronUp size={14} color={colors.textTertiary} /> : <ChevronDown size={14} color={colors.textTertiary} />) : null}
                    </Pressable>
                    {/* Done button — always visible */}
                    <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
                      <Pressable onPress={() => completeParentQuest(a.id, active.id)}
                        style={{ backgroundColor: BRAND.teal, borderRadius: 10, paddingVertical: 8, alignItems: 'center' }}>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>✓ Done</Text>
                      </Pressable>
                    </View>
                    {/* Expanded detail */}
                    {isExp && (
                      <View style={{ borderTopWidth: 1, borderTopColor: BRAND.teal + '30', padding: 12, gap: 8 }}>
                        {chore.description ? <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{chore.description}</Text> : null}
                        {(chore as any).shoppingItems?.length > 0 && (
                          <View style={{ borderRadius: 10, borderWidth: 1,
                            borderColor: isDark ? BRAND.teal + '40' : '#99F6E4',
                            backgroundColor: isDark ? BRAND.teal + '08' : '#F0FDFA', overflow: 'hidden' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7,
                              borderBottomWidth: 1, borderBottomColor: isDark ? BRAND.teal + '30' : '#99F6E4' }}>
                              <Text style={{ fontSize: 13 }}>🛍️</Text>
                              <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '700', color: isDark ? '#2DD4BF' : '#0D9488' }}>
                                {(chore as any).shoppingStore ? `Shop at ${(chore as any).shoppingStore}` : 'Shopping List'}
                              </Text>
                              {(chore as any).shoppingBudget != null && (
                                <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: isDark ? '#6EE7B7' : '#065F46' }}>
                                  Budget ${(chore as any).shoppingBudget}
                                </Text>
                              )}
                            </View>
                            {(chore as any).shoppingItems.map((item: string, i: number) => (
                              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6,
                                borderBottomWidth: i < (chore as any).shoppingItems.length - 1 ? 1 : 0,
                                borderBottomColor: isDark ? BRAND.teal + '20' : '#CCFBF1' }}>
                                <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: isDark ? '#2DD4BF' : '#0D9488' }} />
                                <Text style={{ fontSize: TYPO.label, color: colors.textPrimary }}>{item}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                        <Pressable onPress={() => appreciationPing(a.id, active.id, 'Thanks for handling that!')}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <ThumbsUp size={13} color={BRAND.teal} />
                          <Text style={{ fontSize: TYPO.label, color: BRAND.teal }}>Send appreciation ping</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                );
              })}

              {/* PULL pool — unassigned tasks */}
              {questPool.filter(c =>
                !systemBIds.has(c.id) &&
                !parentAssignments.find(a => a.choreId === c.id && a.status !== 'COMPLETED' && a.status !== 'DECLINED')
              ).map(chore => {
                const isDisabled = (chore as any).isDisabled ?? false;
                const isExp = expandedCards[`pool_${chore.id}`] ?? false;
                const hasDetail = chore.description || chore.dueDate || (chore as any).shoppingItems?.length > 0;
                
                // Get creator info
                const creatorId = (chore as any).createdById;
                const creator = creatorId ? members.find(m => m.id === creatorId) : null;
                const creatorName = creator ? creator.name.split(' ')[0] : 'Someone';
                
                // Format relative time
                const createdAt = (chore as any).createdAt;
                let timeAgo = '';
                if (createdAt) {
                  const now = Date.now();
                  const created = new Date(createdAt).getTime();
                  const diffMins = Math.floor((now - created) / 60000);
                  if (diffMins < 60) timeAgo = `${diffMins}m ago`;
                  else if (diffMins < 1440) timeAgo = `${Math.floor(diffMins / 60)}h ago`;
                  else timeAgo = `${Math.floor(diffMins / 1440)}d ago`;
                }
                
                return (
                <View key={chore.id} style={{
                  borderRadius: 14, borderWidth: 1,
                  borderColor: isDisabled ? (isDark ? '#334155' : '#CBD5E1') : (isDark ? colors.border : '#E2E8F0'),
                  backgroundColor: isDisabled ? (isDark ? '#0F172A' : '#F1F5F9') : (isDark ? colors.surface : '#F8FAFC'),
                  opacity: isDisabled ? 0.55 : 1, overflow: 'hidden',
                }}>
                  {/* Header row — always visible */}
                  <Pressable onPress={() => hasDetail && toggleCard(`pool_${chore.id}`)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, paddingBottom: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: colors.textPrimary }}>{chore.title}</Text>
                      {/* Creator and time */}
                      {(creatorName || timeAgo) && (
                        <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 2 }}>
                          {creatorName && `By ${creatorName}`}
                          {creatorName && timeAgo && ' · '}
                          {timeAgo}
                        </Text>
                      )}
                      {(chore as any).shoppingItems?.length > 0 && !isExp ? (
                        <Text style={{ fontSize: TYPO.micro, color: isDark ? '#2DD4BF' : '#0D9488', marginTop: 2 }}>
                          🛍️ {(chore as any).shoppingItems.length} item{(chore as any).shoppingItems.length !== 1 ? 's' : ''}
                          {(chore as any).shoppingStore ? ` · ${(chore as any).shoppingStore}` : ''}
                          {(chore as any).openToGP && ' · 😊 GP Welcome'}
                        </Text>
                      ) : chore.dueDate && !isExp ? (
                        <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 2 }}>
                          Due {chore.dueDate}
                          {(chore as any).openToGP && ' · 😊 GP Welcome'}
                        </Text>
                      ) : (chore as any).openToGP && !isExp ? (
                        <Text style={{ fontSize: TYPO.micro, color: '#8B5CF6', marginTop: 2 }}>
                          😊 GP Welcome
                        </Text>
                      ) : null}
                    </View>
                    {/* Enable / Disable toggle */}
                    <Pressable onPress={() => { const { updateChore } = useChoreStore.getState(); updateChore(chore.id, { isPrivateParent: !isDisabled } as any); }}
                      style={{ padding: 6 }}>
                      <Text style={{ fontSize: 15 }}>{isDisabled ? '🔒' : '✅'}</Text>
                    </Pressable>
                    {hasDetail ? (isExp ? <ChevronUp size={14} color={colors.textTertiary} /> : <ChevronDown size={14} color={colors.textTertiary} />) : null}
                  </Pressable>
                  {/* Action buttons — always visible */}
                  {!isDisabled && (
                    <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 12 }}>
                      <Pressable onPress={() => {
                        if ((chore as any)._isQuestRow) {
                          updateQuest(chore.id, { assignedToId: active.id, status: 'in_progress' } as any);
                          useChoreStore.getState().updateChore(chore.id, { isPool: false });
                        } else {
                          handlePullTask(chore as any);
                        }
                      }}
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                          backgroundColor: BRAND.purple, borderRadius: 10, paddingVertical: 7 }}>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>✋ Take It</Text>
                      </Pressable>
                      <Pressable onPress={() => setDelegateSheet({ choreId: chore.id, choreTitle: chore.title })}
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                          borderWidth: 1.5, borderColor: BRAND.teal + '80',
                          borderRadius: 10, paddingVertical: 7 }}>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: BRAND.teal }}>📤 Delegate</Text>
                      </Pressable>
                    </View>
                  )}
                  {/* Expanded detail */}
                  {isExp && (
                    <View style={{ borderTopWidth: 1, borderTopColor: isDark ? colors.border : '#E2E8F0', padding: 12, gap: 8 }}>
                      {chore.description ? <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{chore.description}</Text> : null}
                      {chore.dueDate ? <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }}>Due {chore.dueDate}</Text> : null}
                      {(chore as any).shoppingItems?.length > 0 && (
                        <View style={{ borderRadius: 10, borderWidth: 1,
                          borderColor: isDark ? BRAND.teal + '40' : '#99F6E4',
                          backgroundColor: isDark ? BRAND.teal + '10' : '#F0FDFA', overflow: 'hidden' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6,
                            borderBottomWidth: 1, borderBottomColor: isDark ? BRAND.teal + '30' : '#99F6E4' }}>
                            <Text style={{ fontSize: 12 }}>🛍️</Text>
                            <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '700', color: isDark ? '#2DD4BF' : '#0D9488' }}>
                              {(chore as any).shoppingStore ?? 'Shopping List'}
                            </Text>
                            {(chore as any).shoppingBudget != null && (
                              <Text style={{ fontSize: TYPO.micro, color: isDark ? '#6EE7B7' : '#065F46' }}>
                                Budget ${(chore as any).shoppingBudget}
                              </Text>
                            )}
                          </View>
                          {(chore as any).shoppingItems.map((item: string, i: number) => (
                            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 5,
                              borderBottomWidth: i < (chore as any).shoppingItems.length - 1 ? 1 : 0,
                              borderBottomColor: isDark ? BRAND.teal + '20' : '#CCFBF1' }}>
                              <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: isDark ? '#2DD4BF' : '#0D9488' }} />
                              <Text style={{ fontSize: TYPO.label, color: colors.textPrimary }}>{item}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                      
                      {/* GP Welcome Toggle - for shopping and other adult tasks */}
                      {(chore as any).shoppingItems?.length > 0 && (
                        <Pressable
                          onPress={() => {
                            const { updateChore } = useChoreStore.getState();
                            updateChore(chore.id, { openToGP: !(chore as any).openToGP } as any);
                          }}
                          style={{
                            flexDirection: 'row', alignItems: 'center', gap: 8,
                            borderRadius: 10, borderWidth: 1.5,
                            borderColor: (chore as any).openToGP ? '#8B5CF6' : (isDark ? '#475569' : '#CBD5E1'),
                            backgroundColor: (chore as any).openToGP ? '#8B5CF620' : 'transparent',
                            padding: 10
                          }}>
                          <View style={{
                            width: 20, height: 20, borderRadius: 10,
                            borderWidth: 2, borderColor: (chore as any).openToGP ? '#8B5CF6' : (isDark ? '#64748B' : '#94A3B8'),
                            backgroundColor: (chore as any).openToGP ? '#8B5CF6' : 'transparent',
                            alignItems: 'center', justifyContent: 'center'
                          }}>
                            {(chore as any).openToGP && <Text style={{ fontSize: 12, color: '#fff' }}>✓</Text>}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>
                              😊 GP Welcome
                            </Text>
                            <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>
                              Grandparents can see and claim this task
                            </Text>
                          </View>
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
                );
              })}

              {/* Calendar events assigned to this parent as driver/helper */}
              {myHelperEvents.length > 0 && (
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.teal, marginBottom: 2 }}>
                    🚗 You're the driver / helper
                  </Text>
                  {myHelperEvents.map(ev => {
                    const catEmoji = ev.category === 'Sports' ? '🏅' : ev.category === 'Medical' ? '🏥' : ev.category === 'Study' ? '📚' : ev.category === 'Ride' ? '🚗' : '📅';
                    const kidName = members.find(m => m.id === ev.memberId)?.name.split(' ')[0] ?? '';
                    return (
                      <View key={ev.id} style={{ borderRadius: 14, borderWidth: 1,
                        borderColor: BRAND.teal + '40', backgroundColor: isDark ? '#0D2020' : '#F0FDFA',
                        padding: 12, gap: 4 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ fontSize: 16 }}>{catEmoji}</Text>
                          <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{ev.title}</Text>
                          <View style={{ backgroundColor: ev.helperStatus === 'confirmed' ? '#22c55e20' : '#F59E0B20',
                            borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                            <Text style={{ fontSize: TYPO.micro, fontWeight: '700',
                              color: ev.helperStatus === 'confirmed' ? '#22c55e' : '#D97706' }}>
                              {ev.helperStatus === 'confirmed' ? '✓ Confirmed' : '⏳ Pending'}
                            </Text>
                          </View>
                        </View>
                        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginLeft: 24 }}>
                          {ev.date}{ev.time ? ` · ${ev.time}` : ''}
                          {kidName ? ` · for ${kidName}` : ''}
                          {ev.pickupLocation ? ` · From: ${ev.pickupLocation}` : ''}
                          {ev.dropLocation ? ` → ${ev.dropLocation}` : ev.location ? ` → ${ev.location}` : ''}
                        </Text>
                        {ev.notes ? (
                          <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginLeft: 24 }} numberOfLines={1}>
                            📝 {ev.notes}
                          </Text>
                        ) : null}
                        {/* Any parent can reassign if helper hasn't confirmed yet */}
                        {ev.helperStatus !== 'confirmed' && (
                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, marginLeft: 24 }}>
                            {ev.helper !== active.name && (
                              <Pressable
                                onPress={() => {
                                  Alert.alert(
                                    'Take Over',
                                    `Reassign this from ${ev.helper} to yourself?`,
                                    [
                                      { text: 'Cancel', style: 'cancel' },
                                      { text: "Yes, I'll do it", onPress: () => {
                                        updateEvent(ev.id, { helper: active.name, helperStatus: 'confirmed' });
                                        const msg = `✅ ${active.name.split(' ')[0]} has taken over "${ev.title}" — you're off the hook.`;
                                        useChatStore.getState().sendMessage('all', active.id, msg);
                                      }},
                                    ]
                                  );
                                }}
                                style={{ backgroundColor: BRAND.teal + '20', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12,
                                  borderWidth: 1, borderColor: BRAND.teal + '40' }}>
                                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.teal }}>🔄 Take Over</Text>
                              </Pressable>
                            )}
                            {ev.helper === active.name && (
                              <Pressable
                                onPress={() => updateEvent(ev.id, { helperStatus: 'confirmed' })}
                                style={{ backgroundColor: '#22c55e20', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12,
                                  borderWidth: 1, borderColor: '#22c55e40' }}>
                                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#22c55e' }}>{"✓ Confirm I'll do it"}</Text>
                              </Pressable>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}

              {questPool.length === 0 && myDirectPending.length === 0 && myAccepted.length === 0 && myHelperEvents.length === 0 && (
                <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, textAlign: 'center', paddingVertical: 12 }}>
                  Backlog is clear 🎉
                </Text>
              )}
            </View>
          )}
        </View>
      </View>

      {/* Pushback bottom sheet modal */}
      <AppBottomSheet
        visible={!!pushbackSheet}
        onClose={() => { setPushbackSheet(null); setPushbackDetail(''); }}
        title={`Respond: ${pushbackSheet?.choreTitle ?? ''}`}
        subtitle="2 bounces locks this task for an offline chat"
        accentColor={BRAND.amber}
        minHeight="45%"
        maxHeight="75%">
        <View style={{ gap: 16 }}>
          <TextInput
            style={{
              borderRadius: 12, borderWidth: 1.5, borderColor: colors.border,
              backgroundColor: isDark ? colors.surface : '#F8FAFC',
              padding: 12, fontSize: TYPO.caption, color: colors.textPrimary,
              minHeight: 60,
            }}
            placeholder="Add details (optional)…"
            placeholderTextColor={colors.textTertiary}
            value={pushbackDetail}
            onChangeText={setPushbackDetail}
            multiline
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {([
              { action: 'SNOOZE',  label: '⏰ Snooze 48h',   color: '#8B5CF6' },
              { action: 'BLOCKER', label: '🚧 Blocker',       color: '#EF4444' },
              { action: 'TRADE',   label: '🔄 Trade tasks',   color: BRAND.amber },
              { action: 'DISCUSS', label: '💬 Discuss later', color: BRAND.teal },
            ] as const).map(({ action, label, color }) => (
              <Pressable key={action} onPress={() => handlePushback(action)}
                style={{
                  flex: 1, minWidth: '45%', borderRadius: 14, paddingVertical: 14,
                  alignItems: 'center', borderWidth: 1.5,
                  borderColor: color + '50', backgroundColor: color + '12',
                }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color }}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </AppBottomSheet>

      {/* Add Task modal */}
      <AddQuestModal
        visible={showAddTask}
        onClose={() => setShowAddTask(false)}
        activeMemberId={active.id}
      />

      {/* 5. Chore Review Deck */}
      <View style={pad}>
        <View style={{
          backgroundColor: isDark ? colors.card : '#fff',
          borderRadius: 20, borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0',
          overflow: 'hidden', marginBottom: 12,
        }}>
          <Pressable
            onPress={() => setChoreReviewExpanded(e => !e)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: BRAND.teal + '20', alignItems: 'center', justifyContent: 'center' }}>
              <ClipboardList size={20} color={BRAND.teal} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>Chore Reviews</Text>
                {(pendingReviews.length + gpPendingCount) > 0 && (
                  <View style={{ backgroundColor: BRAND.teal, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: '#fff' }}>{pendingReviews.length + gpPendingCount}</Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>
                {(pendingReviews.length + gpPendingCount) > 0 ? `${pendingReviews.length + gpPendingCount} pending approval` : 'All caught up ✓'}
              </Text>
            </View>
            {choreReviewExpanded ? <ChevronUp size={18} color={colors.textTertiary} /> : <ChevronDown size={18} color={colors.textTertiary} />}
          </Pressable>
          {choreReviewExpanded && (
            <View style={{ paddingBottom: 8 }}>
              {/* Grandparent-proposed quests awaiting parent safety gate */}
              {(() => {
                const gpPending = chores.filter(c =>
                  c.categoryType === 'grandparent_quest' && c.status === 'pending_parent_approval'
                );
                if (!gpPending.length) return null;
                const sponsors = members.filter(m => m.role === 'senior');
                return (
                  <View style={{ marginHorizontal: 14, marginBottom: 12, gap: 8 }}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
                      textTransform: 'uppercase', letterSpacing: 0.8 }}>
                      👴 Grandparent Quests — Safety Review
                    </Text>
                    {gpPending.map(c => {
                      const sponsor = sponsors.find(s => s.id === c.sponsorUserId);
                      // Before approval nothing is assigned yet — targetChildIds is the
                      // only record of who this was meant for. A 2+ target quest becomes
                      // a bounty (full points each, independent) once approved.
                      const targetKids = (c.targetChildIds?.length ? c.targetChildIds : c.assignedToId ? [c.assignedToId] : [])
                        .map(id => members.find(m => m.id === id))
                        .filter((m): m is FamilyMember => !!m);
                      const pts = c.basePoints;
                      return (
                        <View key={c.id} style={{ borderRadius: 16, overflow: 'hidden',
                          borderWidth: 1.5, borderColor: BRAND.teal + '40',
                          backgroundColor: isDark ? BRAND.teal + '08' : BRAND.teal + '06' }}>
                          <View style={{ backgroundColor: BRAND.teal, paddingHorizontal: 14, paddingVertical: 8,
                            flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ fontSize: 16 }}>{c.questMode === 'virtual' ? '💻' : '🌿'}</Text>
                            <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>
                              {c.questMode === 'virtual' ? 'Virtual' : 'In-Person'} Quest · {pts} pts
                            </Text>
                            <Text style={{ fontSize: TYPO.micro, color: '#fff', opacity: 0.8 }}>
                              from {sponsor?.name.split(' ')[0] ?? 'Grandparent'}
                            </Text>
                          </View>
                          <View style={{ padding: 14, gap: 8 }}>
                            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>{c.title}</Text>
                            {c.description ? (
                              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, lineHeight: 18 }}>{c.description}</Text>
                            ) : null}
                            {targetKids.length > 0 ? (
                              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                                For: {targetKids.map(k => k.name.split(' ')[0]).join(', ')}
                                {targetKids.length > 1 ? ` — ${pts} pts each, independently` : ''}
                              </Text>
                            ) : (
                              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                                No kid picked — goes to the bounty pool
                              </Text>
                            )}
                            {/* 50/40/10 split preview — per kid when there are several targets */}
                            <View style={{ flexDirection: 'row', gap: 6 }}>
                              {[
                                { label: '💸 Spend', val: Math.floor(pts * 0.5), color: BRAND.amber },
                                { label: '🏦 Save',  val: Math.floor(pts * 0.4), color: '#10B981' },
                                { label: '🤲 Give',  val: pts - Math.floor(pts * 0.5) - Math.floor(pts * 0.4), color: BRAND.purple },
                              ].map(j => (
                                <View key={j.label} style={{ flex: 1, alignItems: 'center', borderRadius: 8,
                                  backgroundColor: j.color + '12', paddingVertical: 6,
                                  borderWidth: 1, borderColor: j.color + '20' }}>
                                  <Text style={{ fontSize: TYPO.micro }}>{j.label}</Text>
                                  <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: j.color }}>{j.val}</Text>
                                </View>
                              ))}
                            </View>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              <Pressable
                                onPress={() => declineGrandparentQuestAsParent(c.id, active.id, 'Not suitable')}
                                style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 12,
                                  borderWidth: 1.5, borderColor: isDark ? colors.border : '#E2E8F0' }}>
                                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>Decline</Text>
                              </Pressable>
                              <Pressable
                                onPress={() => approveGrandparentQuestAsParent(c.id, active.id)}
                                style={{ flex: 2, alignItems: 'center', paddingVertical: 11, borderRadius: 12,
                                  backgroundColor: BRAND.teal }}>
                                <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>
                                  ✓ Approve & Publish to Kid
                                </Text>
                              </Pressable>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                );
              })()}

              {/* Grandparent quest a kid turned down — GP sees this too (their own
                  Hub), shown here so the parent isn't relying on chat alone to
                  notice and can reassign or open it up without leaving the Hub. */}
              {(() => {
                const declined = chores.filter(c =>
                  c.categoryType === 'grandparent_quest' && c.status === 'declined'
                );
                if (!declined.length) return null;
                const otherKids = (c: typeof declined[0]) => members.filter(m => m.role === 'kid' && m.id !== c.assignedToId);
                return (
                  <View style={{ marginHorizontal: 14, marginBottom: 12, gap: 8 }}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
                      textTransform: 'uppercase', letterSpacing: 0.8 }}>
                      🙏 Grandparent Quests — Turned Down
                    </Text>
                    {declined.map(c => {
                      const sponsor = members.find(m => m.id === c.sponsorUserId);
                      const kid = members.find(m => m.id === c.assignedToId);
                      const expanded = expandedCards[`gpd_${c.id}`] ?? false;
                      return (
                        <View key={c.id} style={{ borderRadius: 14, padding: 12, gap: 8,
                          backgroundColor: isDark ? '#EF444410' : '#FEF2F2',
                          borderWidth: 1.5, borderColor: '#EF444430' }}>
                          <View>
                            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>{c.title}</Text>
                            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>
                              {kid?.name.split(' ')[0] ?? 'Kid'} can't take this{sponsor ? ` · from ${sponsor.name.split(' ')[0]}` : ''}
                            </Text>
                          </View>
                          {c.rejectionReason ? (
                            <Text style={{ fontSize: TYPO.label, color: colors.textPrimary, fontStyle: 'italic' }}>"{c.rejectionReason}"</Text>
                          ) : null}
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <Pressable onPress={() => toggleCard(`gpd_${c.id}`)}
                              style={{ flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center',
                                borderWidth: 1.5, borderColor: BRAND.amber + '60' }}>
                              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: BRAND.amber }}>Reassign</Text>
                            </Pressable>
                            <Pressable onPress={() => useChoreStore.getState().updateChore(c.id, {
                              status: 'todo', isPool: true, assignedToId: undefined,
                              targetChildIds: [], rejectionReason: undefined,
                            })}
                              style={{ flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: BRAND.teal }}>
                              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Open to Any Kid</Text>
                            </Pressable>
                          </View>
                          {expanded && (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 2 }}>
                              {otherKids(c).map(k => (
                                <Pressable key={k.id} onPress={() => {
                                  useChoreStore.getState().updateChore(c.id, {
                                    status: 'todo', isPool: false, assignedToId: k.id,
                                    targetChildIds: [k.id], rejectionReason: undefined,
                                  });
                                }}
                                  style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
                                    borderWidth: 1.5, borderColor: BRAND.amber + '50', backgroundColor: BRAND.amber + '10' }}>
                                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.amber }}>{k.name.split(' ')[0]}</Text>
                                </Pressable>
                              ))}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                );
              })()}

              <ParentReviewDeck
                parent={active}
                members={members}
                colors={colors}
                isDark={isDark}
              />
            </View>
          )}
        </View>
      </View>

      {/* Delegate sheet — AppBottomSheet */}
      <AppBottomSheet
        visible={!!delegateSheet}
        onClose={() => setDelegateSheet(null)}
        title={`Delegate: ${delegateSheet?.choreTitle ?? ''}`}
        subtitle="Assign to a parent"
        accentColor={BRAND.teal}
        minHeight="40%"
        maxHeight="70%">
        <View style={{ gap: 10 }}>
          {/* Parent emojis side by side */}
          <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
            {members.filter(m => m.role === 'parent').map(m => (
              <Pressable key={m.id} onPress={() => {
                if (delegateSheet) {
                  const isQRow = questPool.find(c => c.id === delegateSheet.choreId && (c as any)._isQuestRow);
                  if (isQRow) {
                    updateQuest(delegateSheet.choreId, { assignedToId: m.id, status: 'todo' });
                  } else {
                    addParentQuest(delegateSheet.choreId, active.id, m.id, 'DIRECT');
                  }
                  setDelegateSheet(null);
                }
              }} style={{
                alignItems: 'center', gap: 6,
                paddingVertical: 12, paddingHorizontal: 16,
                borderRadius: 16, borderWidth: 1.5, borderColor: colors.border,
                backgroundColor: isDark ? colors.surface : '#F8FAFC'
              }}>
                <Text style={{ fontSize: 40 }}>{m.emoji || '👤'}</Text>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary }}>{m.name}</Text>
              </Pressable>
            ))}
          </View>
          
          {/* GP Welcome Toggle */}
          <Pressable
            onPress={() => {
              if (delegateSheet) {
                const currentChore = questPool.find(c => c.id === delegateSheet.choreId);
                const { updateChore } = useChoreStore.getState();
                updateChore(delegateSheet.choreId, { openToGP: !(currentChore as any)?.openToGP } as any);
              }
            }}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
              marginTop: 6,
              borderRadius: 16, borderWidth: 1.5,
              borderColor: (() => {
                const currentChore = delegateSheet ? questPool.find(c => c.id === delegateSheet.choreId) : null;
                return (currentChore as any)?.openToGP ? '#8B5CF6' : (isDark ? '#475569' : '#CBD5E1');
              })(),
              backgroundColor: (() => {
                const currentChore = delegateSheet ? questPool.find(c => c.id === delegateSheet.choreId) : null;
                return (currentChore as any)?.openToGP ? '#8B5CF620' : (isDark ? colors.surface : '#F8FAFC');
              })()
            }}>
            <View style={{
              width: 44, height: 44, borderRadius: 22,
              borderWidth: 2,
              borderColor: (() => {
                const currentChore = delegateSheet ? questPool.find(c => c.id === delegateSheet.choreId) : null;
                return (currentChore as any)?.openToGP ? '#8B5CF6' : (isDark ? '#64748B' : '#94A3B8');
              })(),
              backgroundColor: (() => {
                const currentChore = delegateSheet ? questPool.find(c => c.id === delegateSheet.choreId) : null;
                return (currentChore as any)?.openToGP ? '#8B5CF6' : 'transparent';
              })(),
              alignItems: 'center', justifyContent: 'center'
            }}>
              {(() => {
                const currentChore = delegateSheet ? questPool.find(c => c.id === delegateSheet.choreId) : null;
                return (currentChore as any)?.openToGP ? (
                  <Text style={{ fontSize: 20, color: '#fff' }}>✓</Text>
                ) : (
                  <Text style={{ fontSize: 20 }}>😊</Text>
                );
              })()}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>
                😊 GP Welcome
              </Text>
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                Grandparents can see and claim this task
              </Text>
            </View>
          </Pressable>
        </View>
      </AppBottomSheet>
    </>
  );
}
