import { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  Animated, Image, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { TYPO, RADIUS } from '@/constants/theme';
import { useNotifStore } from '@/store/notifStore';
import { useGroceryStore } from '@/store/groceryStore';
import PinEntryModal from '@/components/PinEntryModal';
import type { FamilyMember } from '@/store/familyStore';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ─── Shared: member avatar row at top ────────────────────────────────────────

function MemberRow({ members, activeMemberId, onSelect }: {
  members: FamilyMember[];
  activeMemberId: string | null;
  onSelect: (m: FamilyMember) => void;
}) {
  const { colors } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingRight: 8 }}>
      {members.map(m => {
        const active = m.id === activeMemberId;
        const accent = m.role === 'parent' ? colors.parent : colors.kid;
        return (
          <Pressable key={m.id} onPress={() => onSelect(m)} style={{ alignItems: 'center', gap: 5 }}>
            <View style={{
              width: 52, height: 52, borderRadius: 26,
              backgroundColor: active ? (m.role === 'parent' ? colors.parentLight : colors.kidLight) : colors.surface,
              borderWidth: active ? 2.5 : 1.5,
              borderColor: active ? accent : colors.border,
              alignItems: 'center', justifyContent: 'center',
            }}>
              {m.avatarUrl
                ? <Image source={{ uri: m.avatarUrl }} style={{ width: 44, height: 44, borderRadius: 22 }} />
                : <Text style={{ fontSize: 24 }}>{m.emoji ?? m.name[0]}</Text>}
            </View>
            <Text style={{ fontSize: 11, fontWeight: active ? '700' : '500', color: active ? accent : colors.textSecondary }}>
              {m.name.split(' ')[0]}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ─── Parent hub ───────────────────────────────────────────────────────────────

function ParentHub({ active, members, colors }: { active: FamilyMember; members: FamilyMember[]; colors: any }) {
  const { items: groceryItems, load: loadGrocery } = useGroceryStore();
  useEffect(() => { loadGrocery('family-1'); }, []);
  // Derive pending approvals from kids' questsPending
  const pendingApprovals = members.filter(m => m.role === 'kid').reduce((s, m) => s + m.questsPending, 0);
  const kidsCount = members.filter(m => m.role === 'kid').length;

  // Today events — stub (3 items)
  const todayEvents = [
    { time: '08:30 AM', title: 'Leo — School drop-off', color: colors.teal },
    { time: '03:45 PM', title: 'Leo — Football practice', color: colors.amber },
    { time: '06:30 PM', title: 'Family dinner', color: colors.primary },
  ];

  // In-review tasks — stub
  const inReview = [
    { id: '1', title: 'Wash the dishes', who: 'Leo', coins: 30 },
    { id: '2', title: 'Take out the trash', who: 'Leo', coins: 20 },
  ];

  return (
    <>
      {/* ── Pending approvals banner (shown only when > 0) ── */}
      {pendingApprovals > 0 && (
        <View style={{ marginHorizontal: 20, marginBottom: 16 }}>
          <View style={[styles.approvalBanner, { backgroundColor: colors.parentLight, borderColor: colors.parent + '44' }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.parentDark }}>
                {pendingApprovals} Quest{pendingApprovals > 1 ? 's' : ''} Awaiting Approval
              </Text>
              <Text style={{ fontSize: TYPO.label, color: colors.parent, marginTop: 2 }}>
                Kids are waiting for your sign-off
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => router.push('/(tabs)/quests')}
                style={[styles.approveBtn, { backgroundColor: colors.parent }]}
              >
                <Ionicons name="checkmark-circle" size={14} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>
                  Approve All ({pendingApprovals})
                </Text>
              </Pressable>
              <Pressable
                onPress={() => router.push('/(tabs)/quests')}
                style={[styles.reviewBtn, { borderColor: colors.parent + '60' }]}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.parent }}>Review</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* ── Today's timeline preview ── */}
      <View style={{ marginHorizontal: 20, marginBottom: 16 }}>
        <View style={styles.sectionRow}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Today's Schedule</Text>
          <Pressable onPress={() => router.push('/(tabs)/calendar')}>
            <Text style={{ fontSize: TYPO.caption, color: colors.primary, fontWeight: '600' }}>View Full →</Text>
          </Pressable>
        </View>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {todayEvents.map((ev, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8,
              borderBottomWidth: i < todayEvents.length - 1 ? 1 : 0,
              borderBottomColor: colors.border,
            }}>
              <View style={{ width: 3, height: 32, borderRadius: 2, backgroundColor: ev.color }} />
              <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, width: 60 }}>{ev.time}</Text>
              <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '600', color: colors.textPrimary }}>
                {ev.title}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── Grocery tile ── */}
      <Pressable
        onPress={() => router.push('/(tabs)/grocery' as any)}
        style={{ marginHorizontal: 20, marginBottom: 16 }}
      >
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16 }]}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 22 }}>🛒</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>Grocery List</Text>
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>
              {groceryItems.filter(i => !i.isBought).length} items to buy
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </View>
      </Pressable>

      {/* ── Active tasks in review ── */}
      {inReview.length > 0 && (
        <View style={{ marginHorizontal: 20, marginBottom: 16 }}>
          <View style={styles.sectionRow}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>In Review</Text>
            <Pressable onPress={() => router.push('/(tabs)/quests')}>
              <Text style={{ fontSize: TYPO.caption, color: colors.primary, fontWeight: '600' }}>See all</Text>
            </Pressable>
          </View>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, gap: 8 }]}>
            {inReview.map(t => (
              <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.amber }} />
                <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '600', color: colors.textPrimary }}>
                  {t.title}
                </Text>
                <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{t.who}</Text>
                <View style={{ backgroundColor: colors.kidLight, borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.kidDark }}>+{t.coins} 🪙</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ── Family snapshot ── */}
      <View style={{ marginHorizontal: 20, marginBottom: 24 }}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 10 }]}>Family Overview</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, gap: 12 }]}>
          {members.filter(m => m.role === 'kid').map(kid => (
            <View key={kid.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={{ fontSize: 28 }}>{kid.emoji ?? kid.name[0]}</Text>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{kid.name}</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>🔥 {kid.streak}d</Text>
                    <Text style={{ fontSize: TYPO.label, color: colors.kidDark, fontWeight: '700' }}>🪙 {kid.coins}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {kid.questsPending > 0 && (
                    <View style={{ backgroundColor: colors.amberLight, borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: colors.amberDark }}>{kid.questsPending} pending</Text>
                    </View>
                  )}
                  <View style={{ backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 10, color: colors.textSecondary }}>{kid.questsCompleted} done</Text>
                  </View>
                </View>
              </View>
            </View>
          ))}
          {kidsCount === 0 && (
            <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, textAlign: 'center', paddingVertical: 8 }}>
              No kids added yet.
            </Text>
          )}
        </View>
      </View>
    </>
  );
}

// ─── Kid hub ──────────────────────────────────────────────────────────────────

function KidHub({ active, colors }: { active: FamilyMember; colors: any }) {
  const coinGoal = 150;
  const progress = Math.min(active.coins / coinGoal, 1);

  const myQuests = [
    { id: '1', title: 'Wash the dishes', coins: 30, urgent: true },
    { id: '2', title: 'Take out the trash', coins: 20, urgent: false },
    { id: '3', title: 'Make your bed', coins: 10, urgent: false },
  ];

  return (
    <>
      {/* ── Hero reward progress card ── */}
      <View style={{ marginHorizontal: 20, marginBottom: 16 }}>
        <View style={[styles.card, { backgroundColor: colors.kidLight, borderColor: colors.kid + '44', padding: 18, gap: 12 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.kidDark, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Next Reward Goal
              </Text>
              <Text style={{ fontSize: TYPO.subheading, fontWeight: '800', color: colors.textPrimary, marginTop: 2 }}>
                30 Mins Extra Gaming 🎮
              </Text>
            </View>
            <Text style={{ fontSize: 36 }}>🏆</Text>
          </View>
          {/* Progress bar */}
          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.kidDark }}>
                {active.coins} / {coinGoal} Coins
              </Text>
              <Text style={{ fontSize: TYPO.caption, color: colors.kidDark }}>
                {coinGoal - active.coins} to go!
              </Text>
            </View>
            <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.kid + '30', overflow: 'hidden' }}>
              <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.kid, width: `${progress * 100}%` as any }} />
            </View>
          </View>
          <Pressable
            onPress={() => router.push('/(tabs)/store')}
            style={{ alignSelf: 'flex-start', backgroundColor: colors.kid, borderRadius: RADIUS.full, paddingHorizontal: 14, paddingVertical: 7 }}
          >
            <Text style={{ color: '#fff', fontSize: TYPO.caption, fontWeight: '800' }}>Tap to see all rewards →</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Stat strip ── */}
      <View style={{ marginHorizontal: 20, flexDirection: 'row', gap: 10, marginBottom: 16 }}>
        <View style={[styles.statBox, { backgroundColor: colors.kidLight, borderColor: colors.kid + '33' }]}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.kidDark }}>🪙 {active.coins}</Text>
          <Text style={{ fontSize: TYPO.label, color: colors.kidDark, fontWeight: '600' }}>Total Coins</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: colors.amberLight, borderColor: colors.amber + '33' }]}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.amberDark }}>🔥 {active.streak}</Text>
          <Text style={{ fontSize: TYPO.label, color: colors.amberDark, fontWeight: '600' }}>Day Streak</Text>
        </View>
      </View>

      {/* ── Daily quests ── */}
      <View style={{ marginHorizontal: 20, marginBottom: 24 }}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 10 }]}>My Daily Quests</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, gap: 0 }]}>
          {myQuests.map((q, i) => (
            <View key={q.id} style={{
              flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
              borderBottomWidth: i < myQuests.length - 1 ? 1 : 0,
              borderBottomColor: colors.border,
            }}>
              <Pressable style={{
                width: 24, height: 24, borderRadius: 12,
                borderWidth: 2, borderColor: q.urgent ? colors.amber : colors.border,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: colors.surface,
              }}>
                {q.urgent && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.amber }} />}
              </Pressable>
              <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '600', color: colors.textPrimary }}>
                {q.title}
              </Text>
              <View style={{ backgroundColor: colors.kidLight, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.kidDark }}>+{q.coins} 🪙</Text>
              </View>
            </View>
          ))}
        </View>
        <Pressable
          onPress={() => router.push('/(tabs)/quests')}
          style={[styles.ghostBtn, { borderColor: colors.primary + '40', marginTop: 10 }]}
        >
          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.primary }}>View All Quests →</Text>
        </Pressable>
      </View>
    </>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function HubScreen() {
  const { colors } = useTheme();
  const { members, activeMemberId, setActiveMember } = useFamilyStore();
  const unreadCount = useNotifStore(s => s.unreadCount);
  const [pinTarget, setPinTarget] = useState<FamilyMember | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const active = members.find(m => m.id === activeMemberId) ?? members[0];
  const isParent = active?.role === 'parent';

  const handleSelectMember = (m: FamilyMember) => {
    if (m.id === activeMemberId) return;
    if (m.pinEnabled && m.pin) { setPinTarget(m); return; }
    setActiveMember(m.id);
  };

  const handlePinSuccess = () => {
    if (pinTarget) setActiveMember(pinTarget.id);
    setPinTarget(null);
  };

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  };

  if (!active) return null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, fontWeight: '500' }}>
              {greeting()},
            </Text>
            <Text style={{ fontSize: TYPO.heading, fontWeight: '800', color: colors.textPrimary, marginTop: 1 }}>
              {active.name.split(' ')[0]} {isParent ? '👋' : active.emoji ?? ''}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/(tabs)/profile')}
            style={{ position: 'relative', padding: 4 }}
          >
            <View style={{
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: isParent ? colors.parentLight : colors.kidLight,
              borderWidth: 2, borderColor: isParent ? colors.parent : colors.kid,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 20 }}>{active.emoji ?? active.name[0]}</Text>
            </View>
            {unreadCount > 0 && (
              <View style={[styles.bellBadge, { backgroundColor: colors.danger }]}>
                <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* ── Member switcher ── */}
        <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
          <MemberRow members={members} activeMemberId={activeMemberId} onSelect={handleSelectMember} />
        </View>

        {/* ── Role-specific content ── */}
        {isParent
          ? <ParentHub active={active} members={members} colors={colors} />
          : <KidHub active={active} colors={colors} />
        }
      </ScrollView>

      <PinEntryModal
        visible={pinTarget !== null}
        member={pinTarget}
        onSuccess={handlePinSuccess}
        onCancel={() => setPinTarget(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16,
  },
  sectionRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
  },
  sectionTitle: { fontSize: TYPO.caption, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { borderRadius: RADIUS.xl, borderWidth: 1, padding: 14 },
  approvalBanner: {
    borderRadius: RADIUS.xl, borderWidth: 1, padding: 14,
    flexDirection: 'column', gap: 10,
  },
  approveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 7,
  },
  reviewBtn: {
    borderWidth: 1, borderRadius: RADIUS.full,
    paddingHorizontal: 12, paddingVertical: 7,
    alignItems: 'center', justifyContent: 'center',
  },
  statBox: {
    flex: 1, borderRadius: RADIUS.xl, borderWidth: 1,
    padding: 14, gap: 4, alignItems: 'flex-start',
  },
  ghostBtn: {
    borderWidth: 1, borderRadius: RADIUS.xl,
    paddingVertical: 11, alignItems: 'center', justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute', top: 0, right: 0,
    minWidth: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3, borderWidth: 1.5, borderColor: '#fff',
  },
  bellBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
});
