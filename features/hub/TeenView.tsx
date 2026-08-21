import { useState, useEffect } from 'react';
import { View, Text, Pressable, Alert, ScrollView } from 'react-native';
import {
  Bell, ShoppingCart, ClipboardList, Car, Fuel, BookOpen, CreditCard, MessageCircle,
} from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import { useEventStore, isEventSensitive, canViewSensitiveEventDetail, eventAssignee } from '@/store/eventStore';
import { useFamilyStore } from '@/store/familyStore';
import { useQuestStore } from '@/store/choreAdapter';
import { useChoreStore } from '@/store/choreStore';
import { useGroceryStore } from '@/store/groceryStore';
import { useKidRequestStore } from '@/store/kidRequestStore';
import { useChatStore } from '@/store/chatStore';
import type { FamilyMember } from '@/store/familyStore';
import type { Quest } from '@/store/questStore';
import { localToday, hoursUntilEvent } from './hubUtils';
import { KidRequestHistoryModal, GroceryModal, SuppliesModal, AskModal, QuestProposalModal } from './KidModals';
import { AskParentSheet } from './kid/AskParentSheet';
import { MyQuestsSection } from './kid/MyQuestsSection';
import { DeclineQuestSheet } from './kid/DeclineQuestSheet';
import { SubmitProofSheet } from './kid/SubmitProofSheet';
import { HubTimelineSection } from './HubTimelineSection';
import { HubGreetingHeader } from './HubGreetingHeader';
import { useUpcomingOpenEvents } from './useUpcomingOpenEvents';
import { PickupRadarStatus } from './hubComponents';
import { TeenTile } from './teen/TeenTile';
import { TeenTileSheet } from './teen/TeenTileSheet';
import { TeenCarDispatchSection } from './teen/TeenCarDispatchSection';
import { TeenGasLogSection } from './teen/TeenGasLogSection';
import { TeenTutorSection } from './teen/TeenTutorSection';
import { TeenCashOutSection } from './teen/TeenCashOutSection';
import { TeenGroceryListSection } from './teen/TeenGroceryListSection';

const pad = { paddingHorizontal: 16, marginBottom: 4 } as const;

type SheetKey = 'rides' | 'gas' | 'tutor' | 'grocery' | 'cashout' | 'history' | null;

export function TeenView({ active, members, colors, isDark, activeTrip }: {
  active: FamilyMember; members: FamilyMember[];
  colors: any; isDark: boolean;
  // Family-wide Pick-up Radar state, synced from tripStore — read-only here.
  activeTrip?: { kidName: string; kidEmoji?: string; driverName: string; driverEmoji?: string; etaMinutes: number; startedAtMs?: number } | null;
}) {
  const { events, updateEvent } = useEventStore();
  const familyIdForRides = (active as any).familyId as string | undefined;
  // eventStore's `events` is a single-day cache tied to whatever date the
  // Calendar tab last selected — a pickup/ride pool scoped to it silently
  // dropped every open ride not dated "today" (QA Round 8). Same fix
  // SeniorView.tsx already uses for its own dispatch cards, applied here
  // for the teen's ride pool specifically — openPickups/myPickups below use
  // this instead of the single-day `events`.
  const { events: upcomingEvents } = useUpcomingOpenEvents(familyIdForRides);
  // Scenarios 2.6/5.4/5.5 — a sensitive/private/Medical event about a
  // sibling is hidden from this teen entirely (never even a busy block).
  // Own events pass through unaffected.
  const visibleEvents = events.filter(e =>
    !isEventSensitive(e) || canViewSensitiveEventDetail(e, 'teen', active.id, active.name));
  const { quests, submitQuest, claimQuest } = useQuestStore();
  const { startGrandparentQuest, declineGrandparentQuest } = useChoreStore();
  const { items: groceryItems, load: loadGrocery } = useGroceryStore();
  const familyId = (active as any).familyId ?? 'family-1';
  useEffect(() => { loadGrocery(familyId); }, [familyId]);
  const { updateMember, awardCoins, deductCoins } = useFamilyStore();
  const { sendRequest, requests, cancelRequest, loaded: kidRequestsLoaded, loadFromStorage: loadKidRequests } = useKidRequestStore();
  const sendMessage = useChatStore(s => s.sendMessage);
  const today = localToday();

  useEffect(() => {
    if (!kidRequestsLoaded) loadKidRequests();
  }, [kidRequestsLoaded]);

  const siblings = members.filter(m => (m.role === 'kid' || m.role === 'teen') && m.id !== active.id);

  // ── My Chores (same normalized model KidView uses) ──────────────────────────
  const myQuests = quests.filter(q => (q.assignedToId === active.id || q.assignedToIds?.includes(active.id)) && !q.awaitingParentApproval);
  const poolQuests = quests.filter(q => q.isPool && q.status === 'todo' && !q.isAdultTask && !q.awaitingParentApproval);
  const todoQuests = myQuests.filter(q => q.status === 'todo' && !q.isPool);
  const inProgressQuests = myQuests.filter(q => ['claimed', 'in_progress'].includes(q.status));
  const reviewQuests = myQuests.filter(q => q.status === 'pending_approval');
  const declinedQuests = myQuests.filter(q => q.status === 'declined');
  const cancelledQuestsToday = myQuests.filter(q => q.status === 'cancelled' && (q.cancelledAt ?? '').startsWith(today));
  const pendingCoins = reviewQuests.reduce((sum, q) => sum + (q.coins ?? 0) + (q.bonusCoins ?? 0), 0);
  const [declineQuest, setDeclineQuest] = useState<{ id: string; title: string } | null>(null);
  const [submitProofQuest, setSubmitProofQuest] = useState<Quest | null>(null);

  const handleSubmitTap = (q: Quest) => {
    if (q.photoRequired) setSubmitProofQuest(q);
    else submitQuest(q.id, undefined, active.id);
  };

  // ── Car / dispatch — opt-in, only relevant once the teen says they drive ────
  const hasCar = active.hasCar ?? false;
  const rideEarnings = active.rideEarningsPerRun ?? 50;
  const toggleCar = () => updateMember(active.id, { hasCar: !hasCar });

  // dropPickup (below) goes through updateEvent's normal decline path,
  // which clears helper/helperStatus back to unset (via autoOpenOnDecline)
  // rather than leaving a stale 'rejected' status sitting there — so a
  // dropped ride is genuinely reclaimable again, not dead-ended against
  // claimHelperSlot's conditional (NULL-status-only) write. The 'rejected'
  // exclusion here is just a defensive guard against the brief instant
  // between the decline write landing and the reopen clearing it.
  // A parent naming this teen directly as driver (helper=teen's name,
  // helperStatus='pending') is a DIRECT assignment, not something the teen
  // claimed from the open pool — previously invisible everywhere: not in
  // openPickups (not isOpenToTeens), not in myPickups (not yet confirmed),
  // and HubTimelineSection only surfaces today-dated events, so a future
  // assignment had literally no UI anywhere telling the teen it existed
  // (QA Round 8, "no teen surface for you've been asked to drive").
  // QA sweep (UI pass) Critical Finding — these 3 filters were
  // helper/helperStatus-only, so a driverName-based kid ride request opened
  // to teens (isOpenToTeens:true) never showed up in ANY teen pool at all —
  // isOpenToTeens was correctly set, but nothing here ever looked at
  // driverName/driverStatus, so no teen had any visible way to see or claim
  // it. eventAssignee() covers both field pairs, same fix already applied
  // to SeniorView/KidView/EventDetailSheet.
  const myPendingAssignments = upcomingEvents.filter(e => {
    const a = eventAssignee(e);
    return a.name === active.name && a.status === 'pending' && !e.approvalPending && e.date >= today;
  });
  const openPickups = upcomingEvents.filter(e => {
    const a = eventAssignee(e);
    return e.isOpenToTeens && a.status !== 'confirmed' && a.status !== 'rejected' && e.date >= today;
  });
  // Exact name match — the previous fuzzy includes()-based match ("Sam"
  // vs. "Sam Wilson") could show a DIFFERENT member's confirmed ride as
  // this teen's own the moment two names happened to share a first name.
  const myPickups = upcomingEvents.filter(e => {
    const a = eventAssignee(e);
    return a.name === active.name && a.status === 'confirmed' && e.date >= today;
  });
  const [passedPickups, setPassedPickups] = useState<string[]>([]);
  const urgentPickups = openPickups.filter(e => !passedPickups.includes(e.id) &&
    hoursUntilEvent(e.date, e.time) >= 0 && hoursUntilEvent(e.date, e.time) < 1);
  // A direct assignment awaiting confirmation is at least as urgent as an
  // open pickup up for grabs — it's already on this teen specifically —
  // so it counts toward the same "Rides" tile badge.
  const openPickupCount = openPickups.filter(e => !passedPickups.includes(e.id)).length + myPendingAssignments.length;

  const claimPickup = (evId: string) => {
    const ev = upcomingEvents.find(e => e.id === evId);
    const coins = ev?.rideCoins ?? rideEarnings;
    // Race-safe: any teen who has this pool open could tap "I'll take it"
    // on the same isOpenToTeens pickup within the same round-trip window —
    // claimHelperSlot does a conditional DB write (only succeeds if
    // helper_status is still unset) instead of an unconditional update, so
    // the loser's optimistic local claim gets rolled back to the real
    // winner instead of both teens' devices showing themselves as confirmed.
    // Coins are awarded only via onWon — a teen who loses the race must not
    // keep coins for a ride they were never actually confirmed on.
    // Same fix as SeniorView's handleClaimRide — was hardcoded 'helper',
    // so claiming a driverName-based (rideRequired) pickup wrote to the
    // wrong column pair and never actually claimed the slot being shown.
    const role: 'helper' | 'driver' = ev?.rideRequired && ev.category !== 'Ride' ? 'driver' : 'helper';
    useEventStore.getState().claimHelperSlot(evId, role, active.name, undefined, () => {
      if (coins > 0) awardCoins(active.id, coins, 'mainCoins');
    });
  };

  // A claimed run had no way to back out once confirmed — same rejected-state
  // flow the parent-facing sheet uses, so Parent Hub's own urgency banner
  // (<4hr window) picks it up automatically once it's close enough to matter.
  //
  // Bug fixed here (QA Round 8, finding "coins kept on abandoned ride"):
  // claimPickup pays coins the moment a claim WINS the race, but dropping
  // afterward never reversed that payout — a teen could claim, get paid,
  // then immediately drop and keep the coins for a ride they never drove.
  //
  // Previously this also directly cleared helper/helperStatus to undefined
  // instead of setting helperStatus:'rejected' through the normal
  // updateEvent path — a hand-rolled workaround for autoOpenOnDecline
  // leaving the status stuck at 'rejected' (dead-ending claimHelperSlot's
  // CAS, which only matches a NULL status column) that made a teen's
  // decline behave differently from every other decline site (GP, parent
  // reassignment via hubComponents.tsx) — those never got the same
  // clean-reopen treatment, never triggered autoOpenOnDecline's GP/Teen
  // pool-open, and weren't recognized as a decline by anything checking
  // helperStatus==='rejected' (QA sweep H3). Now that updateEvent's own
  // autoOpenOnDecline clears the stale name+status itself, this can just
  // go through the canonical decline path like everyone else.
  const dropPickup = (evId: string) => {
    const ev = upcomingEvents.find(e => e.id === evId);
    const a = ev ? eventAssignee(ev) : undefined;
    const paidCoins = ev?.rideCoins ?? rideEarnings;
    if (a?.name === active.name && paidCoins > 0) deductCoins(active.id, paidCoins, 'mainCoins');
    const isDriverPair = ev?.driverName === active.name || (ev?.rideRequired && ev.category !== 'Ride');
    updateEvent(evId, isDriverPair
      ? { driverStatus: 'rejected', declinedBy: active.name }
      : { helperStatus: 'rejected', declinedBy: active.name });
  };

  // Confirming a direct assignment settles it — no coins change hands here
  // (a pending assignment was never paid; payout for a directly-assigned
  // ride, unlike a claimed one, isn't tracked anywhere yet — same gap
  // rideCoins already has on the claim path, left as-is rather than
  // invented here without a clear source of truth for the amount).
  const confirmAssignment = (evId: string) => {
    const ev = upcomingEvents.find(e => e.id === evId);
    const isDriverPair = ev?.driverName === active.name || (ev?.rideRequired && ev.category !== 'Ride');
    updateEvent(evId, isDriverPair ? { driverStatus: 'confirmed' } : { helperStatus: 'confirmed' });
  };

  // ── Tutoring / sibling help ───────────────────────────────────────────────────
  const myPendingOffers = requests.filter(r =>
    r.fromMemberId === active.id && r.status === 'pending' && (r.type === 'tutor' || r.type === 'cheer')
  );
  const sendTutorOffer = (kid: FamilyMember, subject: string, note: string) => {
    const detail = `${active.name.split(' ')[0]} can help ${kid.name.split(' ')[0]} with ${subject}${note ? ` — ${note}` : ''}`;
    sendRequest({ type: 'tutor', fromMemberId: active.id, detail, urgency: 'normal' });
    sendMessage('all', active.id, `🎒 ${detail}`);
  };

  const reportVehicleIssue = (issue: string) => {
    const detail = `🚗 Vehicle issue reported by ${active.name.split(' ')[0]}: ${issue}`;
    sendRequest({ type: 'emergency', fromMemberId: active.id, detail, urgency: 'soon' });
    sendMessage('all', active.id, detail);
  };

  const requestCashOut = (amount: string, method: string) => {
    const coins = active.mainCoins ?? active.coins ?? 0;
    const detail = `💵 Cash-out request: $${amount} via ${method} (balance: ${coins} coins)`;
    sendRequest({ type: 'delegation', fromMemberId: active.id, detail, urgency: 'normal' });
    sendMessage('all', active.id, `${active.name.split(' ')[0]} requested cash-out: $${amount} via ${method}`);
    Alert.alert('Cash-Out Sent!', 'Your parent has been notified and will review the request.');
  };

  // ── Tile sheets ───────────────────────────────────────────────────────────────
  const [openSheet, setOpenSheet] = useState<SheetKey>(null);
  const [askParentSheet, setAskParentSheet] = useState(false);
  const [askModal, setAskModal] = useState<null | 'permission' | 'question' | 'medication'>(null);
  // Scenario 1.5 already gives a Teen full self-creation rights via the
  // Quests tab's own +Quest button — this "Propose a Quest" entry (shared
  // AskParentSheet, mainly built for Kids) still works for a Teen too
  // (asking a parent to set up something the Teen doesn't want full
  // ownership of), so it's wired the same way rather than hidden.
  const [questProposalModal, setQuestProposalModal] = useState(false);
  const [groceryModal, setGroceryModal] = useState(false);
  const [suppliesModal, setSuppliesModal] = useState(false);

  return (
    <ScrollView showsVerticalScrollIndicator={false}>

      {urgentPickups.length > 0 && (
        <View style={pad}>
          <Pressable onPress={() => setOpenSheet('rides')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
              backgroundColor: isDark ? colors.danger + '15' : '#FEF2F2',
              borderWidth: 1.5, borderColor: colors.danger + '40',
              borderRadius: 16, padding: 12, marginBottom: 12 }}>
            <Bell size={18} color={colors.danger} />
            <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '800', color: colors.danger }}>
              {urgentPickups.length} pickup{urgentPickups.length > 1 ? 's' : ''} within the hour — needs a driver
            </Text>
          </Pressable>
        </View>
      )}

      <HubGreetingHeader
        firstName={active.name.split(' ')[0]}
        summary={
          todoQuests.length + reviewQuests.length + declinedQuests.length > 0
            ? `${todoQuests.length + reviewQuests.length + declinedQuests.length} chore${todoQuests.length + reviewQuests.length + declinedQuests.length !== 1 ? 's' : ''} to handle today${pendingCoins > 0 ? ` · +${pendingCoins} pending` : ''}`
            : pendingCoins > 0 ? `All caught up ✓ · +${pendingCoins} pending` : 'All caught up ✓'
        }
        balance={active.mainCoins ?? active.coins ?? 0}
        colors={colors} isDark={isDark}
      />

      {activeTrip && <PickupRadarStatus colors={colors} isDark={isDark} activeTrip={activeTrip} />}

      <HubTimelineSection active={active} members={members} events={visibleEvents} updateEvent={updateEvent} colors={colors} isDark={isDark} />

      <MyQuestsSection
        title="My Chores"
        todoQuests={todoQuests} inProgressQuests={inProgressQuests} reviewQuests={reviewQuests}
        poolQuests={poolQuests} cancelledToday={cancelledQuestsToday} declinedQuests={declinedQuests} allQuests={quests}
        active={active} members={members} colors={colors} isDark={isDark}
        onClaim={(id) => claimQuest(id, active.id, (reason) => {
          Alert.alert(
            reason === 'deleted' ? 'No longer available' : 'Someone beat you to it!',
            reason === 'deleted'
              ? 'This quest was just removed by a parent.'
              : 'Someone else already claimed this quest — check the pool for others.',
          );
        })}
        onStart={(id) => submitQuest(id, undefined, active.id)}
        onSubmit={handleSubmitTap}
        onAcceptGpQuest={(id) => startGrandparentQuest(id, active.id)}
        onDeclineGpQuest={(q) => setDeclineQuest({ id: q.id, title: q.title })}
      />

      {/* ── Tile grid — everything else opens in a bottom sheet ── */}
      <View style={{ paddingHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <TeenTile
          label="Ask Parent" sublabel="Permission, question, meds"
          Icon={MessageCircle} accent={BRAND.purple}
          onPress={() => setAskParentSheet(true)} colors={colors} isDark={isDark}
        />
        <TeenTile
          label="Rides" sublabel={hasCar ? 'Sibling pickups' : 'Opt in with a car'}
          Icon={Car} accent={BRAND.amber}
          // A direct "you were asked to drive" assignment counts toward
          // the badge even with the car toggle off — that assignment was
          // already made regardless, same reasoning as
          // TeenCarDispatchSection no longer hiding it behind hasCar.
          badge={(hasCar ? openPickupCount : myPendingAssignments.length) || undefined}
          onPress={() => setOpenSheet('rides')} colors={colors} isDark={isDark}
        />
        <TeenTile
          label="Tutor a Sibling" sublabel="Offer homework help"
          Icon={BookOpen} accent={BRAND.purple} badge={myPendingOffers.length}
          onPress={() => setOpenSheet('tutor')} colors={colors} isDark={isDark}
        />
        <TeenTile
          label="Cash Out" sublabel="Request a payout"
          Icon={CreditCard} accent={BRAND.amber}
          onPress={() => setOpenSheet('cashout')} colors={colors} isDark={isDark}
        />
        {hasCar && (
          <TeenTile
            label="Gas & Vehicle" sublabel="Log fill-ups, report issues"
            Icon={Fuel} accent={colors.success}
            onPress={() => setOpenSheet('gas')} colors={colors} isDark={isDark}
          />
        )}
        <TeenTile
          label="Grocery List" sublabel="Family shopping list"
          Icon={ShoppingCart} accent={BRAND.teal} badge={groceryItems.length}
          onPress={() => setOpenSheet('grocery')} colors={colors} isDark={isDark}
        />
        <TeenTile
          label="My Requests" sublabel="History & status"
          Icon={ClipboardList} accent={BRAND.purple}
          onPress={() => setOpenSheet('history')} colors={colors} isDark={isDark}
        />
      </View>

      {/* ── Sheets — static 75% height, no content-driven resize ── */}
      <TeenTileSheet visible={openSheet === 'rides'} onClose={() => setOpenSheet(null)}
        title="Rides" accentColor={BRAND.amber} colors={colors} isDark={isDark}>
        <TeenCarDispatchSection
          hasCar={hasCar} onToggleCar={toggleCar}
          openPickups={openPickups} myPickups={myPickups} myPendingAssignments={myPendingAssignments} passedPickups={passedPickups}
          onPass={(id) => setPassedPickups(p => [...p, id])} onClaim={claimPickup} onDrop={dropPickup} onConfirmAssignment={confirmAssignment}
          rideEarnings={rideEarnings} members={members} colors={colors} isDark={isDark}
        />
      </TeenTileSheet>

      <TeenTileSheet visible={openSheet === 'gas'} onClose={() => setOpenSheet(null)}
        title="Gas & Vehicle Log" accentColor={colors.success} colors={colors} isDark={isDark}>
        <TeenGasLogSection activeId={active.id} today={today} onReportIssue={reportVehicleIssue} colors={colors} isDark={isDark} />
      </TeenTileSheet>

      <TeenTileSheet visible={openSheet === 'tutor'} onClose={() => setOpenSheet(null)}
        title="Tutor a Sibling" accentColor={BRAND.purple} colors={colors} isDark={isDark}>
        <TeenTutorSection
          siblings={siblings} pendingOffers={myPendingOffers}
          onSend={sendTutorOffer} onCancel={cancelRequest}
          colors={colors} isDark={isDark}
        />
      </TeenTileSheet>

      <TeenTileSheet visible={openSheet === 'grocery'} onClose={() => setOpenSheet(null)}
        title="Family Grocery List" accentColor={BRAND.teal} colors={colors} isDark={isDark}>
        <TeenGroceryListSection items={groceryItems} colors={colors} isDark={isDark} />
      </TeenTileSheet>

      <TeenTileSheet visible={openSheet === 'cashout'} onClose={() => setOpenSheet(null)}
        title="Cash Out Earnings" accentColor={BRAND.amber} colors={colors} isDark={isDark}>
        <TeenCashOutSection balance={active.mainCoins ?? active.coins ?? 0} onRequest={requestCashOut} colors={colors} isDark={isDark} />
      </TeenTileSheet>

      <AskParentSheet
        visible={askParentSheet} onClose={() => setAskParentSheet(false)} colors={colors} isDark={isDark}
        onPick={(choice) => {
          setAskParentSheet(false);
          setTimeout(() => {
            if (choice === 'grocery') setGroceryModal(true);
            else if (choice === 'supplies') setSuppliesModal(true);
            else if (choice === 'quest') setQuestProposalModal(true);
            else setAskModal(choice);
          }, 300);
        }}
      />
      <QuestProposalModal visible={questProposalModal} onClose={() => setQuestProposalModal(false)} active={active} />

      <DeclineQuestSheet
        target={declineQuest} active={active} members={members} colors={colors} isDark={isDark}
        onClose={() => setDeclineQuest(null)}
        declineGrandparentQuest={declineGrandparentQuest}
      />
      <SubmitProofSheet
        quest={submitProofQuest} colors={colors} isDark={isDark}
        onClose={() => setSubmitProofQuest(null)}
        submitQuest={submitQuest}
      />
      <GroceryModal  visible={groceryModal}  onClose={() => setGroceryModal(false)}  active={active} />
      <SuppliesModal visible={suppliesModal} onClose={() => setSuppliesModal(false)} active={active} />
      {askModal && <AskModal visible={!!askModal} onClose={() => setAskModal(null)} type={askModal} active={active} />}
      <KidRequestHistoryModal visible={openSheet === 'history'} onClose={() => setOpenSheet(null)} active={active} />

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}
