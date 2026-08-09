import { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  Animated, Image, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore, FamilyMember } from '@/store/familyStore';
import { TYPO, RADIUS } from '@/constants/theme';
import { useNotifStore } from '@/store/notifStore';
import PinEntryModal from '@/components/PinEntryModal';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function levelLabel(level: number) {
  const labels = ['Rookie', 'Helper', 'Hero', 'Champion', 'Legend', 'Star'];
  return labels[Math.min(level - 1, labels.length - 1)] ?? 'Legend';
}

function xpForNextLevel(level: number) { return level * 200; }

// ─── Avatar bubble ────────────────────────────────────────────────────────────

function AvatarBubble({
  member, active, onPress, size = 64,
}: {
  member: FamilyMember; active: boolean; onPress: () => void; size?: number;
}) {
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 0.88, useNativeDriver: true, tension: 300, friction: 6 }),
      Animated.spring(scale, { toValue: 1,    useNativeDriver: true, tension: 260, friction: 7 }),
    ]).start();
    onPress();
  };

  const borderColor = member.role === 'parent' ? colors.parent : colors.kid;
  const ringSize = size + 8;
  const hasPinLock = member.pinEnabled && member.pin;

  return (
    <Pressable onPress={handlePress} style={styles.avatarWrap}>
      <Animated.View style={{ transform: [{ scale }] }}>
        {active && (
          <View style={[styles.ring, {
            width: ringSize + 6, height: ringSize + 6,
            borderRadius: (ringSize + 6) / 2,
            borderColor,
            top: -7, left: -7,
          }]} />
        )}
        <View style={[styles.bubble, {
          width: size, height: size, borderRadius: size / 2,
          backgroundColor: active
            ? (member.role === 'parent' ? colors.parentLight : colors.kidLight)
            : colors.surface,
          borderWidth: active ? 2.5 : 1.5,
          borderColor: active ? borderColor : colors.border,
        }]}>
          {member.avatarUrl ? (
            <Image source={{ uri: member.avatarUrl }} style={{ width: size - 4, height: size - 4, borderRadius: (size - 4) / 2 }} />
          ) : (
            <Text style={{ fontSize: size * 0.46 }}>{member.emoji ?? member.name[0]}</Text>
          )}
        </View>
        {/* Streak badge */}
        {member.streak > 0 && (
          <View style={[styles.streakBadge, { backgroundColor: colors.kid }]}>
            <Text style={styles.streakText}>🔥{member.streak}</Text>
          </View>
        )}
        {/* PIN lock indicator */}
        {!active && hasPinLock && (
          <View style={[styles.lockBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="lock-closed" size={9} color={colors.textTertiary} />
          </View>
        )}
      </Animated.View>
      <Text style={[styles.avatarName, {
        color: active ? borderColor : colors.textSecondary,
        fontWeight: active ? '700' : '500',
      }]} numberOfLines={1}>
        {member.name.split(' ')[0]}
      </Text>
    </Pressable>
  );
}

// ─── Stat pill ────────────────────────────────────────────────────────────────

function StatPill({ icon, value, label, color }: { icon: string; value: string | number; label: string; color: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.statPill, { backgroundColor: color + '18', borderColor: color + '30' }]}>
      <Text style={{ fontSize: 18 }}>{icon}</Text>
      <View>
        <Text style={[styles.statValue, { color }]}>{value}</Text>
        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
      </View>
    </View>
  );
}

// ─── Quick action card ────────────────────────────────────────────────────────

function QuickCard({ icon, label, color, bg, onPress }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string; color: string; bg: string; onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.quickCard, { backgroundColor: bg, borderColor: color + '28' }]}>
      <View style={[styles.quickIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={[styles.quickLabel, { color: colors.textPrimary }]}>{label}</Text>
    </Pressable>
  );
}

// ─── Task row ─────────────────────────────────────────────────────────────────

function TaskRow({ title, coins, urgent }: { title: string; coins: number; urgent?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.taskRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <View style={[styles.taskDot, { backgroundColor: urgent ? colors.danger : colors.primary }]} />
      <Text style={[styles.taskTitle, { color: colors.textPrimary }]} numberOfLines={1}>{title}</Text>
      <View style={[styles.coinChip, { backgroundColor: colors.kidLight }]}>
        <Text style={[styles.coinText, { color: colors.kid }]}>🪙 {coins}</Text>
      </View>
    </View>
  );
}

// ─── Hub Screen ───────────────────────────────────────────────────────────────

export default function HubScreen() {
  const { colors } = useTheme();
  const unreadCount = useNotifStore(s => s.unreadCount);
  const { members, activeMemberId, loaded, setActiveMember, loadFromStorage } = useFamilyStore();

  // PIN modal state
  const [pinTarget, setPinTarget] = useState<FamilyMember | null>(null);

  useEffect(() => { if (!loaded) loadFromStorage(); }, [loaded]);

  const active = members.find(m => m.id === activeMemberId) ?? members[0];
  const isParent = active?.role === 'parent';
  const xpNext = xpForNextLevel(active?.level ?? 1);
  const xpPct  = Math.min((active?.xp ?? 0) / xpNext, 1);

  const bgGrad: [string, string] = isParent
    ? [colors.parent + '22', colors.background]
    : [colors.kid    + '22', colors.background];

  // Called when avatar is tapped
  const handleAvatarPress = (member: FamilyMember) => {
    if (member.id === activeMemberId) return; // already active
    if (member.pinEnabled && member.pin) {
      setPinTarget(member);   // show PIN modal
    } else {
      setActiveMember(member.id); // switch directly
    }
  };

  // PIN validated successfully
  const handlePinSuccess = (member: FamilyMember) => {
    setPinTarget(null);
    setActiveMember(member.id);
  };

  if (!loaded || !active) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.textSecondary, fontSize: TYPO.body }}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={() => {}} tintColor={colors.primary} />
        }
      >
        {/* ── Hero gradient ─────────────────────────────────────────────── */}
        <LinearGradient colors={bgGrad} style={styles.hero}>

          {/* Top row */}
          <View style={styles.heroTop}>
            <View>
              <Text style={[styles.greeting, { color: colors.textSecondary }]}>{greeting()} 👋</Text>
              <Text style={[styles.heroName, { color: colors.textPrimary }]}>{active.name}</Text>
            </View>
            <Pressable
              onPress={() => router.push('/(tabs)/notifications')}
              style={[styles.bellBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Ionicons name="notifications-outline" size={20} color={colors.textSecondary} />
              {unreadCount > 0 && (
                <View style={[styles.bellBadge, { backgroundColor: colors.danger }]}>
                  <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </Pressable>
          </View>

          {/* ── Member avatar switcher ─────────────────────────────────── */}
          <ScrollView
            horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.avatarRow}
          >
            {members.map(m => (
              <AvatarBubble
                key={m.id}
                member={m}
                active={m.id === activeMemberId}
                onPress={() => handleAvatarPress(m)}
              />
            ))}
            <Pressable style={styles.addMember}>
              <View style={[styles.bubble, {
                width: 64, height: 64, borderRadius: 32,
                backgroundColor: colors.surface,
                borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed',
              }]}>
                <Ionicons name="add" size={26} color={colors.textTertiary} />
              </View>
              <Text style={[styles.avatarName, { color: colors.textTertiary }]}>Add</Text>
            </Pressable>
          </ScrollView>

          {/* ── Stats ─────────────────────────────────────────────────── */}
          {isParent ? (
            <View style={styles.statsRow}>
              <StatPill icon="✅" value={active.questsCompleted} label="Done"    color={colors.parent} />
              <StatPill icon="⏳" value={active.questsPending}   label="Pending" color={colors.primary} />
              <StatPill icon="👨‍👩‍👧" value={members.length}          label="Members" color={colors.accent} />
            </View>
          ) : (
            <View style={styles.statsRow}>
              <StatPill icon="🪙" value={active.coins}         label="Coins"  color={colors.kid}    />
              <StatPill icon="⚡" value={active.xp}            label="XP"     color={colors.primary}/>
              <StatPill icon="🔥" value={`${active.streak}d`} label="Streak" color={colors.danger} />
            </View>
          )}
        </LinearGradient>

        {/* ── Kid XP bar ────────────────────────────────────────────────── */}
        {!isParent && (
          <View style={[styles.section, { marginTop: 0 }]}>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.xpHeader}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                  Level {active.level} · {levelLabel(active.level)}
                </Text>
                <Text style={[styles.xpLabel, { color: colors.textSecondary }]}>
                  {active.xp} / {xpNext} XP
                </Text>
              </View>
              <View style={[styles.xpTrack, { backgroundColor: colors.surface }]}>
                <View style={[styles.xpFill, { width: `${xpPct * 100}%` as any, backgroundColor: colors.primary }]} />
              </View>
              <Text style={[styles.xpHint, { color: colors.textSecondary }]}>
                {Math.round((1 - xpPct) * xpNext)} XP to Level {active.level + 1}
              </Text>
            </View>
          </View>
        )}

        {/* ── Parent quick actions ──────────────────────────────────────── */}
        {isParent && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Quick Actions</Text>
            <View style={styles.quickGrid}>
              <QuickCard icon="flag-outline"        label="New Quest"  color={colors.primary} bg={colors.primaryLight} onPress={() => router.push('/(tabs)/quests')}   />
              <QuickCard icon="checkmark-circle"    label="Approvals"  color={colors.parent}  bg={colors.parentLight}  onPress={() => router.push('/(tabs)/quests')}   />
              <QuickCard icon="calendar-outline"    label="Schedule"   color={colors.accent}  bg={colors.accentLight}  onPress={() => router.push('/(tabs)/calendar')} />
              <QuickCard icon="gift-outline"        label="Rewards"    color={colors.kid}     bg={colors.kidLight}     onPress={() => router.push('/(tabs)/store')}    />
              <QuickCard icon="map-outline"         label="GPS"        color={colors.info}    bg={colors.infoLight}    onPress={() => router.push('/(tabs)/gps')}      />
              <QuickCard icon="chatbubbles-outline" label="Chat"       color={colors.parent}  bg={colors.parentLight}  onPress={() => router.push('/(tabs)/chat')}     />
            </View>
          </View>
        )}

        {/* ── Kid quick actions ─────────────────────────────────────────── */}
        {!isParent && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>What's next?</Text>
            <View style={styles.quickGrid}>
              <QuickCard icon="flag-outline"        label="My Quests"   color={colors.primary} bg={colors.primaryLight} onPress={() => router.push('/(tabs)/quests')}  />
              <QuickCard icon="gift-outline"        label="Spend Coins" color={colors.kid}     bg={colors.kidLight}     onPress={() => router.push('/(tabs)/store')}   />
              <QuickCard icon="map-outline"         label="Check In"   color={colors.info}    bg={colors.infoLight}    onPress={() => router.push('/(tabs)/gps')}     />
              <QuickCard icon="chatbubbles-outline" label="Chat"        color={colors.parent}  bg={colors.parentLight}  onPress={() => router.push('/(tabs)/chat')}    />
            </View>
          </View>
        )}

        {/* ── Today's quests ────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              {isParent ? 'Family Quests Today' : 'My Quests Today'}
            </Text>
            <Pressable onPress={() => router.push('/(tabs)/quests')}>
              <Text style={[styles.seeAll, { color: colors.primary }]}>See all</Text>
            </Pressable>
          </View>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, gap: 8 }]}>
            <TaskRow title="Wash the dishes"    coins={30} urgent />
            <TaskRow title="Take out the trash" coins={20} />
            <TaskRow title="Make your bed"      coins={10} />
            <Pressable
              style={[styles.addTaskBtn, { borderColor: colors.border }]}
              onPress={() => router.push('/(tabs)/quests')}
            >
              <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
              <Text style={[styles.addTaskText, { color: colors.primary }]}>Add quest</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Kid leaderboard ───────────────────────────────────────────── */}
        {!isParent && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Family Board</Text>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, gap: 10 }]}>
              {[...members].sort((a, b) => b.xp - a.xp).map((m, i) => (
                <View key={m.id} style={styles.leaderRow}>
                  <Text style={[styles.leaderRank, { color: i === 0 ? colors.kid : colors.textSecondary }]}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
                  </Text>
                  <Text style={{ fontSize: 24 }}>{m.emoji ?? m.name[0]}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.leaderName, {
                      color: m.id === activeMemberId ? colors.primary : colors.textPrimary,
                      fontWeight: m.id === activeMemberId ? '700' : '500',
                    }]}>
                      {m.name.split(' ')[0]} {m.id === activeMemberId ? '(you)' : ''}
                    </Text>
                  </View>
                  <Text style={[styles.leaderXP, { color: colors.textSecondary }]}>⚡ {m.xp} XP</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Parent family summary ─────────────────────────────────────── */}
        {isParent && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Family Summary</Text>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, gap: 12 }]}>
              {members.filter(m => m.role === 'kid').map(kid => (
                <View key={kid.id} style={styles.summaryRow}>
                  <Text style={{ fontSize: 28 }}>{kid.emoji ?? kid.name[0]}</Text>
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={[styles.leaderName, { color: colors.textPrimary }]}>{kid.name}</Text>
                      <Text style={[styles.leaderXP, { color: colors.kid }]}>🪙 {kid.coins}</Text>
                    </View>
                    <View style={[styles.xpTrack, { backgroundColor: colors.surface, height: 6 }]}>
                      <View style={[styles.xpFill, {
                        width: `${Math.min(kid.xp / xpForNextLevel(kid.level), 1) * 100}%` as any,
                        backgroundColor: colors.primary, height: 6,
                      }]} />
                    </View>
                    <Text style={[styles.xpHint, { color: colors.textSecondary }]}>
                      Lv {kid.level} · {kid.questsPending} quests pending · 🔥 {kid.streak}d streak
                    </Text>
                  </View>
                </View>
              ))}
              {members.filter(m => m.role === 'kid').length === 0 && (
                <Text style={[styles.xpHint, { color: colors.textSecondary }]}>
                  No kids added yet. Tap + to add a family member.
                </Text>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── PIN entry modal ───────────────────────────────────────────────── */}
      <PinEntryModal
        visible={pinTarget !== null}
        member={pinTarget}
        onSuccess={handlePinSuccess}
        onCancel={() => setPinTarget(null)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  hero:     { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  heroTop:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  greeting: { fontSize: TYPO.caption, fontWeight: '500' },
  heroName: { fontSize: TYPO.heading, fontWeight: '800', marginTop: 2 },
  bellBtn:  { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  bellBadge:{ position: 'absolute', top: -3, right: -3, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderWidth: 1.5, borderColor: '#fff' },
  bellBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },

  avatarRow: { gap: 16, paddingRight: 8, paddingBottom: 4 },
  avatarWrap:{ alignItems: 'center', gap: 6 },
  bubble:    { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  ring:      { position: 'absolute', borderWidth: 2.5, borderStyle: 'solid' },
  streakBadge:{ position: 'absolute', bottom: -3, right: -6, borderRadius: 10, paddingHorizontal: 4, paddingVertical: 1, borderWidth: 1.5, borderColor: '#fff' },
  streakText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  lockBadge: { position: 'absolute', top: -2, right: -4, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  avatarName:{ fontSize: 11, textAlign: 'center', maxWidth: 64 },
  addMember: { alignItems: 'center', gap: 6 },

  statsRow:  { flexDirection: 'row', gap: 10, marginTop: 20 },
  statPill:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: RADIUS.lg, borderWidth: 1 },
  statValue: { fontSize: TYPO.subheading, fontWeight: '800' },
  statLabel: { fontSize: TYPO.label, fontWeight: '500' },

  section:    { paddingHorizontal: 20, marginTop: 20 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle:{ fontSize: TYPO.body, fontWeight: '700', marginBottom: 10 },
  seeAll:     { fontSize: TYPO.caption, fontWeight: '600' },
  card:       { borderRadius: RADIUS.xl, borderWidth: 1, padding: 14 },

  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickCard: { width: '47%', borderRadius: RADIUS.lg, borderWidth: 1, padding: 14, gap: 8 },
  quickIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  quickLabel:{ fontSize: TYPO.caption, fontWeight: '600' },

  taskRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: RADIUS.md, borderWidth: 1 },
  taskDot:   { width: 8, height: 8, borderRadius: 4 },
  taskTitle: { flex: 1, fontSize: TYPO.caption, fontWeight: '500' },
  coinChip:  { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  coinText:  { fontSize: 11, fontWeight: '700' },
  addTaskBtn:{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, borderTopWidth: 1, marginTop: 2, paddingTop: 10 },
  addTaskText:{ fontSize: TYPO.caption, fontWeight: '600' },

  xpHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  xpTrack:   { height: 8, borderRadius: 4, overflow: 'hidden' },
  xpFill:    { height: 8, borderRadius: 4 },
  xpLabel:   { fontSize: TYPO.caption, fontWeight: '500' },
  xpHint:    { fontSize: TYPO.label, marginTop: 5 },

  leaderRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  leaderRank: { fontSize: 20 },
  leaderName: { fontSize: TYPO.caption, fontWeight: '600' },
  leaderXP:   { fontSize: TYPO.caption, fontWeight: '500' },
  summaryRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
});
