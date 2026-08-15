import { useState, useEffect } from 'react';
import { View, Text, Pressable, TouchableOpacity, Alert, Dimensions, ScrollView } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { router } from 'expo-router';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO } from '@/constants/theme';
import { useQuestStore } from '@/store/questStore';
import { useEventStore } from '@/store/eventStore';
import { useRewardStore } from '@/store/rewardStore';
import { useFamilyStore } from '@/store/familyStore';
import type { FamilyMember } from '@/store/familyStore';
import { useKidRequestStore } from '@/store/kidRequestStore';
import { useChatStore } from '@/store/chatStore';
import { localToday, fmtTime, catColor, hoursUntilEvent } from './hubUtils';

const { width: W } = Dimensions.get('window');

type KidTab = 'quests' | 'schedule' | 'piggybank' | 'rewards';

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
import { SUPPLIES_PREFIX } from './KidModals';

import { GroceryModal, SuppliesModal, AskModal, KidRequestHistoryModal } from './KidModals';


// ─── Main KidView ──────────────────────────────────────────────────────────────
export function KidView({ active, members, colors, isDark, onHelpRequest }: {
  active: FamilyMember; members: FamilyMember[];
  colors: any; isDark: boolean;
  onHelpRequest: () => void;
}) {
  const { quests, submitQuest, claimQuest, reopenQuest } = useQuestStore();
  const { events }                                        = useEventStore();
  const { rewards, redeemReward, getEligibleRewards }    = useRewardStore();
  const { sendRequest, requests }                         = useKidRequestStore();
  const { sendMessage }                                   = useChatStore();

  const [kidTab, setKidTab]           = useState<KidTab>('quests');
  const [groceryModal,  setGroceryModal]  = useState(false);
  const [suppliesModal, setSuppliesModal] = useState(false);
  const [askModal, setAskModal]           = useState<null | 'permission' | 'question' | 'medication'>(null);
  const [historyModal,  setHistoryModal]  = useState(false);
  const [lateNudgeSent, setLateNudgeSent] = useState<Record<string, boolean>>({});
  const [dismissedReplies,  setDismissedReplies]  = useState<Set<string>>(new Set());
  const [dismissedActions,  setDismissedActions]  = useState<Set<string>>(new Set());

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
  const reviewQuests   = myQuests.filter(q => q.status === 'pending_approval');
  const declinedQuests = myQuests.filter(q => q.status === 'declined');
  const doneToday      = myQuests.filter(q => ['approved','done'].includes(q.status)).length;
  const questGoal      = Math.max(myQuests.length, 3);
  const questPct       = Math.min(doneToday / questGoal, 1);

  const siblingKids       = members.filter(m => m.role === 'kid' && m.id !== active.id);
  const allKids           = [active, ...siblingKids].sort((a, b) => (b.mainCoins ?? b.coins ?? 0) - (a.mainCoins ?? a.coins ?? 0));
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
    sendRequest({ type: 'emergency', fromMemberId: active.id, urgency: 'urgent',
      detail: `My driver ${ev.helper ?? ''} hasn't arrived yet for "${ev.title}" (was ${fmtTime(ev.time)})` });
    sendMessage('all', active.id, `⚠️ ${active.name.split(' ')[0]}: My driver hasn't arrived yet for "${ev.title}"! Can someone check?`);
    setLateNudgeSent(p => ({ ...p, [ev.id]: true }));
    Alert.alert('⚠️ Alert sent!', 'Your parent has been notified that your driver is late.');
  };

  const TABS = [
    { key: 'quests' as KidTab,    label: 'Quests',     icon: '🏆', color: BRAND.purple },
    { key: 'schedule' as KidTab,  label: 'Schedule',   icon: '📅', color: BRAND.teal   },
    { key: 'piggybank' as KidTab, label: 'Piggy Bank', icon: '🐷', color: BRAND.amber  },
    { key: 'rewards' as KidTab,   label: 'Rewards',    icon: '🎁', color: '#EC4899'    },
  ];

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

        {/* Quick actions: I'm Home / I'm Ready / Running Late */}
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 14 }}>
          <Pressable onPress={() => sendCheckin('home')}
            style={{ flex: 1, borderRadius: 14, backgroundColor: '#10B98118', borderWidth: 1.5, borderColor: '#10B98140', paddingVertical: 10, alignItems: 'center', gap: 3 }}>
            <Text style={{ fontSize: 18 }}>🏠</Text>
            <Text style={{ fontSize: 10, fontWeight: '800', color: '#10B981' }}>I'm Home</Text>
          </Pressable>
          <Pressable onPress={() => sendCheckin('ready', confirmedRide?.title)}
            style={{ flex: 1, borderRadius: 14, backgroundColor: BRAND.amber + '18', borderWidth: 1.5, borderColor: BRAND.amber + '40', paddingVertical: 10, alignItems: 'center', gap: 3 }}>
            <Text style={{ fontSize: 18 }}>🎒</Text>
            <Text style={{ fontSize: 10, fontWeight: '800', color: BRAND.amber }}>I'm Ready</Text>
          </Pressable>
          <Pressable onPress={() => sendCheckin('late', nextEvent?.title)}
            style={{ flex: 1, borderRadius: 14, backgroundColor: '#EF444418', borderWidth: 1.5, borderColor: '#EF444440', paddingVertical: 10, alignItems: 'center', gap: 3 }}>
            <Text style={{ fontSize: 18 }}>🏃</Text>
            <Text style={{ fontSize: 10, fontWeight: '800', color: '#EF4444' }}>Running Late</Text>
          </Pressable>
          <Pressable onPress={() => setGroceryModal(true)}
            style={{ flex: 1, borderRadius: 14, backgroundColor: BRAND.teal + '18', borderWidth: 1.5, borderColor: BRAND.teal + '40', paddingVertical: 10, alignItems: 'center', gap: 3 }}>
            <Text style={{ fontSize: 18 }}>🛒</Text>
            <Text style={{ fontSize: 10, fontWeight: '800', color: BRAND.teal }}>Grocery</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  // ── Tab pills ───────────────────────────────────────────────────────────────
  const tabPills = (
    <View style={[pad, { marginBottom: 14 }]}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {TABS.map(t => {
          const isActive = kidTab === t.key;
          return (
            <Pressable key={t.key} onPress={() => setKidTab(t.key)} style={{
              flex: 1, borderRadius: 16, paddingVertical: 9, alignItems: 'center', gap: 3,
              backgroundColor: isActive ? t.color + '22' : (isDark ? colors.card : '#FFFFFF'),
              borderWidth: 1.5, borderColor: isActive ? t.color + '70' : (isDark ? colors.border : '#E8E8F0'),
            }}>
              <Text style={{ fontSize: 16 }}>{t.icon}</Text>
              <Text style={{ fontSize: 9, fontWeight: '800', color: isActive ? t.color : colors.textTertiary }}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  // ── Ask parent quick bar ─────────────────────────────────────────────────────
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
                <Text style={{ fontSize: 18 }}>{k.emoji ?? '👤'}</Text>
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
          <Pressable onPress={() => reopenQuest(q.id, active.id)}
            style={{ borderRadius: 10, backgroundColor: BRAND.purple, paddingVertical: 9, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            <Text style={{ fontSize: 14 }}>🔄</Text>
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>Try Again</Text>
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
                </View>
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
            {isPool ? (
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
              <Pressable onPress={() => submitQuest(q.id)}
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

  // ── Tab: Piggy Bank ───────────────────────────────────────────────────────────
  const piggyBankTab = (
    <View style={[pad, { gap: 12 }]}>
      <View style={{ borderRadius: 24, padding: 24, alignItems: 'center', gap: 8, backgroundColor: isDark ? '#1A1000' : '#FFF8E8', borderWidth: 1.5, borderColor: BRAND.amber + '50' }}>
        <Text style={{ fontSize: 52 }}>🐷</Text>
        <Text style={{ fontSize: 52, fontWeight: '900', color: BRAND.amber, lineHeight: 60 }}>{mainCoins}</Text>
        <Text style={{ fontSize: 13, color: colors.textTertiary, fontWeight: '600' }}>Main Store Coins</Text>
        {gpCoins > 0 && (
          <View style={{ backgroundColor: BRAND.purple + '20', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 6, marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 13 }}>⭐</Text>
            <Text style={{ fontSize: 13, fontWeight: '800', color: BRAND.purple }}>+{gpCoins} Grandparent Bonus</Text>
          </View>
        )}
      </View>

      <View style={{ borderRadius: 16, padding: 16, backgroundColor: isDark ? colors.card : '#fff', borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0', gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: colors.textSecondary }}>Main coins</Text>
          <Text style={{ fontSize: 16, fontWeight: '900', color: '#10B981' }}>${(mainCoins * COIN_VAL).toFixed(2)}</Text>
        </View>
        {gpCoins > 0 && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 12, color: colors.textSecondary }}>GP bonus</Text>
            <Text style={{ fontSize: 14, fontWeight: '800', color: BRAND.purple }}>${(gpCoins * COIN_VAL).toFixed(2)}</Text>
          </View>
        )}
        <View style={{ height: 1, backgroundColor: isDark ? colors.border : '#F1F5F9' }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>Total 💰</Text>
          <Text style={{ fontSize: 20, fontWeight: '900', color: BRAND.amber }}>${((mainCoins + gpCoins) * COIN_VAL).toFixed(2)}</Text>
        </View>
      </View>

      {almostAffordable.length > 0 && (
        <View style={{ borderRadius: 16, padding: 14, backgroundColor: isDark ? colors.card : '#fff', borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0', gap: 10 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textPrimary }}>🎯 Almost there!</Text>
          {almostAffordable.slice(0, 2).map(r => {
            const pct = Math.min(mainCoins / r.cost, 1);
            return (
              <View key={r.id} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, color: colors.textSecondary }}>{r.emoji} {r.title}</Text>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND.amber }}>Need {r.cost - mainCoins} more 🪙</Text>
                </View>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: isDark ? colors.surface : '#F1F5F9', overflow: 'hidden' }}>
                  <View style={{ height: 6, borderRadius: 3, width: `${Math.round(pct * 100)}%` as any, backgroundColor: BRAND.amber }} />
                </View>
              </View>
            );
          })}
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {[
          { icon: '✅', value: doneToday,    label: 'Done Today', color: '#10B981' },
          { icon: '🔥', value: streak,       label: 'Day Streak', color: '#FF6600' },
          { icon: '⚡', value: `Lv ${level}`, label: 'Level',     color: BRAND.purple },
        ].map(({ icon, value, label, color }) => (
          <View key={label} style={{ flex: 1, borderRadius: 14, padding: 14, backgroundColor: isDark ? colors.card : '#fff', borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0', alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 22 }}>{icon}</Text>
            <Text style={{ fontSize: 18, fontWeight: '900', color }}>{value}</Text>
            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textTertiary }}>{label}</Text>
          </View>
        ))}
      </View>

      <View style={{ borderRadius: 16, padding: 14, backgroundColor: BRAND.teal + '12', borderWidth: 1, borderColor: BRAND.teal + '40' }}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: BRAND.teal, marginBottom: 4 }}>💡 How cash-outs work</Text>
        <Text style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 18 }}>
          10 Coins = $1.00 real allowance! Ask at{' '}
          <Text style={{ fontWeight: '700', color: colors.textPrimary }}>Friday Family Dinner</Text>
          {' '}to cash out.
        </Text>
      </View>
    </View>
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
          <Pressable onPress={() => setKidTab('quests')} style={{ marginTop: 4, borderRadius: 12, backgroundColor: BRAND.purple, paddingHorizontal: 20, paddingVertical: 10 }}>
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
      onAction: () => { setKidTab('quests'); setDismissedActions(prev => new Set([...prev, `quest-${q.id}`])); },
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

  return (
    <>
      {heroCard}
      {kidActionPanel}
      {tabPills}
      {askBar}
      {kidTab === 'quests'    && questsTab}
      {kidTab === 'schedule'  && scheduleTab}
      {kidTab === 'piggybank' && piggyBankTab}
      {kidTab === 'rewards'   && rewardsTab}

      <GroceryModal  visible={groceryModal}  onClose={() => setGroceryModal(false)}  active={active} />
      <SuppliesModal visible={suppliesModal} onClose={() => setSuppliesModal(false)} active={active} />
      {askModal && (
        <AskModal visible={!!askModal} onClose={() => setAskModal(null)} type={askModal} active={active} />
      )}
      <KidRequestHistoryModal visible={historyModal} onClose={() => setHistoryModal(false)} active={active} />
    </>
  );
}
