import { useState, useEffect } from 'react';
import { View, Text, Pressable, TouchableOpacity, Alert, Dimensions, ScrollView, TextInput, Modal, Switch, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ChevronRight, ChevronDown, ChevronUp } from 'lucide-react-native';
import { router } from 'expo-router';
import { BRAND } from '@/components/FamilyCubeLogo';
import FamilyAvatar from '@/components/FamilyAvatar';
import { TYPO } from '@/constants/theme';
import { useQuestStore } from '@/store/choreAdapter';
import { useChoreStore } from '@/store/choreStore';
import type { Quest } from '@/store/questStore';
import { useEventStore } from '@/store/eventStore';
import { useRewardStore } from '@/store/rewardStore';
import { useFamilyStore } from '@/store/familyStore';
import type { FamilyMember } from '@/store/familyStore';
import { useKidRequestStore } from '@/store/kidRequestStore';
import { AddEventModal } from '@/features/calendar/EventFormModal';
import { useChatStore } from '@/store/chatStore';
import { localToday, fmtTime, catColor, hoursUntilEvent } from './hubUtils';
import { fmtDateTime } from '@/lib/dates';

const { width: W } = Dimensions.get('window');

// No tabs — everything inline or navigated

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

// Encoding helpers and modals live in KidModals.tsx
export { GROCERY_PREFIX, SUPPLIES_PREFIX, encodeGroceryRequest, decodeGroceryRequest } from './KidModals';
import { SUPPLIES_PREFIX, encodeRideLate } from './KidModals';

import { GroceryModal, SuppliesModal, AskModal, KidRequestHistoryModal } from './KidModals';
import { SchoolScheduleCard } from './SchoolScheduleModal';
import AppBottomSheet from '@/components/AppBottomSheet';
import * as ImagePicker from 'expo-image-picker';
import { ChildChoreBoard } from '@/features/chores/ChildChoreBoard';
import CelebrationBurst from '@/components/CelebrationBurst';
import { CollapsibleCard } from './hubComponents';


// ─── Main KidView ──────────────────────────────────────────────────────────────
export function KidView({ active, members, colors, isDark, onHelpRequest }: {
  active: FamilyMember; members: FamilyMember[];
  colors: any; isDark: boolean;
  onHelpRequest: () => void;
}) {
  const { quests, submitQuest, claimQuest, reopenQuest, cheerQuest } = useQuestStore();
  const { startGrandparentQuest, declineGrandparentQuest } = useChoreStore();
  const { events }                                        = useEventStore();
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
  const [lateNudgeSent,   setLateNudgeSent]   = useState<Record<string, boolean>>({});
  const [dismissedReplies, setDismissedReplies] = useState<Set<string>>(new Set());
  const [dismissedActions,  setDismissedActions]  = useState<Set<string>>(new Set());
  const [declineQuest,    setDeclineQuest]    = useState<{ id: string; title: string } | null>(null);
  const [declineNote,     setDeclineNote]     = useState('');
  // Submitting a photo-required quest — "Take Photo to Get Paid" must not pay
  // out on a bare tap; the photo IS the proof, so collect it before submitting.
  const [submitProofQuest, setSubmitProofQuest] = useState<Quest | null>(null);
  const [submitProofUri,   setSubmitProofUri]   = useState<string | null>(null);
  const [submitProofNote,  setSubmitProofNote]  = useState('');
  // My Quests is the kid's own "Action Needed" — collapsed by default like
  // every Hub section, but auto-opens the moment there's something to do.
  const [myQuestsExpanded, setMyQuestsExpanded] = useState(false);

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
  }, [active.id]);

  useEffect(() => {
    AsyncStorage.setItem(`dismissed_replies_${active.id}`, JSON.stringify([...dismissedReplies]));
  }, [dismissedReplies, active.id]);

  useEffect(() => {
    AsyncStorage.setItem(`dismissed_actions_${active.id}`, JSON.stringify([...dismissedActions]));
  }, [dismissedActions, active.id]);

  const today       = localToday();
  const myEvents    = events.filter(e => (e.memberId === active.id || !e.memberId) && e.category !== 'Work');
  const todayEvents = myEvents.filter(e => e.date === today).sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
  const upcomingEvents = myEvents.filter(e => e.date > today && e.date <= new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''));

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

  // Grocery / supplies badge counts for this kid
  const myRequests = requests.filter(r => r.fromMemberId === active.id && r.status !== 'cancelled');

  const groceryBadge = (() => {
    const reqs = myRequests.filter(r =>
      r.type === 'delegation' && (r.items?.length ?? 0) > 0
    );
    if (!reqs.length) return null;
    const allItems = reqs.flatMap(r => r.items ?? []);
    const pending  = allItems.filter(it => it.status === 'pending').length;
    const approved = allItems.filter(it => it.status === 'approved').length;
    return { pending, approved, total: allItems.length };
  })();

  const suppliesBadge = (() => {
    const reqs = myRequests.filter(r =>
      r.type === 'delegation' && r.detail.startsWith(SUPPLIES_PREFIX)
    );
    if (!reqs.length) return null;
    const pending  = reqs.filter(r => r.status === 'pending').length;
    const approved = reqs.filter(r => r.status === 'approved').length;
    return { pending, approved, total: reqs.length };
  })();

  const myQuests       = quests.filter(q => q.assignedToId === active.id || q.assignedToIds?.includes(active.id));
  const poolQuests     = quests.filter(q => q.isPool && q.status === 'todo' && !q.isAdultTask);
  const activeQuests   = myQuests.filter(q => ['todo','claimed','in_progress'].includes(q.status));
  const todoQuests      = myQuests.filter(q => q.status === 'todo' && !q.isPool);
  const inProgressQuests = myQuests.filter(q => ['claimed', 'in_progress'].includes(q.status));
  const reviewQuests   = myQuests.filter(q => q.status === 'pending_approval');
  const declinedQuests = myQuests.filter(q => q.status === 'declined');
  const myActionableCount = todoQuests.length + inProgressQuests.length + reviewQuests.length;
  useEffect(() => {
    if (myActionableCount > 0) setMyQuestsExpanded(true);
  }, [myActionableCount > 0]);
  const approvedQuests = myQuests.filter(q => ['approved', 'done'].includes(q.status));
  const cancelledQuests = myQuests.filter(q => q.status === 'cancelled');
  const doneToday      = myQuests.filter(q => ['approved','done'].includes(q.status)).length;
  const questGoal      = Math.max(myQuests.filter(q => (q.status as string) !== 'pending_parent_approval').length, 3);
  const questPct       = Math.min(doneToday / questGoal, 1);

  const siblingKids       = members.filter(m => m.role === 'kid' && m.id !== active.id);
  const allKids           = [active, ...siblingKids].sort((a, b) => (b.mainCoins ?? b.coins ?? 0) - (a.mainCoins ?? a.coins ?? 0));

  // Cheer Squad — today's sibling wins that still need a cheer from me.
  // Once cheered (or once the day passes) it drops off — this is a to-do list
  // of pending cheers, not a history feed.
  const siblingCheerable = quests.filter(q => {
    if (!['approved', 'done'].includes(q.status) || q.isAdultTask) return false;
    if (!q.assignedToId || !siblingKids.some(s => s.id === q.assignedToId)) return false;
    if ((q.cheers ?? []).some(c => c.memberId === active.id)) return false;
    const when = q.approvedAt ?? q.completedAt;
    return !!when && when.slice(0, 10) === today;
  }).slice(0, 5);

  // Cheers landed on my own completed quests — surfaced as a celebration banner
  const cheersForMe = myQuests.flatMap(q => (q.cheers ?? []).map(c => ({ quest: q, cheer: c })));
  const eligibleRewards   = getEligibleRewards(active.id);
  const mainCoins  = active.mainCoins ?? active.coins ?? 0;
  const gpCoins    = active.gpCoins ?? 0;
  const streak     = active.streak ?? 0;
  const xp         = active.xp ?? 0;
  const level      = active.level ?? 1;
  const xpForNext  = level * 100;
  const xpPct      = Math.min((xp % xpForNext) / xpForNext, 1);
  const almostAffordable = rewards.filter(r => !eligibleRewards.find(e => e.id === r.id) && r.cost > 0 && r.cost - mainCoins <= 30 && r.cost - mainCoins > 0);
  const COIN_VAL   = 0.10;
  const pad        = { paddingHorizontal: 16 };
  const familyId   = (active as any).familyId ?? 'family-1';

  const sendCheckin = (type: 'home' | 'school' | 'ready' | 'late', eventTitle?: string) => {
    const messages: Record<string, { detail: string; chatMsg: string; emoji: string }> = {
      home:   { detail: "I'm home! 🏠",                      chatMsg: `${active.name.split(' ')[0]} is home! 🏠`,                       emoji: '🏠 I\'m home!' },
      school: { detail: "I'm at school 📚",                  chatMsg: `${active.name.split(' ')[0]} arrived at school 📚`,              emoji: '📚 I\'m at school!' },
      ready:  { detail: `I'm ready for pickup! 🎒${eventTitle ? ` (${eventTitle})` : ''}`,
                chatMsg: `${active.name.split(' ')[0]} is ready for pickup! 🎒${eventTitle ? ` (${eventTitle})` : ''}`,                  emoji: '🎒 I\'m ready!' },
      late:   { detail: `Running a bit late 🏃${eventTitle ? ` for ${eventTitle}` : ''}`,
                chatMsg: `${active.name.split(' ')[0]} is running late 🏃${eventTitle ? ` for ${eventTitle}` : ''}`,                     emoji: '🏃 Running late!' },
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

  // ── Hero card ───────────────────────────────────────────────────────────────
  const rideUrgent = rideCountdown !== null && rideCountdown <= 15 && rideCountdown >= 0;
  const rideHere   = rideCountdown !== null && rideCountdown <= 2 && rideCountdown >= -5;

  const heroCard = (
    <View style={[pad, { marginBottom: 14 }]}>
      <View style={{ borderRadius: 24, overflow: 'hidden', backgroundColor: isDark ? '#1A0F33' : '#F3EEFF', borderWidth: 1.5, borderColor: BRAND.purple + '40' }}>
        {/* Name + level + coins */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, paddingBottom: 10 }}>
          <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: BRAND.purple + '25', alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: BRAND.purple + '70' }}>
            <Text style={{ fontSize: 32 }}>{active.emoji ?? '👤'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 19, fontWeight: '900', color: colors.textPrimary }}>{active.name.split(' ')[0]}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <View style={{ backgroundColor: BRAND.purple + '25', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: BRAND.purple }}>Lv {level} ⚡</Text>
              </View>
              {streak > 0 && (
                <View style={{ backgroundColor: '#FF660020', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Text style={{ fontSize: 10 }}>🔥</Text>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#FF6600' }}>{streak}d streak</Text>
                </View>
              )}
            </View>
          </View>
          <Pressable onPress={() => router.push('/(tabs)/store' as any)} style={{ alignItems: 'center', gap: 2 }}>
            <View style={{ backgroundColor: BRAND.amber + '20', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5, borderColor: BRAND.amber + '50', flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text style={{ fontSize: 14 }}>🪙</Text>
              <Text style={{ fontSize: 22, fontWeight: '900', color: BRAND.amber }}>{mainCoins}</Text>
            </View>
            {gpCoins > 0 && <Text style={{ fontSize: 10, fontWeight: '700', color: BRAND.purple }}>+{gpCoins} ⭐ GP</Text>}
          </Pressable>
        </View>

        {/* XP bar */}
        <View style={{ paddingHorizontal: 16, gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textTertiary }}>⚡ XP TO LEVEL {level + 1}</Text>
            <Text style={{ fontSize: 10, fontWeight: '700', color: BRAND.teal }}>{xp % xpForNext}/{xpForNext}</Text>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: isDark ? '#2D1F55' : '#E5DAFF', overflow: 'hidden' }}>
            <View style={{ height: 6, borderRadius: 3, width: `${Math.round(xpPct * 100)}%` as any, backgroundColor: BRAND.teal }} />
          </View>
        </View>

        {/* Daily quest progress */}
        <View style={{ paddingHorizontal: 16, paddingTop: 10, gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textTertiary }}>🎯 TODAY'S QUEST GOAL</Text>
            <Text style={{ fontSize: 10, fontWeight: '800', color: doneToday >= questGoal ? '#10B981' : BRAND.amber }}>
              {doneToday >= questGoal ? '✅ All done!' : `${doneToday}/${questGoal}`}
            </Text>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: isDark ? '#2D1F55' : '#E5DAFF', overflow: 'hidden' }}>
            <View style={{ height: 6, borderRadius: 3, width: `${Math.round(questPct * 100)}%` as any, backgroundColor: doneToday >= questGoal ? '#10B981' : BRAND.amber }} />
          </View>
        </View>

        {/* Ride / next event countdown */}
        {confirmedRide && rideCountdown !== null && rideCountdown > -10 && (
          <View style={{ marginHorizontal: 16, marginTop: 12, borderRadius: 16,
            backgroundColor: rideHere ? '#064E3B' : rideUrgent ? '#7C2D12' : (isDark ? '#0F2A20' : '#ECFDF5'),
            borderWidth: 1.5, borderColor: rideHere ? '#10B981' : rideUrgent ? '#EF4444' : '#10B98150',
            padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 24 }}>{rideHere ? '🚨' : '🚗'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: rideHere ? '#6EE7B7' : rideUrgent ? '#FCA5A5' : '#10B981' }}>
                {rideHere
                  ? `${confirmedRide.helper?.split(' ')[0]} is HERE! 🎉`
                  : rideUrgent
                    ? `${confirmedRide.helper?.split(' ')[0]} arrives in ${rideCountdown} min — get ready!`
                    : `${confirmedRide.helper?.split(' ')[0]} picks you up in ${rideCountdown}m`}
              </Text>
              <Text style={{ fontSize: 11, color: rideHere ? '#34D399' : rideUrgent ? '#F87171' : '#34D399' }}>
                {confirmedRide.title} · {fmtTime(confirmedRide.time)}
              </Text>
            </View>
          </View>
        )}
        {!confirmedRide && nextEvent && nextCountdown !== null && nextCountdown > 0 && (
          <View style={{ marginHorizontal: 16, marginTop: 12, borderRadius: 14, backgroundColor: isDark ? '#1A1A2E' : '#EEF2FF',
            borderWidth: 1, borderColor: '#6366F130', padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 18 }}>📅</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary }} numberOfLines={1}>
              {nextEvent.title} in {nextCountdown >= 60 ? `${Math.floor(nextCountdown / 60)}h ${nextCountdown % 60}m` : `${nextCountdown}m`}
            </Text>
          </View>
        )}

        <View style={{ height: 14 }} />
      </View>
    </View>
  );

  // ── Ask parent quick bar (legacy — replaced by askParentSheet) ──────────────
  const askBar = (
    <View style={[pad, { marginBottom: 12 }]}>
      <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textTertiary, marginBottom: 8 }}>ASK PARENT</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {([
          { key: 'permission', emoji: '🔓', label: 'Permission', onPress: () => setAskModal('permission') },
          { key: 'question',   emoji: '❓', label: 'Question',   onPress: () => setAskModal('question')   },
          { key: 'supplies',   emoji: '📚', label: 'Supplies',   onPress: () => setSuppliesModal(true)    },
          { key: 'grocery',    emoji: '🛒', label: 'Grocery',    onPress: () => setGroceryModal(true)     },
          { key: 'medication', emoji: '💊', label: 'Meds',       onPress: () => setAskModal('medication') },
        ]).map(({ key, emoji, label, onPress }) => (
          <Pressable key={key} onPress={onPress}
            style={{ flex: 1, borderRadius: 14, paddingVertical: 10, alignItems: 'center', gap: 3,
              backgroundColor: key === 'supplies' ? '#6366F115' : key === 'grocery' ? BRAND.teal + '12' : (isDark ? colors.card : '#fff'),
              borderWidth: 1.5, borderColor: key === 'supplies' ? '#6366F140' : key === 'grocery' ? BRAND.teal + '40' : (isDark ? colors.border : '#E8E8F0') }}>
            <Text style={{ fontSize: 16 }}>{emoji}</Text>
            <Text style={{ fontSize: 9, fontWeight: '700', color: key === 'supplies' ? '#6366F1' : key === 'grocery' ? BRAND.teal : colors.textSecondary }}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {/* Parent replies — recent approved/declined questions & permissions */}
      {(() => {
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        const recentReplies = myRequests.filter(r => {
          if (!['approved', 'declined'].includes(r.status)) return false;
          if (!['permission', 'question', 'medication', 'checkin'].includes(r.type)) return false;
          if (!r.respondedAt) return false;
          if (dismissedReplies.has(r.id)) return false;
          return new Date(r.respondedAt).getTime() > cutoff;
        });
        if (!recentReplies.length) return null;
        return (
          <View style={{ marginTop: 8, gap: 6 }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textTertiary }}>PARENT REPLIED</Text>
            {recentReplies.map(r => {
              const approved = r.status === 'approved';
              const isCheckinReply = r.type === 'checkin';
              const typeEmoji = isCheckinReply ? (r.detail.includes('late') || r.detail.includes('Late') ? '🏃' : r.detail.includes('home') || r.detail.includes('Home') ? '🏠' : '🎒') : r.type === 'medication' ? '💊' : r.type === 'permission' ? '🔓' : '❓';
              const typeLabel = isCheckinReply ? 'Check-in' : r.type === 'medication' ? 'Medical' : r.type === 'permission' ? 'Permission' : 'Question';
              const accent = isCheckinReply ? BRAND.teal : approved ? '#10B981' : '#EF4444';
              const statusLabel = isCheckinReply ? 'Seen 👍' : approved ? 'Yes!' : 'No';
              
              // Who replied and when
              const responder = r.respondedBy ? members.find(m => m.id === r.respondedBy) : null;
              const responderName = responder ? responder.name.split(' ')[0] : 'Parent';
              let timeAgo = '';
              if (r.respondedAt) {
                const diffMins = Math.floor((Date.now() - new Date(r.respondedAt).getTime()) / 60000);
                if (diffMins < 60) timeAgo = `${diffMins}m ago`;
                else if (diffMins < 1440) timeAgo = `${Math.floor(diffMins / 60)}h ago`;
                else timeAgo = `${Math.floor(diffMins / 1440)}d ago`;
              }
              
              return (
                <View key={r.id} style={{
                  borderRadius: 14, borderWidth: 1.5, borderColor: accent + '35',
                  backgroundColor: isDark ? colors.card : accent + '08', padding: 12,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    <Text style={{ fontSize: 20, marginTop: 1 }}>{isCheckinReply ? typeEmoji : approved ? '✅' : '❌'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: accent, marginBottom: 2 }}>
                        {statusLabel} — {typeEmoji} {typeLabel}
                      </Text>
                      <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginBottom: 4 }}>
                        {responderName}{timeAgo && ` · ${timeAgo}`}
                      </Text>
                      <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }} numberOfLines={2}>
                        "{r.detail}"
                      </Text>
                      {r.parentNote ? (
                        <Text style={{ fontSize: TYPO.label, color: accent, fontStyle: 'italic', marginTop: 4 }}>
                          Parent: "{r.parentNote}"
                        </Text>
                      ) : null}
                    </View>
                    <Pressable onPress={() => setDismissedReplies(prev => new Set([...prev, r.id]))}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ padding: 4, borderRadius: 8, backgroundColor: isDark ? '#ffffff12' : '#00000008' }}>
                      <Text style={{ fontSize: 12, color: colors.textTertiary }}>✕</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        );
      })()}

      {/* My Requests history link */}
      <Pressable onPress={() => setHistoryModal(true)}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingVertical: 9, paddingHorizontal: 14, borderRadius: 12, marginTop: 6,
          backgroundColor: isDark ? BRAND.purple + '18' : BRAND.purple + '10',
          borderWidth: 1, borderColor: BRAND.purple + '30' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 12 }}>📋</Text>
          <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: BRAND.purple }}>My Request History</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 5 }}>
          {(() => {
            const totalPending  = (groceryBadge?.pending  ?? 0) + (suppliesBadge?.pending  ?? 0);
            const totalApproved = (groceryBadge?.approved ?? 0) + (suppliesBadge?.approved ?? 0);
            return (
              <>
                {totalPending > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3,
                    backgroundColor: BRAND.amber + '25', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 9 }}>⏳</Text>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: BRAND.amber }}>{totalPending} pending</Text>
                  </View>
                )}
                {totalApproved > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3,
                    backgroundColor: '#10B98120', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 9 }}>✅</Text>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: '#10B981' }}>{totalApproved} approved</Text>
                  </View>
                )}
              </>
            );
          })()}
        </View>
      </Pressable>
    </View>
  );

  // ── Tab: Quests ──────────────────────────────────────────────────────────────
  const questsTab = (
    <View style={[pad, { gap: 10 }]}>

      {/* Ride status banners */}
      {confirmedRide && rideCountdown !== null && rideCountdown > -10 && (
        <View style={{ borderRadius: 16, backgroundColor: '#064E3B', borderWidth: 1.5, borderColor: '#10B981', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 20 }}>🚗</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#6EE7B7' }}>{confirmedRide.helper?.split(' ')[0]} is your driver!</Text>
            <Text style={{ fontSize: 11, color: '#34D399' }}>{confirmedRide.title} · {fmtTime(confirmedRide.time)}</Text>
          </View>
          {rideCountdown <= 15 && rideCountdown >= 0 && (
            <View style={{ backgroundColor: '#10B98130', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#6EE7B7' }}>{rideCountdown}m</Text>
            </View>
          )}
        </View>
      )}

      {/* Driver late alert — shows when event time has passed, driver was confirmed */}
      {confirmedRide && rideCountdown !== null && rideCountdown < -5 && (
        <Pressable onPress={() => sendDriverLate(confirmedRide)}
          style={{ borderRadius: 16, backgroundColor: '#450A0A', borderWidth: 1.5, borderColor: '#EF4444', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 24 }}>⚠️</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#FCA5A5' }}>Driver hasn't arrived!</Text>
            <Text style={{ fontSize: 11, color: '#F87171' }}>{confirmedRide.helper?.split(' ')[0]} was due at {fmtTime(confirmedRide.time)}</Text>
          </View>
          <View style={{ backgroundColor: '#EF4444', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>{lateNudgeSent[confirmedRide.id] ? 'Sent ✓' : 'Alert!'}</Text>
          </View>
        </Pressable>
      )}

      {myPendingRides.map(ev => (
        <View key={ev.id} style={{ borderRadius: 16, backgroundColor: isDark ? '#422006' : '#FFF7ED', borderWidth: 1.5, borderColor: BRAND.amber, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 20 }}>⏳</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: BRAND.amber }}>Waiting: {ev.title}</Text>
            <Text style={{ fontSize: 11, color: BRAND.amber, opacity: 0.8 }}>{fmtTime(ev.time)} · Parent confirming…</Text>
          </View>
        </View>
      ))}

      {myDeclinedRides.map(ev => {
        const nudgeParent = () => {
          sendRequest({
            type: 'ride', fromMemberId: active.id, urgency: 'urgent',
            detail: `Need a new driver for: ${ev.title}${ev.declinedBy ? ` — ${ev.declinedBy} declined${ev.declineReason ? ` ("${ev.declineReason}")` : ''}` : ''}`,
            scheduledDate: ev.date, scheduledTime: ev.time ?? undefined,
          });
          Alert.alert('Nudge sent! 👋', 'Your parent has been notified to find a new driver.');
        };
        return (
          <Pressable key={ev.id} onPress={nudgeParent}
            style={{ borderRadius: 16, backgroundColor: '#450A0A', borderWidth: 1.5, borderColor: '#EF4444', padding: 12, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 20 }}>❌</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#FCA5A5' }}>Ride declined: {ev.title}</Text>
                <Text style={{ fontSize: 11, color: '#F87171' }}>{fmtTime(ev.time)}</Text>
              </View>
              <View style={{ backgroundColor: '#EF444430', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: '#FCA5A5' }}>Tap to nudge</Text>
              </View>
            </View>
            {(ev.declinedBy || ev.declineReason) && (
              <View style={{ backgroundColor: '#EF444415', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, gap: 2 }}>
                {ev.declinedBy && <Text style={{ fontSize: 11, color: '#FCA5A5', fontWeight: '700' }}>{ev.declinedBy} can't make it</Text>}
                {ev.declineReason && <Text style={{ fontSize: 11, color: '#F87171', fontStyle: 'italic' }}>"{ev.declineReason}"</Text>}
              </View>
            )}
          </Pressable>
        );
      })}

      {/* Sibling leaderboard */}
      {siblingKids.length > 0 && (
        <View style={{ borderRadius: 18, backgroundColor: isDark ? colors.card : '#fff', borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0', padding: 14, gap: 10 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textPrimary }}>🏅 Family Leaderboard</Text>
          {allKids.map((k, i) => {
            const isMe = k.id === active.id;
            const kCoins = k.mainCoins ?? k.coins ?? 0;
            const medals = ['🥇', '🥈', '🥉'];
            return (
              <View key={k.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                padding: 8, borderRadius: 12,
                backgroundColor: isMe ? BRAND.purple + '18' : 'transparent',
                borderWidth: isMe ? 1.5 : 0, borderColor: BRAND.purple + '40' }}>
                <Text style={{ fontSize: 16, width: 24 }}>{medals[i] ?? `${i + 1}.`}</Text>
                <FamilyAvatar name={k.name} emoji={k.emoji} avatarUrl={(k as any).avatarUrl} size={30}
                  ringColor={BRAND.purple} ringWidth={isMe ? 2 : 0} />
                <Text style={{ flex: 1, fontSize: 13, fontWeight: isMe ? '900' : '700', color: isMe ? BRAND.purple : colors.textPrimary }}>
                  {k.name.split(' ')[0]}{isMe ? ' (you)' : ''}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 12 }}>🪙</Text>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: BRAND.amber }}>{kCoins}</Text>
                </View>
                {k.streak > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    <Text style={{ fontSize: 10 }}>🔥</Text>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#FF6600' }}>{k.streak}d</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Review / Declined quests */}
      {reviewQuests.map(q => (
        <View key={q.id} style={{ borderRadius: 16, backgroundColor: isDark ? '#422006' : '#FFF8E8', borderWidth: 1.5, borderColor: BRAND.amber + '70', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: 24 }}>⏳</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: BRAND.amber }}>{q.title}</Text>
            <Text style={{ fontSize: 11, color: BRAND.amber, opacity: 0.8 }}>Parent review · 🪙 {q.coins} coins pending</Text>
          </View>
        </View>
      ))}
      {declinedQuests.map(q => (
        <View key={q.id} style={{ borderRadius: 16, backgroundColor: isDark ? '#1a0000' : '#FEF2F2', borderWidth: 1.5, borderColor: '#EF444450', padding: 14, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 22 }}>❌</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#EF4444' }}>{q.title}</Text>
              {q.history?.slice().reverse().find(h => h.action === 'declined')?.note && (
                <Text style={{ fontSize: 11, color: '#F87171', marginTop: 2 }}>
                  "{q.history.slice().reverse().find(h => h.action === 'declined')!.note}"
                </Text>
              )}
            </View>
          </View>
          <Pressable
            onPress={() => sendRequest({ type: 'permission', fromMemberId: active.id, detail: `I'd like to try "${q.title}" again — please give me another chance!`, urgency: 'normal' })}
            style={{ borderRadius: 10, backgroundColor: BRAND.purple + '20', borderWidth: 1.5, borderColor: BRAND.purple + '60', paddingVertical: 9, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            <Text style={{ fontSize: 14 }}>🙏</Text>
            <Text style={{ fontSize: 12, fontWeight: '800', color: BRAND.purple }}>Ask to Retry</Text>
          </Pressable>
        </View>
      ))}

      {/* Active quests */}
      {activeQuests.length === 0 && reviewQuests.length === 0 && declinedQuests.length === 0 ? (
        <Pressable onPress={() => router.push('/(tabs)/quests')}
          style={{ borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', borderColor: BRAND.purple + '50', backgroundColor: BRAND.purple + '08', padding: 28, alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 44 }}>🏆</Text>
          <Text style={{ fontSize: 16, fontWeight: '900', color: BRAND.purple }}>All caught up!</Text>
          <Text style={{ fontSize: 12, color: colors.textTertiary, textAlign: 'center' }}>Grab a bounty quest to earn more coins 💰</Text>
        </Pressable>
      ) : activeQuests.map(q => {
        const isPool = q.isPool && q.status === 'todo';
        const isClaimed = q.status === 'claimed';
        const isInProgress = q.status === 'in_progress';
        const isGp = q.questType === 'grandparent_quest';
        // Bounty offered to a shortlist of siblings — each earns the full coins
        // independently; nobody's payout depends on the others finishing.
        const teamMates = q.teamGroupId
          ? quests.filter(t => t.teamGroupId === q.teamGroupId && t.id !== q.id)
          : [];
        const accentColor = isPool ? '#10B981' : BRAND.purple;
        const catEmoji = q.category === 'Kitchen' ? '🍽️' : q.category === 'Yard' ? '🌿' : q.category === 'School' ? '📚' : q.category === 'Laundry' ? '🧺' : q.category === 'Bathroom' ? '🧹' : q.category === 'Pet' ? '🐾' : q.category === 'Cooking' ? '🍳' : '⭐';
        return (
          <View key={q.id} style={{ borderRadius: 18, backgroundColor: isDark ? colors.card : '#fff', borderWidth: 1.5,
            borderColor: isPool ? '#10B98150' : isInProgress ? BRAND.teal + '70' : isClaimed ? BRAND.teal + '40' : (isDark ? colors.border : '#E8E8F0'),
            padding: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: accentColor + '20' }}>
                <Text style={{ fontSize: 20 }}>{catEmoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary, flex: 1 }}>{q.title}</Text>
                  {isInProgress && <View style={{ backgroundColor: BRAND.teal + '25', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}><Text style={{ fontSize: 9, fontWeight: '800', color: BRAND.teal }}>IN PROGRESS</Text></View>}
                  {isClaimed    && <View style={{ backgroundColor: BRAND.teal + '18', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}><Text style={{ fontSize: 9, fontWeight: '800', color: BRAND.teal }}>CLAIMED</Text></View>}
                  {isPool       && <View style={{ backgroundColor: '#10B98120', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}><Text style={{ fontSize: 9, fontWeight: '800', color: '#10B981' }}>BOUNTY</Text></View>}
                  {q.teamGroupId && <View style={{ backgroundColor: BRAND.amber + '20', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}><Text style={{ fontSize: 9, fontWeight: '800', color: BRAND.amber }}>🎯 BOUNTY</Text></View>}
                </View>
                {q.teamGroupId && teamMates.length > 0 && (
                  <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND.amber, marginTop: 3 }}>
                    Also offered to {teamMates.map(t => members.find(m => m.id === t.assignedToId)?.name.split(' ')[0] ?? 'a sibling').join(' & ')} — everyone who finishes gets the full {q.coins} 🪙
                  </Text>
                )}
                {q.description && <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }} numberOfLines={2}>{q.description}</Text>}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <View style={{ backgroundColor: BRAND.amber + '20', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: 11 }}>🪙</Text>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: BRAND.amber }}>{q.coins}</Text>
                  </View>
                  {q.xpReward && (
                    <View style={{ backgroundColor: BRAND.teal + '15', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Text style={{ fontSize: 10 }}>⚡</Text>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: BRAND.teal }}>+{q.xpReward} XP</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
            {isGp && q.status === 'todo' && !isPool ? (
              /* Grandparent quest the parent just approved — the kid opts in or
                 sends it back with a note, per the GP → parent → kid flow. */
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable onPress={() => startGrandparentQuest(q.id, active.id)}
                  style={{ flex: 2, borderRadius: 12, backgroundColor: '#10B981', paddingVertical: 11, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 14 }}>🙌</Text>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>I'll take it</Text>
                </Pressable>
                <Pressable onPress={() => { setDeclineQuest({ id: q.id, title: q.title }); setDeclineNote(''); }}
                  style={{ flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: '#EF444450', paddingVertical: 11, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#EF4444' }}>Decline</Text>
                </Pressable>
              </View>
            ) : isPool ? (
              <Pressable onPress={() => claimQuest(q.id, active.id)}
                style={{ borderRadius: 12, backgroundColor: BRAND.purple, paddingVertical: 11, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                <Text style={{ fontSize: 14 }}>🏆</Text>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>Claim Quest (+{q.coins} 🪙)</Text>
              </Pressable>
            ) : isClaimed ? (
              <Pressable onPress={() => submitQuest(q.id)}
                style={{ borderRadius: 12, backgroundColor: BRAND.teal, paddingVertical: 11, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                <Text style={{ fontSize: 14 }}>⚡</Text>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>Start Quest</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => handleSubmitTap(q)}
                style={{ borderRadius: 12, backgroundColor: '#10B981', paddingVertical: 11, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                <Text style={{ fontSize: 14 }}>{q.photoRequired ? '📸' : '✅'}</Text>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>
                  {q.photoRequired ? 'Take Photo to Get Paid' : 'Mark Done → Get Paid'}
                </Text>
              </Pressable>
            )}
          </View>
        );
      })}

      {/* Bounty pool teaser */}
      {poolQuests.length > 0 && activeQuests.every(q => !q.isPool) && (
        <Pressable onPress={() => router.push('/(tabs)/quests')}
          style={{ borderRadius: 16, backgroundColor: '#10B98115', borderWidth: 1.5, borderColor: '#10B98140', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 28 }}>💰</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#10B981' }}>{poolQuests.length} bounty quest{poolQuests.length !== 1 ? 's' : ''} up for grabs!</Text>
            <Text style={{ fontSize: 11, color: '#10B981', opacity: 0.8 }}>First come, first served 🚀</Text>
          </View>
          <ChevronRight size={16} color="#10B981" />
        </Pressable>
      )}

      {/* ── Chore Board section ── */}
      <View style={{
        borderRadius: 20, borderWidth: 1,
        borderColor: isDark ? colors.border : '#E8E8F0',
        backgroundColor: isDark ? colors.card : '#fff',
        overflow: 'hidden', marginBottom: 12, minHeight: 120,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, paddingBottom: 8 }}>
          <Text style={{ fontSize: 20 }}>🌱</Text>
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textPrimary }}>
            Chores & Points
          </Text>
        </View>
        <ChildChoreBoard
          member={active}
          members={members}
          colors={colors}
          isDark={isDark}
        />
      </View>

      <Pressable onPress={() => router.push('/(tabs)/chat')}
        style={{ borderRadius: 16, backgroundColor: isDark ? colors.card : '#fff', paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 7, borderWidth: 1.5, borderColor: isDark ? colors.border : '#E8E8F0' }}>
        <Text style={{ fontSize: 15 }}>💬</Text>
        <Text style={{ fontSize: 13, fontWeight: '800', color: BRAND.purple }}>Open Family Chat</Text>
      </Pressable>
    </View>
  );

  // ── Tab: Schedule ─────────────────────────────────────────────────────────────
  const scheduleTab = (
    <View style={[pad, { gap: 10 }]}>
      {/* School timetable */}
      <SchoolScheduleCard
        memberId={active.id}
        memberName={active.name.split(' ')[0]}
        isParent={false}
        colors={colors}
        isDark={isDark}
      />

      {/* Today */}
      <View style={{ backgroundColor: isDark ? colors.card : '#fff', borderRadius: 18, borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0', overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 8 }}>
          <Text style={{ fontSize: 15 }}>📅</Text>
          <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: colors.textPrimary }}>Today</Text>
          <Text style={{ fontSize: 10, fontWeight: '700', color: '#10B981' }}>✓ Parent Verified</Text>
        </View>
        {todayEvents.length === 0 ? (
          <View style={{ paddingHorizontal: 14, paddingBottom: 20, alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 36 }}>🎉</Text>
            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary }}>Free day! Go have fun.</Text>
          </View>
        ) : todayEvents.map(ev => {
          const isPast     = hoursUntilEvent(ev.date, ev.time) < 0;
          const isRejected = ev.helperStatus === 'rejected';
          const declinedBy = ev.declinedBy ?? ev.helper;
          const driverLate = ev.helperStatus === 'confirmed' && ev.helper && hoursUntilEvent(ev.date, ev.time) < -5;
          return (
            <View key={ev.id}>
              <Pressable onPress={() => router.push('/(tabs)/calendar')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                  paddingHorizontal: 14, paddingVertical: 11,
                  borderTopWidth: 1, borderTopColor: isDark ? colors.border : '#F1F5F9',
                  opacity: isPast ? 0.4 : 1 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: catColor(ev.category) }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>
                    {isPast ? '✓ ' : ''}{ev.title}
                  </Text>
                  {ev.time && <Text style={{ fontSize: 11, color: colors.textTertiary }}>{fmtTime(ev.time)}{ev.location ? ` · ${ev.location}` : ''}</Text>}
                </View>
                {ev.helper && ev.helperStatus === 'confirmed' && !isRejected && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: 10 }}>🚗</Text>
                    <Text style={{ fontSize: 11, color: '#10B981', fontWeight: '700' }}>{ev.helper.split(' ')[0]}</Text>
                  </View>
                )}
                {ev.helper && ev.helperStatus === 'pending' && !ev.approvalPending && (
                  <View style={{ backgroundColor: BRAND.amber + '25', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: BRAND.amber }}>⏳ pending</Text>
                  </View>
                )}
                {isRejected && (
                  <View style={{ backgroundColor: '#EF444420', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#EF4444' }}>❌ No Driver</Text>
                  </View>
                )}
              </Pressable>
              {isRejected && !isPast && (declinedBy || ev.declineReason) && (
                <View style={{ marginHorizontal: 14, marginBottom: 8, backgroundColor: '#EF444410', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                  {declinedBy && <Text style={{ fontSize: 10, color: '#EF4444', fontWeight: '700' }}>{declinedBy} can't make it</Text>}
                  {ev.declineReason && <Text style={{ fontSize: 10, color: '#F87171', fontStyle: 'italic' }}>"{ev.declineReason}"</Text>}
                </View>
              )}
              {driverLate && !isPast && (
                <Pressable onPress={() => sendDriverLate(ev)}
                  style={{ marginHorizontal: 14, marginBottom: 8, borderRadius: 10, backgroundColor: '#EF4444', paddingVertical: 8, alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>
                    {lateNudgeSent[ev.id] ? '⚠️ Alert sent ✓' : '⚠️ Driver is late — alert parent!'}
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })}
        <Pressable onPress={() => router.push('/(tabs)/calendar')}
          style={{ padding: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: isDark ? colors.border : '#F1F5F9' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: BRAND.purple }}>Full Calendar →</Text>
        </Pressable>
      </View>

      {/* Upcoming (next 3 days) */}
      {upcomingEvents.length > 0 && (
        <View style={{ backgroundColor: isDark ? colors.card : '#fff', borderRadius: 18, borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0', overflow: 'hidden' }}>
          <View style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary }}>📆 Coming Up</Text>
          </View>
          {upcomingEvents.slice(0, 5).map((ev, i) => {
            const daysAway = Math.round((new Date(ev.date).getTime() - Date.now()) / 86400000);
            return (
              <Pressable key={ev.id} onPress={() => router.push('/(tabs)/calendar')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                  paddingHorizontal: 14, paddingVertical: 10,
                  borderTopWidth: i === 0 ? 1 : 0, borderTopColor: isDark ? colors.border : '#F1F5F9' }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: catColor(ev.category) }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>{ev.title}</Text>
                  <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                    {daysAway === 1 ? 'Tomorrow' : `In ${daysAway} days`}{ev.time ? ` · ${fmtTime(ev.time)}` : ''}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Quick links */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable onPress={() => router.push('/(tabs)/quests')} style={{ flex: 1, borderRadius: 14, backgroundColor: BRAND.purple + '15', borderWidth: 1, borderColor: BRAND.purple + '30', paddingVertical: 12, alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 20 }}>🏆</Text>
          <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND.purple }}>My Quests</Text>
        </Pressable>
        <Pressable onPress={() => setGroceryModal(true)} style={{ flex: 1, borderRadius: 14, backgroundColor: BRAND.teal + '15', borderWidth: 1, borderColor: BRAND.teal + '30', paddingVertical: 12, alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 20 }}>🛒</Text>
          <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND.teal }}>Grocery</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/(tabs)/chat')} style={{ flex: 1, borderRadius: 14, backgroundColor: BRAND.amber + '15', borderWidth: 1, borderColor: BRAND.amber + '30', paddingVertical: 12, alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 20 }}>💬</Text>
          <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND.amber }}>Chat</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/(tabs)/store' as any)} style={{ flex: 1, borderRadius: 14, backgroundColor: '#EC489915', borderWidth: 1, borderColor: '#EC489930', paddingVertical: 12, alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 20 }}>🛍️</Text>
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#EC4899' }}>Store</Text>
        </Pressable>
      </View>
    </View>
  );

  // ── Piggy Bank sheet ──────────────────────────────────────────────────────────
  const piggyBankSheet = (
    <AppBottomSheet
      visible={piggyBankModal}
      onClose={() => setPiggyBankModal(false)}
      title="🐷 Piggy Bank"
      subtitle="Your coin balance & cash-out value"
      accentColor={BRAND.amber}
      minHeight="55%">
    <View style={{ gap: 10 }}>
      <View style={{ borderRadius: 18, padding: 14, alignItems: 'center', gap: 4, backgroundColor: isDark ? '#1A1000' : '#FFF8E8', borderWidth: 1.5, borderColor: BRAND.amber + '50' }}>
        <Text style={{ fontSize: 32 }}>🐷</Text>
        <Text style={{ fontSize: 34, fontWeight: '900', color: BRAND.amber, lineHeight: 38 }}>{mainCoins}</Text>
        <Text style={{ fontSize: 11, color: colors.textTertiary, fontWeight: '600' }}>Main Store Coins</Text>
        {gpCoins > 0 && (
          <View style={{ backgroundColor: BRAND.purple + '20', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, marginTop: 2, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text style={{ fontSize: 11 }}>⭐</Text>
            <Text style={{ fontSize: 11, fontWeight: '800', color: BRAND.purple }}>+{gpCoins} Grandparent Bonus</Text>
          </View>
        )}
      </View>

      <View style={{ borderRadius: 14, padding: 12, backgroundColor: isDark ? colors.card : '#fff', borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0', gap: 7 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 11, color: colors.textSecondary }}>Main coins</Text>
          <Text style={{ fontSize: 13, fontWeight: '900', color: '#10B981' }}>${(mainCoins * COIN_VAL).toFixed(2)}</Text>
        </View>
        {gpCoins > 0 && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 11, color: colors.textSecondary }}>GP bonus</Text>
            <Text style={{ fontSize: 12, fontWeight: '800', color: BRAND.purple }}>${(gpCoins * COIN_VAL).toFixed(2)}</Text>
          </View>
        )}
        <View style={{ height: 1, backgroundColor: isDark ? colors.border : '#F1F5F9' }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textPrimary }}>Total 💰</Text>
          <Text style={{ fontSize: 15, fontWeight: '900', color: BRAND.amber }}>${((mainCoins + gpCoins) * COIN_VAL).toFixed(2)}</Text>
        </View>
      </View>

      {almostAffordable.length > 0 && (
        <View style={{ borderRadius: 14, padding: 12, backgroundColor: isDark ? colors.card : '#fff', borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0', gap: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textPrimary }}>🎯 Almost there!</Text>
          {almostAffordable.slice(0, 2).map(r => {
            const pct = Math.min(mainCoins / r.cost, 1);
            return (
              <View key={r.id} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>{r.emoji} {r.title}</Text>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: BRAND.amber }}>Need {r.cost - mainCoins} more 🪙</Text>
                </View>
                <View style={{ height: 5, borderRadius: 3, backgroundColor: isDark ? colors.surface : '#F1F5F9', overflow: 'hidden' }}>
                  <View style={{ height: 5, borderRadius: 3, width: `${Math.round(pct * 100)}%` as any, backgroundColor: BRAND.amber }} />
                </View>
              </View>
            );
          })}
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[
          { icon: '✅', value: doneToday,    label: 'Done Today', color: '#10B981' },
          { icon: '🔥', value: streak,       label: 'Day Streak', color: '#FF6600' },
          { icon: '⚡', value: `Lv ${level}`, label: 'Level',     color: BRAND.purple },
        ].map(({ icon, value, label, color }) => (
          <View key={label} style={{ flex: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 4, backgroundColor: isDark ? colors.card : '#fff', borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0', alignItems: 'center', gap: 2 }}>
            <Text style={{ fontSize: 16 }}>{icon}</Text>
            <Text style={{ fontSize: 14, fontWeight: '900', color }}>{value}</Text>
            <Text style={{ fontSize: 9, fontWeight: '700', color: colors.textTertiary }}>{label}</Text>
          </View>
        ))}
      </View>

      <View style={{ borderRadius: 14, padding: 12, backgroundColor: BRAND.teal + '12', borderWidth: 1, borderColor: BRAND.teal + '40' }}>
        <Text style={{ fontSize: 11, fontWeight: '800', color: BRAND.teal, marginBottom: 3 }}>💡 How cash-outs work</Text>
        <Text style={{ fontSize: 11, color: colors.textSecondary, lineHeight: 16 }}>
          10 Coins = $1.00 real allowance! Ask at{' '}
          <Text style={{ fontWeight: '700', color: colors.textPrimary }}>Friday Family Dinner</Text>
          {' '}to cash out.
        </Text>
      </View>
    </View>
    </AppBottomSheet>
  );

  // ── Tab: Rewards ──────────────────────────────────────────────────────────────
  const rewardsTab = (
    <View style={[pad, { gap: 12 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: BRAND.amber + '15', borderWidth: 1, borderColor: BRAND.amber + '40' }}>
        <Text style={{ fontSize: 20 }}>🪙</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: BRAND.amber }}>You have {mainCoins} coins to spend</Text>
          <Text style={{ fontSize: 10, color: colors.textSecondary }}>Tap to redeem</Text>
        </View>
        <Pressable onPress={() => router.push('/(tabs)/store' as any)}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND.purple }}>All Rewards →</Text>
        </Pressable>
      </View>

      {eligibleRewards.length > 0 && (
        <>
          <Text style={{ fontSize: 12, fontWeight: '800', color: '#10B981' }}>✅ You can afford these!</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {eligibleRewards.slice(0, 6).map(r => (
              <Pressable key={r.id}
                onPress={() => Alert.alert('Redeem Reward?', `"${r.title}" costs ${r.cost} coins.`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: '🎁 Redeem', onPress: () => redeemReward(r.id, active.id) },
                ])}
                style={{ width: (W - 48) / 2, borderRadius: 18, backgroundColor: isDark ? colors.card : '#fff', borderWidth: 2, borderColor: '#10B98150', padding: 14, gap: 6 }}>
                <Text style={{ fontSize: 32 }}>{r.emoji}</Text>
                <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary }} numberOfLines={2}>{r.title}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 12 }}>🪙</Text>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: BRAND.amber }}>{r.cost}</Text>
                </View>
                <View style={{ borderRadius: 12, paddingVertical: 9, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, backgroundColor: '#10B981' }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>🎁 Redeem</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {almostAffordable.length > 0 && (
        <>
          <Text style={{ fontSize: 12, fontWeight: '800', color: BRAND.amber }}>🎯 Keep earning — almost there!</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {almostAffordable.slice(0, 4).map(r => {
              const pct = Math.min(mainCoins / r.cost, 1);
              return (
                <View key={r.id} style={{ width: (W - 48) / 2, borderRadius: 18, backgroundColor: isDark ? colors.card : '#fff', borderWidth: 1.5, borderColor: isDark ? colors.border : '#E8E8F0', padding: 14, gap: 6 }}>
                  <Text style={{ fontSize: 32 }}>{r.emoji}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary }} numberOfLines={2}>{r.title}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: 12 }}>🪙</Text>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: BRAND.amber }}>{r.cost}</Text>
                  </View>
                  <View style={{ height: 5, borderRadius: 3, backgroundColor: isDark ? '#333' : '#F1F5F9', overflow: 'hidden' }}>
                    <View style={{ height: 5, borderRadius: 3, width: `${Math.round(pct * 100)}%` as any, backgroundColor: BRAND.amber }} />
                  </View>
                  <Text style={{ fontSize: 10, color: colors.textTertiary }}>Need {r.cost - mainCoins} more 🪙</Text>
                </View>
              );
            })}
          </View>
        </>
      )}

      {eligibleRewards.length === 0 && almostAffordable.length === 0 && (
        <View style={{ padding: 28, alignItems: 'center', gap: 10, borderRadius: 18, backgroundColor: isDark ? colors.card : '#fff', borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0' }}>
          <Text style={{ fontSize: 44 }}>🎁</Text>
          <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary }}>Keep earning!</Text>
          <Text style={{ fontSize: 12, color: colors.textTertiary, textAlign: 'center' }}>Complete quests to unlock rewards</Text>
          <Pressable onPress={() => router.push('/(tabs)/quests')} style={{ marginTop: 4, borderRadius: 12, backgroundColor: BRAND.purple, paddingHorizontal: 20, paddingVertical: 10 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>Go do Quests 🏆</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  // ── Kid action-needed panel ────────────────────────────────────────────────
  const kidActionItems: { id: string; emoji: string; title: string; detail: string; accent: string; onAction?: () => void; actionLabel?: string }[] = [];

  // Declined rides today
  myDeclinedRides.forEach(ev => {
    if (!dismissedActions.has(`ride-${ev.id}`)) {
      kidActionItems.push({
        id: `ride-${ev.id}`,
        emoji: '🚗',
        accent: '#EF4444',
        title: `No driver for "${ev.title}"`,
        detail: `${ev.declineReason ? `"${ev.declineReason}" · ` : ''}Your parent is finding someone else.`,
      });
    }
  });

  // Pending ride confirmation — waiting to hear
  myPendingRides.filter(ev => !dismissedActions.has(`pending-${ev.id}`)).forEach(ev => {
    kidActionItems.push({
      id: `pending-${ev.id}`,
      emoji: '⏳',
      accent: BRAND.amber,
      title: `Waiting on driver for "${ev.title}"`,
      detail: `${fmtTime(ev.time)} · Your parent hasn't confirmed yet.`,
    });
  });

  // Declined quests — needs redo or acknowledgement
  declinedQuests.filter(q => !dismissedActions.has(`quest-${q.id}`)).forEach(q => {
    const note = q.history?.slice().reverse().find((h: any) => h.action === 'declined')?.note;
    kidActionItems.push({
      id: `quest-${q.id}`,
      emoji: '🔄',
      accent: BRAND.purple,
      title: `Quest sent back — ${q.title}`,
      detail: note ? `"${note}"` : 'Parent asked you to try again.',
      onAction: () => { router.push('/(tabs)/quests'); setDismissedActions(prev => new Set([...prev, `quest-${q.id}`])); },
      actionLabel: 'View Quest',
    });
  });

  const kidActionPanel = kidActionItems.length > 0 ? (
    <View style={[pad, { marginBottom: 12 }]}>
      <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textTertiary, marginBottom: 8 }}>ACTION NEEDED</Text>
      <View style={{ gap: 8 }}>
        {kidActionItems.map(item => (
          <View key={item.id} style={{
            borderRadius: 14, borderWidth: 1.5, borderColor: item.accent + '35',
            backgroundColor: isDark ? colors.card : item.accent + '08', padding: 12,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <Text style={{ fontSize: 20, marginTop: 1 }}>{item.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: item.accent, marginBottom: 2 }}>
                  {item.title}
                </Text>
                <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, lineHeight: 16 }}>
                  {item.detail}
                </Text>
                {item.onAction && (
                  <Pressable onPress={item.onAction}
                    style={{ alignSelf: 'flex-start', marginTop: 8, backgroundColor: item.accent, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6 }}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>{item.actionLabel}</Text>
                  </Pressable>
                )}
              </View>
              <Pressable onPress={() => setDismissedActions(prev => new Set([...prev, item.id]))}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ padding: 4, borderRadius: 8, backgroundColor: isDark ? '#ffffff12' : '#00000008' }}>
                <Text style={{ fontSize: 12, color: colors.textTertiary }}>✕</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>
    </View>
  ) : null;

  // ── Urgent alerts (driver late + parent replies + action items) ──────────────
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const recentReplies = myRequests.filter(r =>
    ['approved', 'declined'].includes(r.status) &&
    ['permission', 'question', 'medication', 'checkin'].includes(r.type) &&
    r.respondedAt && !dismissedReplies.has(r.id) &&
    new Date(r.respondedAt).getTime() > cutoff
  );

  const urgentAlerts = (
    <View style={[pad, { gap: 8, marginBottom: 4 }]}>
      {/* Driver late */}
      {confirmedRide && rideCountdown !== null && rideCountdown < -5 && (
        <Pressable onPress={() => sendDriverLate(confirmedRide)}
          style={{ borderRadius: 16, backgroundColor: '#450A0A', borderWidth: 2, borderColor: '#EF4444',
            padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: 26 }}>⚠️</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '900', color: '#FCA5A5' }}>Driver hasn't arrived!</Text>
            <Text style={{ fontSize: 12, color: '#F87171' }}>{confirmedRide.helper?.split(' ')[0]} was due at {fmtTime(confirmedRide.time)}</Text>
          </View>
          <View style={{ backgroundColor: '#EF4444', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '900', color: '#fff' }}>{lateNudgeSent[confirmedRide.id] ? 'Sent ✓' : 'Alert!'}</Text>
          </View>
        </Pressable>
      )}
      {/* Declined rides */}
      {myDeclinedRides.filter(ev => !dismissedActions.has(`ride-${ev.id}`)).map(ev => (
        <View key={ev.id} style={{ borderRadius: 16, backgroundColor: isDark ? '#1a0000' : '#FEF2F2',
          borderWidth: 1.5, borderColor: '#EF444450', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: 24 }}>❌</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#EF4444' }}>No driver — {ev.title}</Text>
            <Text style={{ fontSize: 11, color: '#F87171' }}>
              {ev.declinedBy ? `${ev.declinedBy} can't make it` : 'Your parent is finding someone'}
            </Text>
          </View>
          <Pressable onPress={() => setDismissedActions(prev => new Set([...prev, `ride-${ev.id}`]))}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 14, color: colors.textTertiary }}>✕</Text>
          </Pressable>
        </View>
      ))}
      {/* Pending ride */}
      {myPendingRides.filter(ev => !dismissedActions.has(`pending-${ev.id}`)).map(ev => (
        <View key={ev.id} style={{ borderRadius: 16, backgroundColor: isDark ? '#1a1000' : '#FFFBEB',
          borderWidth: 1.5, borderColor: BRAND.amber + '60', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: 24 }}>⏳</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: BRAND.amber }}>Waiting on driver…</Text>
            <Text style={{ fontSize: 11, color: BRAND.amber, opacity: 0.8 }}>{ev.title} · {fmtTime(ev.time)}</Text>
          </View>
          <Pressable onPress={() => setDismissedActions(prev => new Set([...prev, `pending-${ev.id}`]))}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 14, color: colors.textTertiary }}>✕</Text>
          </Pressable>
        </View>
      ))}
      {/* Declined quests */}
      {declinedQuests.filter(q => !dismissedActions.has(`quest-${q.id}`)).map(q => {
        const note = q.history?.slice().reverse().find((h: any) => h.action === 'declined')?.note;
        return (
          <Pressable key={q.id}
            onPress={() => { router.push({ pathname: '/(tabs)/quests', params: { questId: q.id } } as any); setDismissedActions(prev => new Set([...prev, `quest-${q.id}`])); }}
            style={{ borderRadius: 16, backgroundColor: isDark ? '#12001a' : '#F5F3FF',
            borderWidth: 1.5, borderColor: BRAND.purple + '50', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ fontSize: 24 }}>🔄</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: BRAND.purple }}>Quest sent back</Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary }} numberOfLines={1}>
                {note ? `"${note}"` : q.title}
              </Text>
            </View>
            <Pressable
              onPress={event => { event.stopPropagation(); setDismissedActions(prev => new Set([...prev, `quest-${q.id}`])); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: TYPO.body, color: colors.textTertiary }}>✕</Text>
            </Pressable>
          </Pressable>
        );
      })}
      {/* Parent-approved quests — acknowledge once, then jump to the result */}
      {approvedQuests.filter(q => !dismissedActions.has(`quest-approved-${q.id}`)).map(q => (
        <Pressable key={`approved-${q.id}`}
          onPress={() => { router.push({ pathname: '/(tabs)/quests', params: { questId: q.id } } as any); setDismissedActions(prev => new Set([...prev, `quest-approved-${q.id}`])); }}
          style={{ borderRadius: 16, backgroundColor: isDark ? '#052E20' : '#ECFDF5',
            borderWidth: 1.5, borderColor: '#10B98155', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: 24 }}>🎉</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: '#059669' }}>Quest approved!</Text>
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }} numberOfLines={1}>{q.title} · +{q.coins} coins</Text>
          </View>
          <Pressable
            onPress={event => { event.stopPropagation(); setDismissedActions(prev => new Set([...prev, `quest-approved-${q.id}`])); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: TYPO.body, color: colors.textTertiary }}>✕</Text>
          </Pressable>
        </Pressable>
      ))}
      {/* Cheer Squad reactions — celebratory banner with a confetti burst */}
      {cheersForMe.filter(({ quest, cheer }) => !dismissedActions.has(`cheer-${quest.id}-${cheer.memberId}`)).map(({ quest, cheer }) => {
        const cheerer = members.find(m => m.id === cheer.memberId);
        const dismissKey = `cheer-${quest.id}-${cheer.memberId}`;
        return (
          <View key={dismissKey} style={{ position: 'relative' }}>
            <CelebrationBurst visible />
            <Pressable
              onPress={() => setDismissedActions(prev => new Set([...prev, dismissKey]))}
              style={{ borderRadius: 16, backgroundColor: isDark ? '#2D1B69' : '#F5F3FF',
                borderWidth: 1.5, borderColor: BRAND.purple + '55', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={{ fontSize: 24 }}>🥳</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: BRAND.purple }}>
                  {cheerer?.name?.split(' ')[0] ?? 'Someone'} cheered for you!
                </Text>
                <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }} numberOfLines={1}>
                  {quest.title}{cheer.coins ? ` · +${cheer.coins} bonus 🪙` : ''}
                </Text>
              </View>
              <Pressable
                onPress={event => { event.stopPropagation(); setDismissedActions(prev => new Set([...prev, dismissKey])); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontSize: TYPO.body, color: colors.textTertiary }}>✕</Text>
              </Pressable>
            </Pressable>
          </View>
        );
      })}
      {/* Parent replies */}
      {recentReplies.map(r => {
        const approved = r.status === 'approved';
        const isCheckin = r.type === 'checkin';
        const accent = isCheckin ? BRAND.teal : approved ? '#10B981' : '#EF4444';
        const icon = isCheckin ? '👍' : approved ? '✅' : '❌';
        const label = isCheckin ? 'Seen!' : approved ? 'Yes!' : 'No';
        const typeLabel = isCheckin ? 'Check-in' : r.type === 'medication' ? 'Medical' : r.type === 'permission' ? 'Permission' : 'Question';
        
        // Who replied and when
        const responder = r.respondedBy ? members.find(m => m.id === r.respondedBy) : null;
        const responderName = responder ? responder.name.split(' ')[0] : 'Parent';
        let timeAgo = '';
        if (r.respondedAt) {
          const diffMins = Math.floor((Date.now() - new Date(r.respondedAt).getTime()) / 60000);
          if (diffMins < 60) timeAgo = `${diffMins}m ago`;
          else if (diffMins < 1440) timeAgo = `${Math.floor(diffMins / 60)}h ago`;
          else timeAgo = `${Math.floor(diffMins / 1440)}d ago`;
        }
        
        return (
          <View key={r.id} style={{ borderRadius: 16, backgroundColor: isDark ? colors.card : accent + '08',
            borderWidth: 1.5, borderColor: accent + '35', padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <Text style={{ fontSize: 22, marginTop: 1 }}>{icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '900', color: accent }}>{label} — {typeLabel}</Text>
              <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 2 }}>
                {responderName}{timeAgo && ` · ${timeAgo}`}
              </Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }} numberOfLines={2}>"{r.detail}"</Text>
              {r.parentNote ? (
                <Text style={{ fontSize: 11, color: accent, fontStyle: 'italic', marginTop: 4 }}>Parent: "{r.parentNote}"</Text>
              ) : null}
            </View>
            <Pressable onPress={() => setDismissedReplies(prev => new Set([...prev, r.id]))}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 14, color: colors.textTertiary }}>✕</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );

  // ── Check In row — 3 big buttons ─────────────────────────────────────────────
  const checkinRow = (
    <View style={[pad, { marginBottom: 12 }]}>
      <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textTertiary, marginBottom: 8, letterSpacing: 0.5 }}>LET FAMILY KNOW</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {([
          { label: "I'm Home!", emoji: '🏠', color: '#10B981', bg: '#10B98115', border: '#10B98140', onPress: () => sendCheckin('home') },
          { label: "I'm Ready!", emoji: '🎒', color: BRAND.amber, bg: BRAND.amber + '15', border: BRAND.amber + '40', onPress: () => sendCheckin('ready', confirmedRide?.title) },
          { label: 'Running Late', emoji: '🏃', color: '#EF4444', bg: '#EF444415', border: '#EF444440', onPress: () => sendCheckin('late', nextEvent?.title) },
        ] as const).map(({ label, emoji, color, bg, border, onPress }) => (
          <Pressable key={label} onPress={onPress}
            style={{ flex: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center', gap: 5,
              backgroundColor: bg, borderWidth: 1.5, borderColor: border }}>
            <Text style={{ fontSize: 24 }}>{emoji}</Text>
            <Text style={{ fontSize: 10, fontWeight: '900', color, textAlign: 'center' }}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  // ── Ask Parent + Need a Ride — 2 big CTA buttons ─────────────────────────────
  const actionRow = (
    <View style={[pad, { flexDirection: 'row', gap: 10, marginBottom: 16 }]}>
      <Pressable onPress={() => setAskParentSheet(true)}
        style={{ flex: 1, borderRadius: 18, paddingVertical: 18, alignItems: 'center', gap: 6,
          backgroundColor: BRAND.purple, shadowColor: BRAND.purple, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}>
        <Text style={{ fontSize: 28 }}>💬</Text>
        <Text style={{ fontSize: 13, fontWeight: '900', color: '#fff' }}>Ask Parent</Text>
      </Pressable>
      <Pressable onPress={() => setAddEventModal(true)}
        style={{ flex: 1, borderRadius: 18, paddingVertical: 18, alignItems: 'center', gap: 6,
          backgroundColor: isDark ? colors.card : '#fff',
          borderWidth: 2, borderColor: BRAND.teal + '60',
          shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
        <Text style={{ fontSize: 28 }}>🚗</Text>
        <Text style={{ fontSize: 13, fontWeight: '900', color: BRAND.teal }}>Need a Ride?</Text>
      </Pressable>
    </View>
  );

  // ── Confirmed ride banner ─────────────────────────────────────────────────────
  const rideBanner = confirmedRide && rideCountdown !== null && rideCountdown > -10 ? (
    <View style={[pad, { marginBottom: 12 }]}>
      <View style={{ borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: rideHere ? '#064E3B' : rideUrgent ? '#7C2D12' : (isDark ? '#0F2A20' : '#ECFDF5'),
        borderWidth: 1.5, borderColor: rideHere ? '#10B981' : rideUrgent ? '#EF4444' : '#10B98150' }}>
        <Text style={{ fontSize: 28 }}>{rideHere ? '🚨' : '🚗'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '900', color: rideHere ? '#6EE7B7' : rideUrgent ? '#FCA5A5' : '#10B981' }}>
            {rideHere ? `${confirmedRide.helper?.split(' ')[0]} is HERE! 🎉`
              : rideUrgent ? `${confirmedRide.helper?.split(' ')[0]} arrives in ${rideCountdown} min!`
              : `${confirmedRide.helper?.split(' ')[0]} picks you up in ${rideCountdown}m`}
          </Text>
          <Text style={{ fontSize: 11, color: rideHere ? '#34D399' : '#34D399', marginTop: 2 }}>
            {confirmedRide.title} · {fmtTime(confirmedRide.time)}
          </Text>
        </View>
        {rideUrgent && !rideHere && (
          <View style={{ backgroundColor: '#EF4444', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: '900', color: '#fff' }}>Get ready!</Text>
          </View>
        )}
      </View>
    </View>
  ) : null;

  // ── Inline Quests (no tab) ────────────────────────────────────────────────────
  // My Quests is ordered by what needs the kid's attention, not chronology:
  // todo → in progress → submitted (waiting on parent) → bounty pool to claim →
  // approved/cancelled last, since those need no action — just a record.
  const MY_QUESTS_VISIBLE = 6;
  // Once a parent approves it there's nothing left to do — it moves straight
  // to the piggy bank/history instead of lingering in the to-do list.
  // Cancelled ones still stick around for the day so a kid isn't left
  // wondering where a quest went.
  const cancelledQuestsToday = cancelledQuests.filter(q => (q.cancelledAt ?? '').startsWith(today));
  const myQuestsCombined: Quest[] = [
    ...todoQuests,
    ...inProgressQuests,
    ...reviewQuests,
    ...poolQuests,
    ...cancelledQuestsToday,
  ];
  const myQuestsVisible = myQuestsCombined.slice(0, MY_QUESTS_VISIBLE);
  const myQuestsOverflow = myQuestsCombined.length - myQuestsVisible.length;

  const questStatusMeta = (q: Quest) => {
    const isPool = q.isPool && q.status === 'todo';
    if (q.status === 'pending_approval') return { icon: '⏳', label: 'IN REVIEW',  color: BRAND.amber };
    if (q.status === 'approved' || q.status === 'done') return { icon: '✅', label: 'APPROVED',  color: '#10B981' };
    if (q.status === 'cancelled') return { icon: '🚫', label: 'CANCELLED', color: '#EF4444' };
    if (q.status === 'in_progress') return { icon: '⚡', label: 'IN PROGRESS', color: BRAND.teal };
    if (q.status === 'claimed') return { icon: '⚡', label: 'CLAIMED', color: BRAND.teal };
    if (isPool) return { icon: '💰', label: 'BOUNTY', color: '#10B981' };
    return { icon: '📋', label: 'TO DO', color: BRAND.purple };
  };

  const inlineQuests = (
    <View style={pad}>
      <View style={{ borderRadius: 20, borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0',
        backgroundColor: isDark ? colors.card : '#fff', overflow: 'hidden', marginBottom: 16 }}>
        {/* Header — same model as "Who Needs Help?" in the parent Hub */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: BRAND.purple + '20', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 18 }}>🏆</Text>
          </View>
          <Pressable onPress={() => setMyQuestsExpanded(e => !e)} style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary }}>My Quests</Text>
              {myQuestsCombined.length > 0 && (
                <View style={{ backgroundColor: BRAND.purple, borderRadius: 10, minWidth: 20, paddingHorizontal: 6, paddingVertical: 2, alignItems: 'center' }}>
                  <Text style={{ fontSize: 10, fontWeight: '900', color: '#fff' }}>{myQuestsCombined.length}</Text>
                </View>
              )}
            </View>
            <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
              {myQuestsCombined.length > 0 ? `${myQuestsCombined.length} quest${myQuestsCombined.length !== 1 ? 's' : ''} — what to do first` : 'All caught up'}
            </Text>
          </Pressable>
          <Pressable onPress={() => router.push('/(tabs)/quests')}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: BRAND.purple }}>All Quests →</Text>
          </Pressable>
          <Pressable onPress={() => setMyQuestsExpanded(e => !e)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            {myQuestsExpanded ? <ChevronUp size={18} color={colors.textTertiary} /> : <ChevronDown size={18} color={colors.textTertiary} />}
          </Pressable>
        </View>

        {myQuestsExpanded && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 8 }}>
            {myQuestsCombined.length === 0 ? (
              <Pressable onPress={() => router.push('/(tabs)/quests')}
                style={{ borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: BRAND.purple + '50',
                  backgroundColor: BRAND.purple + '08', padding: 28, alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 40 }}>🏆</Text>
                <Text style={{ fontSize: 15, fontWeight: '900', color: BRAND.purple }}>All caught up!</Text>
                <Text style={{ fontSize: 12, color: colors.textTertiary, textAlign: 'center' }}>
                  {poolQuests.length > 0 ? `${poolQuests.length} bounty quests up for grabs 💰` : 'Complete quests to earn coins'}
                </Text>
              </Pressable>
            ) : myQuestsVisible.map(q => {
              const isPool = q.isPool && q.status === 'todo';
              const isClaimed = q.status === 'claimed';
              const isActionable = ['todo', 'claimed', 'in_progress'].includes(q.status);
              const meta = questStatusMeta(q);
              // A grandparent quest waits on the kid's yes/no before it counts as started.
              const isGpTodo = q.questType === 'grandparent_quest' && q.status === 'todo' && !isPool;
              const teamMates = q.teamGroupId
                ? quests.filter(t => t.teamGroupId === q.teamGroupId && t.id !== q.id)
                : [];
              return (
                <CollapsibleCard key={q.id} accent={meta.color} colors={colors} isDark={isDark} defaultExpanded={false}
                  summary={
                    <View style={{ gap: 6 }}>
                      <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{q.title}</Text>
                      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                        <View style={{ backgroundColor: BRAND.amber + '20', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, flexDirection: 'row', gap: 3, alignItems: 'center' }}>
                          <Text style={{ fontSize: 10 }}>🪙</Text>
                          <Text style={{ fontSize: 11, fontWeight: '800', color: BRAND.amber }}>{q.coins}</Text>
                        </View>
                        <View style={{ backgroundColor: meta.color + '20', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: meta.color }}>{meta.icon} {meta.label}</Text>
                        </View>
                        {(q.status === 'approved' || q.status === 'done') && q.approvedAt && (
                          <Text style={{ fontSize: 11, color: colors.textTertiary }}>{fmtDateTime(q.approvedAt)}</Text>
                        )}
                        {q.status === 'cancelled' && q.cancelledAt && (
                          <Text style={{ fontSize: 11, color: colors.textTertiary }}>{fmtDateTime(q.cancelledAt)}</Text>
                        )}
                      </View>
                    </View>
                  }>
                  {q.description ? (
                    <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontStyle: 'italic', lineHeight: 18 }}>"{q.description}"</Text>
                  ) : null}
                  {q.status === 'pending_approval' && (
                    <Text style={{ fontSize: TYPO.body, color: BRAND.amber }}>Waiting on a parent to review this quest.</Text>
                  )}
                  {q.teamGroupId && teamMates.length > 0 && (
                    <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: BRAND.amber }}>
                      🎯 Also offered to {teamMates.map(t => members.find(m => m.id === t.assignedToId)?.name.split(' ')[0] ?? 'a sibling').join(' & ')} — everyone who finishes gets the full {q.coins} 🪙
                    </Text>
                  )}
                  {isActionable && (
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {isGpTodo ? (
                        <>
                          <Pressable onPress={() => startGrandparentQuest(q.id, active.id)}
                            style={{ flex: 2, borderRadius: 10, backgroundColor: '#10B981', paddingVertical: 10, alignItems: 'center' }}>
                            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>🙌 I'll take it</Text>
                          </Pressable>
                          <Pressable onPress={() => { setDeclineQuest({ id: q.id, title: q.title }); setDeclineNote(''); }}
                            style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: '#EF444450', paddingVertical: 10, alignItems: 'center' }}>
                            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#EF4444' }}>Decline</Text>
                          </Pressable>
                        </>
                      ) : isPool ? (
                        <Pressable onPress={() => claimQuest(q.id, active.id)}
                          style={{ flex: 1, borderRadius: 10, backgroundColor: BRAND.purple, paddingVertical: 10, alignItems: 'center' }}>
                          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>🏆 Claim (+{q.coins} 🪙)</Text>
                        </Pressable>
                      ) : isClaimed ? (
                        <Pressable onPress={() => submitQuest(q.id)}
                          style={{ flex: 1, borderRadius: 10, backgroundColor: BRAND.teal, paddingVertical: 10, alignItems: 'center' }}>
                          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>⚡ Start Quest</Text>
                        </Pressable>
                      ) : (
                        <Pressable onPress={() => handleSubmitTap(q)}
                          style={{ flex: 1, borderRadius: 10, backgroundColor: '#10B981', paddingVertical: 10, alignItems: 'center' }}>
                          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>
                            {q.photoRequired ? '📸 Take Photo to Get Paid' : '✅ Mark Done → Get Paid'}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </CollapsibleCard>
              );
            })}
            {myQuestsOverflow > 0 && (
              <Pressable onPress={() => router.push('/(tabs)/quests')}
                style={{ borderRadius: 14, backgroundColor: BRAND.purple + '12', borderWidth: 1, borderColor: BRAND.purple + '30',
                  paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: BRAND.purple }}>+{myQuestsOverflow} more quests →</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );

  // ── More row: Schedule, Piggy Bank, Rewards, History ─────────────────────────
  const moreRow = (
    <View style={[pad, { marginBottom: 16, gap: 10 }]}>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {([
          { icon: '🐷', label: 'Piggy Bank',   color: BRAND.amber,  bg: BRAND.amber + '15',  onPress: () => setPiggyBankModal(true) },
          { icon: '🎁', label: 'Rewards',      color: '#EC4899',    bg: '#EC489915',          onPress: () => router.push('/(tabs)/store' as any) },
          { icon: '📋', label: 'My Requests',  color: BRAND.purple, bg: BRAND.purple + '12', onPress: () => setHistoryModal(true) },
          { icon: '🗓', label: 'Full Calendar', color: BRAND.teal,   bg: BRAND.teal + '12',   onPress: () => router.push('/(tabs)/calendar') },
        ] as const).map(({ icon, label, color, bg, onPress }) => (
          <Pressable key={label} onPress={onPress}
            style={{ flex: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center', gap: 5,
              backgroundColor: bg, borderWidth: 1, borderColor: color + '30' }}>
            <Text style={{ fontSize: 20 }}>{icon}</Text>
            <Text style={{ fontSize: 9, fontWeight: '800', color, textAlign: 'center' }}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  // ── Family leaderboard ────────────────────────────────────────────────────────
  const leaderboard = siblingKids.length > 0 ? (
    <View style={[pad, { marginBottom: 16 }]}>
      <View style={{ borderRadius: 18, backgroundColor: isDark ? colors.card : '#fff',
        borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0', padding: 14, gap: 10 }}>
        <Text style={{ fontSize: 13, fontWeight: '900', color: colors.textPrimary }}>🏅 Family Leaderboard</Text>
        {allKids.map((k, i) => {
          const isMe = k.id === active.id;
          const kCoins = k.mainCoins ?? k.coins ?? 0;
          const medals = ['🥇', '🥈', '🥉'];
          return (
            <View key={k.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 12,
              backgroundColor: isMe ? BRAND.purple + '18' : 'transparent', borderWidth: isMe ? 1.5 : 0, borderColor: BRAND.purple + '40' }}>
              <Text style={{ fontSize: 18, width: 26 }}>{medals[i] ?? `${i + 1}.`}</Text>
              <FamilyAvatar name={k.name} emoji={k.emoji} avatarUrl={(k as any).avatarUrl} size={30}
                ringColor={BRAND.purple} ringWidth={isMe ? 2 : 0} />
              <Text style={{ flex: 1, fontSize: 13, fontWeight: isMe ? '900' : '700', color: isMe ? BRAND.purple : colors.textPrimary }}>
                {k.name.split(' ')[0]}{isMe ? ' (you)' : ''}
              </Text>
              <Text style={{ fontSize: 14, fontWeight: '800', color: BRAND.amber }}>🪙 {kCoins}</Text>
              {k.streak > 0 && <Text style={{ fontSize: 11, color: '#FF6600' }}>🔥{k.streak}d</Text>}
            </View>
          );
        })}
      </View>
    </View>
  ) : null;

  // ── Cheer Squad — cheer siblings' recently completed quests ──────────────────
  const cheerSquad = siblingCheerable.length > 0 ? (
    <View style={[pad, { marginBottom: 16 }]}>
      <View style={{ borderRadius: 18, backgroundColor: isDark ? colors.card : '#fff',
        borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0', padding: 14, gap: 10 }}>
        <Text style={{ fontSize: 13, fontWeight: '900', color: colors.textPrimary }}>🎉 Cheer Squad</Text>
        {siblingCheerable.map(q => {
          const sib = siblingKids.find(s => s.id === q.assignedToId);
          return (
            <View key={q.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14,
              backgroundColor: isDark ? '#052E16' : '#F0FDF4', borderWidth: 1, borderColor: '#10B98130', padding: 10 }}>
              <FamilyAvatar name={sib?.name ?? 'Kid'} emoji={sib?.emoji} avatarUrl={(sib as any)?.avatarUrl} size={30}
                ringColor="#10B981" ringWidth={0} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textPrimary }} numberOfLines={1}>{q.title}</Text>
                <Text style={{ fontSize: 10, color: '#10B981' }}>{sib?.name?.split(' ')[0] ?? 'They'} finished it! ✅</Text>
              </View>
              <Pressable
                onPress={() => cheerQuest(q.id, active.id)}
                style={{ borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#10B981' }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>🎉 Cheer</Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  ) : null;

  // ── Decline a grandparent quest, with a note back to GP + parent ─────────────
  const declineSheetEl = (
    <AppBottomSheet
      visible={!!declineQuest}
      onClose={() => setDeclineQuest(null)}
      title="Not this one?"
      subtitle={declineQuest?.title}
      accentColor="#EF4444"
      minHeight="45%"
      bodyPaddingBottom={16}
    >
      <View style={{ gap: 12 }}>
        <Text style={{ fontSize: 13, color: colors.textSecondary }}>
          Tell them why — it goes back to whoever set the quest, and a grown-up can reassign it.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {['Too busy today', 'Need help with it', "Already done", 'Not sure how'].map(preset => (
            <Pressable key={preset} onPress={() => setDeclineNote(preset)}
              style={{ borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8,
                backgroundColor: declineNote === preset ? '#EF4444' : (isDark ? colors.surface : '#FEF2F2'),
                borderWidth: 1.5, borderColor: declineNote === preset ? '#EF4444' : '#EF444430' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: declineNote === preset ? '#fff' : '#EF4444' }}>{preset}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ borderRadius: 12, borderWidth: 1.5, borderColor: isDark ? colors.border : '#E8E8F0',
          backgroundColor: isDark ? colors.surface : '#FAFAFA', paddingHorizontal: 12, paddingVertical: 10 }}>
          <TextInput value={declineNote} onChangeText={setDeclineNote}
            placeholder="Add your own reason…" placeholderTextColor={colors.textTertiary}
            style={{ fontSize: 14, color: colors.textPrimary, minHeight: 44 }} multiline />
        </View>
        <Pressable
          disabled={!declineNote.trim()}
          onPress={() => {
            if (!declineQuest) return;
            const note = declineNote.trim();
            declineGrandparentQuest(declineQuest.id, active.id, note);
            // Family chat is where both the parent and the sponsoring GP will
            // see it — the chore's rejectionReason alone reaches neither.
            const sponsor = useChoreStore.getState().chores.find(c => c.id === declineQuest.id)?.sponsorUserId;
            const sponsorName = members.find(m => m.id === sponsor)?.name.split(' ')[0];
            sendMessage('all', active.id,
              `🙏 ${active.name.split(' ')[0]} can't take "${declineQuest.title}"${sponsorName ? ` from ${sponsorName}` : ''} — "${note}"`);
            setDeclineQuest(null);
            setDeclineNote('');
          }}
          style={{ borderRadius: 14, paddingVertical: 14, alignItems: 'center',
            backgroundColor: declineNote.trim() ? '#EF4444' : colors.border,
            opacity: declineNote.trim() ? 1 : 0.5 }}>
          <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>Send it back</Text>
        </Pressable>
      </View>
    </AppBottomSheet>
  );

  // A quest without photoRequired submits immediately; one that requires it
  // opens the capture sheet instead — "Take Photo to Get Paid" has to mean it.
  const handleSubmitTap = (q: Quest) => {
    if (q.photoRequired) {
      setSubmitProofQuest(q);
      setSubmitProofUri(null);
      setSubmitProofNote('');
    } else {
      submitQuest(q.id);
    }
  };

  const pickSubmitProof = async (fromCamera: boolean) => {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permission needed', `Allow ${fromCamera ? 'camera' : 'photo library'} access to attach proof.`);
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [4, 3], quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [4, 3], quality: 0.7 });
    if (!result.canceled && result.assets[0]) setSubmitProofUri(result.assets[0].uri);
  };

  // ── Photo-proof submission sheet ──────────────────────────────────────────────
  const submitProofSheetEl = (
    <AppBottomSheet
      visible={!!submitProofQuest}
      onClose={() => setSubmitProofQuest(null)}
      title="📸 Photo Proof"
      subtitle={submitProofQuest?.title}
      accentColor="#10B981"
      minHeight="55%"
      bodyPaddingBottom={16}
    >
      <View style={{ gap: 12 }}>
        <Text style={{ fontSize: 13, color: colors.textSecondary }}>
          This quest needs a photo before it can be marked done.
        </Text>
        {submitProofUri ? (
          <View style={{ borderRadius: 16, overflow: 'hidden', borderWidth: 1.5, borderColor: '#10B98150' }}>
            <Image source={{ uri: submitProofUri }} style={{ width: '100%', height: 200 }} resizeMode="cover" />
            <Pressable onPress={() => pickSubmitProof(true)}
              style={{ position: 'absolute', top: 8, right: 8, backgroundColor: '#00000090', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>Retake</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={() => pickSubmitProof(true)}
              style={{ flex: 1, borderRadius: 14, paddingVertical: 20, alignItems: 'center', gap: 6,
                borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#10B98160', backgroundColor: '#10B98110' }}>
              <Text style={{ fontSize: 24 }}>📷</Text>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#10B981' }}>Take Photo</Text>
            </Pressable>
            <Pressable onPress={() => pickSubmitProof(false)}
              style={{ flex: 1, borderRadius: 14, paddingVertical: 20, alignItems: 'center', gap: 6,
                borderWidth: 1.5, borderStyle: 'dashed', borderColor: isDark ? colors.border : '#E2E8F0', backgroundColor: isDark ? colors.surface : '#FAFAFA' }}>
              <Text style={{ fontSize: 24 }}>🖼️</Text>
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textSecondary }}>Choose Photo</Text>
            </Pressable>
          </View>
        )}
        <View style={{ borderRadius: 12, borderWidth: 1.5, borderColor: isDark ? colors.border : '#E8E8F0',
          backgroundColor: isDark ? colors.surface : '#FAFAFA', paddingHorizontal: 12, paddingVertical: 10 }}>
          <TextInput value={submitProofNote} onChangeText={setSubmitProofNote}
            placeholder="Add a note (optional)…" placeholderTextColor={colors.textTertiary}
            style={{ fontSize: 14, color: colors.textPrimary, minHeight: 40 }} multiline />
        </View>
        <Pressable
          disabled={!submitProofUri}
          onPress={() => {
            if (!submitProofQuest || !submitProofUri) return;
            submitQuest(submitProofQuest.id, { photoUrl: submitProofUri, note: submitProofNote.trim() || undefined });
            setSubmitProofQuest(null);
          }}
          style={{ borderRadius: 14, paddingVertical: 14, alignItems: 'center',
            backgroundColor: submitProofUri ? '#10B981' : colors.border,
            opacity: submitProofUri ? 1 : 0.5 }}>
          <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>✅ Submit for Review</Text>
        </Pressable>
      </View>
    </AppBottomSheet>
  );

  // ── Ask Parent sheet — picker ─────────────────────────────────────────────────
  const askParentSheetEl = (
    <AppBottomSheet
      visible={askParentSheet}
      onClose={() => setAskParentSheet(false)}
      title="💬 Ask Parent"
      subtitle="Pick what you need help with"
      accentColor={BRAND.purple}
      minHeight="55%"
      bodyPaddingBottom={16}
    >
      <View style={{ gap: 10 }}>
        {([
          { label: 'Ask Permission',   desc: 'Go somewhere, do something',     emoji: '🔓', color: BRAND.purple,  onPress: () => { setAskParentSheet(false); setTimeout(() => setAskModal('permission'), 300); } },
          { label: 'Ask a Question',   desc: 'Something you want to know',     emoji: '❓', color: '#3B82F6',     onPress: () => { setAskParentSheet(false); setTimeout(() => setAskModal('question'), 300); } },
          { label: 'Medication Alert', desc: "I didn't take my meds",          emoji: '💊', color: '#EF4444',     onPress: () => { setAskParentSheet(false); setTimeout(() => setAskModal('medication'), 300); } },
          { label: 'Request Grocery',  desc: 'Add items to the shopping list', emoji: '🛒', color: BRAND.teal,    onPress: () => { setAskParentSheet(false); setTimeout(() => setGroceryModal(true), 300); } },
          { label: 'School Supplies',  desc: 'Things I need for school',       emoji: '📚', color: '#6366F1',     onPress: () => { setAskParentSheet(false); setTimeout(() => setSuppliesModal(true), 300); } },
        ] as const).map(({ label, desc, emoji, color, onPress }) => (
          <Pressable key={label} onPress={onPress}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16,
              backgroundColor: isDark ? colors.surface : color + '08', borderWidth: 1.5, borderColor: color + '30' }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: color + '20', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 24 }}>{emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '900', color }}>{label}</Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{desc}</Text>
            </View>
            <ChevronRight size={18} color={color} />
          </Pressable>
        ))}
      </View>
    </AppBottomSheet>
  );

  return (
    <>
      {heroCard}
      {urgentAlerts}
      {rideBanner}
      {checkinRow}
      {actionRow}
      {inlineQuests}
      <View style={pad}>
        <SchoolScheduleCard
          memberId={active.id}
          memberName={active.name.split(' ')[0]}
          isParent={false}
          colors={colors}
          isDark={isDark}
        />
      </View>
      {moreRow}
      {leaderboard}
      {cheerSquad}

      {askParentSheetEl}
      {declineSheetEl}
      {submitProofSheetEl}
      <GroceryModal  visible={groceryModal}  onClose={() => setGroceryModal(false)}  active={active} />
      <SuppliesModal visible={suppliesModal} onClose={() => setSuppliesModal(false)} active={active} />
      {askModal && <AskModal visible={!!askModal} onClose={() => setAskModal(null)} type={askModal} active={active} />}
      <KidRequestHistoryModal visible={historyModal} onClose={() => setHistoryModal(false)} active={active} />
      {piggyBankSheet}
      <AddEventModal visible={addEventModal} onClose={() => setAddEventModal(false)} activeMemberId={active.id} />
    </>
  );
}
