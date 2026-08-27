/**
 * KioskHubTab — the always-visible dashboard state of kiosk mode: today's
 * schedule, open backlog, and reviews-pending, sized for a glance from
 * across the kitchen. Read-only consumption of the same stores every other
 * screen already reads — no writes, no new store logic.
 */
import { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Home, Clock } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { fmtDate, fmtTime } from '@/lib/dates';
import { useQuestStore } from '@/store/choreAdapter';
import { useEventStore } from '@/store/eventStore';
import type { FamilyMember } from '@/store/familyStore';

export function KioskHubTab({ active, members, colors, isDark }: {
  active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean;
}) {
  const { quests } = useQuestStore();
  const dayEvents = useEventStore(s => s.dayEvents);

  const now = new Date();
  const today = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const clock = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  const isSenior = active.role === 'senior';

  const openPool = useMemo(() => {
    // A GP is scoped to only their own assigned/sponsored chores — never
    // the general kid/teen bounty pool, matching QuestsScreen.tsx's own
    // GP scoping (the "old !isAdultTask catch-all showed every kid's
    // regular household chore" bug this dashboard card was still doing).
    if (isSenior) return quests.filter(q => q.assignedToId === active.id || q.sponsorUserId === active.id);
    // inviteGrandparents-flagged chores stay GP-pool-only, even when
    // isPool/todo — excluded here to match the same fix applied to
    // KidView/TeenView/QuestsScreen's pool filters.
    return quests.filter(q => q.isPool && q.status === 'todo' && !q.inviteGrandparents);
  }, [quests, isSenior, active.id]);
  const pendingReview = useMemo(
    () => quests.filter(q => q.status === 'pending_approval'),
    [quests],
  );
  // Same GP scoping as openPool — a GP's "In Progress" column should only
  // ever show their own claimed/in-progress work, not every kid's.
  const inProgress = useMemo(() => {
    const base = quests.filter(q => q.status === 'in_progress' || q.status === 'claimed');
    return isSenior ? base.filter(q => q.assignedToId === active.id || q.sponsorUserId === active.id) : base;
  }, [quests, isSenior, active.id]);

  const memberName = (id?: string) => members.find(m => m.id === id)?.name?.split(' ')[0];

  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      {/* Top clock/date bar */}
      <View style={s.topbar}>
        <View>
          <Text style={[s.clock, { color: colors.textPrimary }]}>{clock}</Text>
          <Text style={[s.date, { color: colors.textSecondary }]}>{today}</Text>
        </View>
        <View style={[s.familyPill, { backgroundColor: colors.tealLight }]}>
          <View style={[s.dot, { backgroundColor: colors.success }]} />
          <Text style={[s.familyName, { color: colors.teal }]} numberOfLines={1}>Viewing as {active.name.split(' ')[0]}</Text>
        </View>
      </View>

      {/* Three-zone layout */}
      <View style={s.grid}>
        {/* Column 1 — backlog */}
        <View style={s.col}>
          <SectionLabel text={isSenior ? 'Your Chores' : 'Household Backlog'} color={colors.amber} colors={colors} />
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={s.bigStat}>
              <Text style={s.bigIcon}>📋</Text>
              <View>
                <Text style={[s.bigNum, { color: colors.textPrimary }]}>{openPool.length}</Text>
                <Text style={[s.bigLabel, { color: colors.textSecondary }]}>{isSenior ? 'assigned or sponsored by you' : 'chores open in the pool'}</Text>
              </View>
            </View>
            {openPool.slice(0, 4).map((q, i) => (
              <View key={q.id} style={[s.backlogRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                <Text style={[s.backlogTitle, { color: colors.textPrimary }]} numberOfLines={1}>{q.title}</Text>
                <View style={[s.coinPill, { backgroundColor: colors.amberLight }]}>
                  <Text style={[s.coinText, { color: colors.amber }]}>{q.coins} 🪙</Text>
                </View>
              </View>
            ))}
            {openPool.length === 0 && (
              <Text style={[s.empty, { color: colors.textTertiary }]}>Backlog is clear 🎉</Text>
            )}
          </View>

          <SectionLabel text="Chore Reviews" color={colors.teal} colors={colors} />
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={s.bigStat}>
              <Text style={s.bigIcon}>✅</Text>
              <View>
                <Text style={[s.bigNum, { color: colors.textPrimary }]}>{pendingReview.length}</Text>
                <Text style={[s.bigLabel, { color: colors.textSecondary }]}>waiting on approval</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Column 2 — today's timeline */}
        <View style={[s.col, { flex: 1.4 }]}>
          <SectionLabel text="Today's Timeline" color={colors.primary} colors={colors} />
          {dayEvents.length === 0 ? (
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, alignItems: 'center', paddingVertical: 28 }]}>
              <Clock size={22} color={colors.textTertiary} />
              <Text style={[s.empty, { color: colors.textTertiary, marginTop: 8 }]}>Nothing scheduled today</Text>
            </View>
          ) : (
            dayEvents.map(ev => (
              <View key={ev.id} style={[s.tlCard, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: colors.primary }]}>
                <Text style={[s.tlTime, { color: colors.textSecondary }]}>{ev.time ? fmtTime(ev.time) : 'All day'}</Text>
                <Text style={[s.tlTitle, { color: colors.textPrimary }]} numberOfLines={1}>{ev.title}</Text>
                {!!ev.location && <Text style={[s.tlMeta, { color: colors.textSecondary }]} numberOfLines={1}>📍 {ev.location}</Text>}
                {!!ev.driverName && (
                  <Text style={[s.tlMeta, { color: colors.primary, fontWeight: '800' }]}>
                    🚗 {ev.driverName} driving{ev.driverStatus === 'confirmed' ? ' · confirmed' : ' · pending'}
                  </Text>
                )}
              </View>
            ))
          )}
        </View>

        {/* Column 3 — in progress */}
        <View style={s.col}>
          <SectionLabel text="In Progress" color={colors.amber} colors={colors} />
          {inProgress.slice(0, 5).map(q => (
            <View key={q.id} style={[s.choreCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[s.choreEmoji, { backgroundColor: colors.amberLight }]}>
                <Text style={{ fontSize: 18 }}>🧺</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.choreTitle, { color: colors.textPrimary }]} numberOfLines={1}>{q.title}</Text>
                <Text style={[s.choreSub, { color: colors.textSecondary }]} numberOfLines={1}>
                  {memberName(q.assignedToId) ?? 'Unassigned'}
                </Text>
              </View>
              <Text style={[s.choreCoin, { color: colors.amber }]}>{q.coins} 🪙</Text>
            </View>
          ))}
          {inProgress.length === 0 && (
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[s.empty, { color: colors.textTertiary }]}>Nothing in progress</Text>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

function SectionLabel({ text, color, colors }: { text: string; color: string; colors: any }) {
  return (
    <View style={s.sectionLabelRow}>
      <View style={[s.swatch, { backgroundColor: color }]} />
      <Text style={[s.sectionLabel, { color: colors.textTertiary }]}>{text.toUpperCase()}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 40 },
  topbar: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 },
  clock: { fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },
  date: { fontSize: TYPO.caption, fontWeight: '700', marginTop: 2 },
  familyPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, maxWidth: 220 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  familyName: { fontSize: TYPO.label, fontWeight: '800' },
  grid: { flexDirection: 'row', gap: 16 },
  col: { flex: 1, gap: 14 },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  swatch: { width: 8, height: 8, borderRadius: 3 },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.7 },
  card: { borderRadius: 16, borderWidth: 1, padding: 14 },
  bigStat: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bigIcon: { fontSize: 30 },
  bigNum: { fontSize: 26, fontWeight: '800', lineHeight: 28 },
  bigLabel: { fontSize: TYPO.caption, fontWeight: '600', marginTop: 1 },
  backlogRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, marginTop: 10 },
  backlogTitle: { flex: 1, fontSize: TYPO.label, fontWeight: '700', marginRight: 8 },
  coinPill: { paddingHorizontal: 9, borderRadius: 999, paddingVertical: 3 },
  coinText: { fontSize: 11, fontWeight: '800' },
  empty: { fontSize: TYPO.caption, fontWeight: '600', textAlign: 'center' },
  tlCard: { borderRadius: 14, borderWidth: 1, borderLeftWidth: 3, padding: 13 },
  tlTime: { fontSize: 11, fontWeight: '800', marginBottom: 3 },
  tlTitle: { fontSize: TYPO.body, fontWeight: '800' },
  tlMeta: { fontSize: 11, fontWeight: '600', marginTop: 3 },
  choreCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, padding: 11 },
  choreEmoji: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  choreTitle: { fontSize: TYPO.label, fontWeight: '800' },
  choreSub: { fontSize: 11, fontWeight: '600', marginTop: 1 },
  choreCoin: { fontSize: 11, fontWeight: '800' },
});
