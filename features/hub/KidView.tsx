import { useState, useEffect } from 'react';
import { View, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuestStore } from '@/store/choreAdapter';
import { useChoreStore } from '@/store/choreStore';
import type { Quest } from '@/store/questStore';
import { useEventStore, isEventSensitive, canViewSensitiveEventDetail } from '@/store/eventStore';
import { useRewardStore } from '@/store/rewardStore';
import type { FamilyMember } from '@/store/familyStore';
import { useKidRequestStore } from '@/store/kidRequestStore';
import { withinLast24h } from '@/lib/dates';
import { AddEventModal } from '@/features/calendar/EventFormModal';
import { useChatStore } from '@/store/chatStore';
import { localToday, fmtTime, hoursUntilEvent } from './hubUtils';

// Encoding helpers and modals live in KidModals.tsx
export { GROCERY_PREFIX, SUPPLIES_PREFIX, encodeGroceryRequest, decodeGroceryRequest } from './KidModals';
import { SUPPLIES_PREFIX, encodeRideLate } from './KidModals';
import { GroceryModal, SuppliesModal, AskModal, KidRequestHistoryModal, QuestProposalModal } from './KidModals';
import { HubTimelineSection } from './HubTimelineSection';
import { PickupRadarStatus } from './hubComponents';

import { KidHeroCard } from './kid/KidHeroCard';
import { KidRideBanner } from './kid/KidRideBanner';
import { KidUrgentAlerts } from './kid/KidUrgentAlerts';
import { KidCheckinRow } from './kid/KidCheckinRow';
import { KidActionRow } from './kid/KidActionRow';
import { MyQuestsSection } from './kid/MyQuestsSection';
import { KidMoreRow } from './kid/KidMoreRow';
import { KidLeaderboard } from './kid/KidLeaderboard';
import { CheerSquadSection } from './kid/CheerSquadSection';
import { PiggyBankSheet } from './kid/PiggyBankSheet';
import { SubmitProofSheet } from './kid/SubmitProofSheet';
import { DeclineQuestSheet } from './kid/DeclineQuestSheet';
import { AskParentSheet } from './kid/AskParentSheet';

// ─── Ride countdown hook ──────────────────────────────────────────────────────
function useCountdown(date?: string, time?: string) {
  const [mins, setMins] = useState<number | null>(null);
  useEffect(() => {
    if (!date || !time) { setMins(null); return; }
    const tick = () => {
      const [h, m] = time.split(':').map(Number);
      const target = new Date();
      target.setFullYear(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
      target.setHours(h, m, 0, 0);
      setMins(Math.round((target.getTime() - Date.now()) / 60000));
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [date, time]);
  return mins;
}

// ─── Main KidView ──────────────────────────────────────────────────────────────
export function KidView({ active, members, colors, isDark, onHelpRequest, activeTrip }: {
  active: FamilyMember; members: FamilyMember[];
  colors: any; isDark: boolean;
  onHelpRequest: () => void;
  // Family-wide Pick-up Radar state, synced from tripStore — shown here
  // read-only (driver controls the ETA/Pickup Done) so a kid can see the
  // same live trip progress the driver's own Hub shows.
  activeTrip?: { kidName: string; kidEmoji?: string; driverName: string; driverEmoji?: string; etaMinutes: number; startedAtMs?: number } | null;
}) {
  const { quests, submitQuest, claimQuest, cheerQuest } = useQuestStore();
  const { startGrandparentQuest, declineGrandparentQuest } = useChoreStore();
  const { events, updateEvent }                           = useEventStore();
  const { rewards, redeemReward, getEligibleRewards }    = useRewardStore();
  const { sendRequest, requests, loaded: kidRequestsLoaded, loadFromStorage: loadKidRequests } = useKidRequestStore();
  const { sendMessage }                                   = useChatStore();

  const [groceryModal,    setGroceryModal]    = useState(false);
  const [suppliesModal,   setSuppliesModal]   = useState(false);
  const [askModal,        setAskModal]        = useState<null | 'permission' | 'question' | 'medication'>(null);
  const [historyModal,    setHistoryModal]    = useState(false);
  const [piggyBankModal,  setPiggyBankModal]  = useState(false);
  const [askParentSheet,  setAskParentSheet]  = useState(false);
  const [addEventModal,   setAddEventModal]   = useState(false);
  const [questProposalModal, setQuestProposalModal] = useState(false);
  const [lateNudgeSent,   setLateNudgeSent]   = useState<Record<string, boolean>>({});
  const [dismissedReplies, setDismissedReplies] = useState<Set<string>>(new Set());
  const [dismissedActions,  setDismissedActions]  = useState<Set<string>>(new Set());
  const [dismissedRideIds, setDismissedRideIds] = useState<Set<string>>(new Set());
  const [declineQuest,    setDeclineQuest]    = useState<{ id: string; title: string } | null>(null);
  // Submitting a photo-required quest — "Take Photo to Get Paid" must not pay
  // out on a bare tap; the photo IS the proof, so collect it before submitting.
  const [submitProofQuest, setSubmitProofQuest] = useState<Quest | null>(null);

  // KidView can render without ParentView ever having mounted this session
  // (e.g. app opened straight into Kid Mode), so it must hydrate the kid
  // request store itself instead of relying on ParentView to have done it.
  useEffect(() => {
    if (!kidRequestsLoaded) loadKidRequests();
  }, [kidRequestsLoaded]);

  // Persist dismissed state
  useEffect(() => {
    AsyncStorage.getItem(`dismissed_replies_${active.id}`).then(val => {
      if (val) setDismissedReplies(new Set(JSON.parse(val)));
    });
    AsyncStorage.getItem(`dismissed_actions_${active.id}`).then(val => {
      if (val) setDismissedActions(new Set(JSON.parse(val)));
    });
    AsyncStorage.getItem(`dismissed_rides_${active.id}`).then(val => {
      if (val) setDismissedRideIds(new Set(JSON.parse(val)));
    });
  }, [active.id]);

  useEffect(() => {
    AsyncStorage.setItem(`dismissed_replies_${active.id}`, JSON.stringify([...dismissedReplies]));
  }, [dismissedReplies, active.id]);

  useEffect(() => {
    AsyncStorage.setItem(`dismissed_actions_${active.id}`, JSON.stringify([...dismissedActions]));
  }, [dismissedActions, active.id]);

  useEffect(() => {
    AsyncStorage.setItem(`dismissed_rides_${active.id}`, JSON.stringify([...dismissedRideIds]));
  }, [dismissedRideIds, active.id]);

  const today       = localToday();
  // Scenarios 2.6/5.4/5.5 — a sensitive/private/Medical event about a
  // sibling is hidden from this kid entirely (never even a busy block —
  // 5.4's "no scheduling dependency by default" for siblings). Own events
  // (this kid IS the subject) always pass through unaffected.
  const visibleEvents = events.filter(e =>
    !isEventSensitive(e) || canViewSensitiveEventDetail(e, 'kid', active.id));
  const myEvents    = visibleEvents.filter(e => (e.memberId === active.id || !e.memberId) && e.category !== 'Work');
  const todayEvents = myEvents.filter(e => e.date === today).sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));

  // Confirmed ride today
  const confirmedRide = todayEvents.find(e => e.helper && e.helperStatus === 'confirmed');
  const rideCountdown = useCountdown(confirmedRide?.date, confirmedRide?.time);

  // Next upcoming event (any, for countdown on hero if no ride)
  const nextEvent = todayEvents.find(e => hoursUntilEvent(e.date, e.time) > 0 && e.helperStatus !== 'rejected');
  const nextCountdown = useCountdown(nextEvent?.date, nextEvent?.time);

  const myDeclinedRides = todayEvents.filter(e =>
    e.helperStatus === 'rejected' && !e.approvalPending && hoursUntilEvent(e.date, e.time) >= -1
  );
  const myPendingRides  = events.filter(e =>
    e.memberId === active.id && e.approvalPending && e.date >= today
  );

  const myRequests = requests.filter(r => r.fromMemberId === active.id && r.status !== 'cancelled');

  // A grandparent_quest still awaiting the parent's safety review collapses
  // to status 'todo' just like a normal ready quest (see choreAdapter's
  // choreStatusToQuestStatus) — exclude it everywhere here via
  // awaitingParentApproval so it never appears as visible/claimable before
  // a parent has actually signed off.
  const myQuests       = quests.filter(q => (q.assignedToId === active.id || q.assignedToIds?.includes(active.id)) && !q.awaitingParentApproval);
  const poolQuests     = quests.filter(q => q.isPool && q.status === 'todo' && !q.isAdultTask && !q.awaitingParentApproval);
  const todoQuests       = myQuests.filter(q => q.status === 'todo' && !q.isPool);
  const inProgressQuests = myQuests.filter(q => ['claimed', 'in_progress'].includes(q.status));
  const reviewQuests   = myQuests.filter(q => q.status === 'pending_approval');
  const declinedQuests = myQuests.filter(q => q.status === 'declined');
  const approvedQuests = myQuests.filter(q => ['approved', 'done'].includes(q.status));
  const cancelledQuests = myQuests.filter(q => q.status === 'cancelled');
  const cancelledQuestsToday = cancelledQuests.filter(q => (q.cancelledAt ?? '').startsWith(today));
  const doneToday      = myQuests.filter(q => ['approved','done'].includes(q.status)).length;
  const questGoal      = Math.max(myQuests.filter(q => (q.status as string) !== 'pending_parent_approval').length, 3);
  const questPct       = Math.min(doneToday / questGoal, 1);

  const siblingKids = members.filter(m => m.role === 'kid' && m.id !== active.id);
  const allKids     = [active, ...siblingKids].sort((a, b) => ((b as any).mainCoins ?? (b as any).coins ?? 0) - ((a as any).mainCoins ?? (a as any).coins ?? 0));

  // Cheer Squad — today's sibling wins that still need a cheer from me.
  // Once cheered (or once the day passes) it drops off — this is a to-do list
  // of pending cheers, not a history feed.
  const siblingCheerable = quests.filter(q => {
    if (!['approved', 'done'].includes(q.status) || q.isAdultTask) return false;
    if (!q.assignedToId || !siblingKids.some(s => s.id === q.assignedToId)) return false;
    if ((q.cheers ?? []).some(c => c.memberId === active.id)) return false;
    const when = q.approvedAt ?? q.completedAt;
    return withinLast24h(when);
  }).slice(0, 5);

  // Cheers landed on my own completed quests — surfaced as a celebration banner
  const cheersForMe = myQuests.flatMap(q => (q.cheers ?? []).map(c => ({ quest: q, cheer: c })));
  const eligibleRewards   = getEligibleRewards(active.id);
  const mainCoins  = (active as any).mainCoins ?? (active as any).coins ?? 0;
  const gpCoins    = (active as any).gpCoins ?? 0;
  const streak     = (active as any).streak ?? 0;
  const xp         = (active as any).xp ?? 0;
  const level      = (active as any).level ?? 1;
  const xpForNext  = level * 100;
  const xpPct      = Math.min((xp % xpForNext) / xpForNext, 1);
  const almostAffordable = rewards.filter(r => !eligibleRewards.find(e => e.id === r.id) && r.cost > 0 && r.cost - mainCoins <= 30 && r.cost - mainCoins > 0);

  const sendCheckin = (type: 'home' | 'ready' | 'late') => {
    const messages: Record<string, { detail: string; chatMsg: string; emoji: string }> = {
      home:  { detail: "I'm home! 🏠", chatMsg: `${active.name.split(' ')[0]} is home! 🏠`, emoji: "🏠 I'm home!" },
      ready: { detail: `I'm ready for pickup! 🎒${confirmedRide ? ` (${confirmedRide.title})` : ''}`,
               chatMsg: `${active.name.split(' ')[0]} is ready for pickup! 🎒${confirmedRide ? ` (${confirmedRide.title})` : ''}`, emoji: "🎒 I'm ready!" },
      late:  { detail: `Running a bit late 🏃${nextEvent ? ` for ${nextEvent.title}` : ''}`,
               chatMsg: `${active.name.split(' ')[0]} is running late 🏃${nextEvent ? ` for ${nextEvent.title}` : ''}`, emoji: '🏃 Running late!' },
    };
    const m = messages[type];
    sendRequest({ type: 'checkin', fromMemberId: active.id, detail: m.detail, urgency: type === 'late' ? 'soon' : 'normal' });
    sendMessage('all', active.id, m.chatMsg);
    Alert.alert(m.emoji, 'Family has been notified!');
  };

  const sendDriverLate = (ev: typeof todayEvents[0]) => {
    if (lateNudgeSent[ev.id]) {
      Alert.alert('Already sent', 'You already notified your parent about this.');
      return;
    }
    sendRequest({
      type: 'emergency', fromMemberId: active.id, urgency: 'urgent',
      // Structured so the parent's Action Needed card can show the ride itself,
      // not just a sentence — see decodeRideLate in KidModals.
      detail: encodeRideLate({
        eventId:      ev.id,
        title:        ev.title,
        time:         ev.time,
        driver:       ev.helper,
        location:     ev.pickupLocation ?? ev.location,
        dropLocation: ev.dropLocation,
        sentAt:       new Date().toISOString(),
      }),
      location:      ev.pickupLocation ?? ev.location,
      scheduledTime: ev.time ? fmtTime(ev.time) : undefined,
    });
    sendMessage('all', active.id, `⚠️ ${active.name.split(' ')[0]}: My driver hasn't arrived yet for "${ev.title}"! Can someone check?`);
    setLateNudgeSent(p => ({ ...p, [ev.id]: true }));
    Alert.alert('⚠️ Alert sent!', 'Your parent has been notified that your driver is late.');
  };

  // Either side (rider or driver) can confirm a pickup actually happened —
  // "helperStatus: confirmed" only ever meant the driver agreed to the run.
  // Whoever taps first closes the loop for everyone and clears the banner.
  const confirmPickup = (ev: typeof todayEvents[0]) => {
    if (ev.pickupConfirmedAt) return;
    updateEvent(ev.id, { pickupConfirmedAt: new Date().toISOString(), pickupConfirmedBy: active.id });
    sendMessage('all', active.id, `✅ ${active.name.split(' ')[0]} confirmed pickup for "${ev.title}" — all good!`);
  };

  // A quest without photoRequired submits immediately; one that requires it
  // opens the capture sheet instead — "Take Photo to Get Paid" has to mean it.
  const handleSubmitTap = (q: Quest) => {
    if (q.photoRequired) setSubmitProofQuest(q);
    else submitQuest(q.id, undefined, active.id);
  };

  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const recentReplies = myRequests.filter(r =>
    ['approved', 'declined'].includes(r.status) &&
    ['permission', 'question', 'medication', 'checkin', 'tutor', 'cheer'].includes(r.type) &&
    r.respondedAt && !dismissedReplies.has(r.id) &&
    new Date(r.respondedAt).getTime() > cutoff
  );
  const dismissedAll = new Set([...dismissedReplies, ...dismissedActions]);
  const dismissAlert = (id: string) => {
    if (recentReplies.some(r => r.id === id)) setDismissedReplies(prev => new Set([...prev, id]));
    else setDismissedActions(prev => new Set([...prev, id]));
  };

  return (
    <>
      <KidHeroCard
        active={active} colors={colors} isDark={isDark}
        mainCoins={mainCoins} gpCoins={gpCoins} streak={streak} level={level}
        xp={xp} xpForNext={xpForNext} xpPct={xpPct}
        doneToday={doneToday} questGoal={questGoal} questPct={questPct}
        confirmedRide={confirmedRide}
        nextEvent={nextEvent} nextCountdown={nextCountdown}
      />

      <KidUrgentAlerts
        confirmedRide={confirmedRide} rideCountdown={rideCountdown}
        lateNudgeSent={lateNudgeSent} onSendDriverLate={sendDriverLate}
        declinedRides={myDeclinedRides} pendingRides={myPendingRides}
        declinedQuests={declinedQuests} approvedQuests={approvedQuests}
        cheersForMe={cheersForMe} recentReplies={recentReplies}
        members={members} colors={colors} isDark={isDark}
        dismissedIds={dismissedAll} onDismiss={dismissAlert}
      />

      {confirmedRide && rideCountdown !== null && rideCountdown > -30 && !dismissedRideIds.has(confirmedRide.id) && (
        <KidRideBanner
          ev={confirmedRide} rideCountdown={rideCountdown} colors={colors} isDark={isDark}
          active={active}
          onConfirmPickup={confirmPickup}
          onDismiss={(id) => setDismissedRideIds(prev => new Set([...prev, id]))}
        />
      )}

      {activeTrip && <PickupRadarStatus colors={colors} isDark={isDark} activeTrip={activeTrip} />}

      <KidCheckinRow colors={colors} onCheckin={sendCheckin} />
      <KidActionRow colors={colors} isDark={isDark}
        onAskParent={() => setAskParentSheet(true)}
        onNeedRide={() => setAddEventModal(true)} />

      <HubTimelineSection active={active} members={members} events={visibleEvents} updateEvent={updateEvent} colors={colors} isDark={isDark} />

      <MyQuestsSection
        todoQuests={todoQuests} inProgressQuests={inProgressQuests} reviewQuests={reviewQuests}
        poolQuests={poolQuests} cancelledToday={cancelledQuestsToday} declinedQuests={declinedQuests} allQuests={quests}
        active={active} members={members} colors={colors} isDark={isDark}
        onClaim={(id) => claimQuest(id, active.id, (reason) => {
          // Spec 3.1/3.4 — a lost claim race gets a clear, specific
          // explanation instead of the item just silently vanishing.
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


      <KidMoreRow onPiggyBank={() => setPiggyBankModal(true)} onHistory={() => setHistoryModal(true)} />
      <KidLeaderboard activeId={active.id} kids={allKids} colors={colors} isDark={isDark} />
      <CheerSquadSection cheerable={siblingCheerable} siblingKids={siblingKids} colors={colors} isDark={isDark}
        onCheer={(id) => cheerQuest(id, active.id)} />

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
      <KidRequestHistoryModal visible={historyModal} onClose={() => setHistoryModal(false)} active={active} />
      <PiggyBankSheet
        visible={piggyBankModal} onClose={() => setPiggyBankModal(false)} colors={colors} isDark={isDark}
        mainCoins={mainCoins} gpCoins={gpCoins} almostAffordable={almostAffordable}
        doneToday={doneToday} streak={streak} level={level} memberId={active.id}
      />
      <AddEventModal visible={addEventModal} onClose={() => setAddEventModal(false)} activeMemberId={active.id} />
    </>
  );
}
