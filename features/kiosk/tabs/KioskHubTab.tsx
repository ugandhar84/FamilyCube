/**
 * KioskHubTab — the always-visible dashboard state of kiosk mode: today's
 * schedule, open backlog, and reviews-pending, sized for a glance from
 * across the kitchen. Read-only consumption of the same stores every other
 * screen already reads — no writes, no new store logic.
 *
 * Redesigned per the kitchen-hub mockup (nav rail + 3-column glanceable
 * dashboard) the user referenced — this file was functionally complete but
 * visually flat (no member strip, no timeline connector/status pills, no
 * activity pulse, no ambient footer) compared to that reference. Layout/
 * data logic is unchanged from the prior version; this pass is presentation
 * only, reusing eventAssignee() (eventStore's own helper/driverName +
 * status normalizer) instead of hand-rolling that logic here.
 */
import { useEffect, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Clock3, Sparkles, ClipboardList, CheckCircle2, MessageCircle } from 'lucide-react-native';
import { TYPO, LETTER_SPACING } from '@/constants/theme';
import { fmtTime } from '@/lib/dates';
import { useQuestStore } from '@/store/choreAdapter';
import { useEventStore, eventAssignee } from '@/store/eventStore';
import { useChatStore } from '@/store/chatStore';
import type { FamilyMember } from '@/store/familyStore';

const CHAT_CHANNEL = 'all';

export function KioskHubTab({ active, members, colors, isDark }: {
  active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean;
}) {
  const { quests } = useQuestStore();
  const dayEvents = useEventStore(s => s.dayEvents);
  const loadChatChannel = useChatStore(s => s.loadChannel);
  const chatMessages = useChatStore(s => s.channels[CHAT_CHANNEL]?.messages ?? []);

  // The dashboard's chat pulse reads channels['all'] straight from the
  // store like KioskChatTab does, but this tab may be the very first thing
  // that mounts in a kiosk session — nothing has necessarily called
  // loadChannel yet, so the pulse would otherwise show empty until someone
  // actually taps into the Chat tab once. Idempotent/cheap to call again if
  // the Chat tab already loaded it.
  useEffect(() => { loadChatChannel(CHAT_CHANNEL); }, [loadChatChannel]);

  const isSenior = active.role === 'senior';

  const openPool = useMemo(() => {
    if (isSenior) return quests.filter(q => q.assignedToId === active.id || q.sponsorUserId === active.id);
    return quests.filter(q => q.isPool && q.status === 'todo' && !q.inviteGrandparents);
  }, [quests, isSenior, active.id]);
  const pendingReview = useMemo(
    () => quests.filter(q => q.status === 'pending_approval'),
    [quests],
  );
  const inProgress = useMemo(() => {
    const base = quests.filter(q => q.status === 'in_progress' || q.status === 'claimed');
    return isSenior ? base.filter(q => q.assignedToId === active.id || q.sponsorUserId === active.id) : base;
  }, [quests, isSenior, active.id]);

  const recentChat = useMemo(() => chatMessages.slice(-3).reverse(), [chatMessages]);

  const memberName = (id?: string) => members.find(m => m.id === id)?.name?.split(' ')[0];
  const memberEmoji = (id?: string) => members.find(m => m.id === id)?.emoji ?? '👤';

  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      {/* flexGrow wrapper — on a tall kiosk screen with modest dashboard
          content, the ambient footer below previously ended up wherever
          the grid's own height happened to stop, reading as floating in
          the middle of the screen instead of pinned to the bottom (live-
          reported). This makes the content area fill the ScrollView's
          full height whenever it's shorter than the screen, pushing the
          footer down to the actual bottom via marginTop: 'auto' on it —
          content taller than the screen still scrolls normally either way. */}
      <View style={{ flex: 1, minHeight: '100%' }}>
        {/* Three-zone layout */}
        <View style={s.grid}>
        {/* Column 1 — backlog */}
        <View style={s.col}>
          <SectionLabel text={isSenior ? 'Your Chores' : 'Household Backlog'} color={colors.amber} colors={colors} />
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={s.bigStat}>
              <View style={[s.bigIconWrap, { backgroundColor: colors.amberLight }]}>
                <ClipboardList size={22} color={colors.amber} />
              </View>
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
              <View style={[s.bigIconWrap, { backgroundColor: colors.tealLight }]}>
                <CheckCircle2 size={22} color={colors.teal} />
              </View>
              <View>
                <Text style={[s.bigNum, { color: colors.textPrimary }]}>{pendingReview.length}</Text>
                <Text style={[s.bigLabel, { color: colors.textSecondary }]}>waiting on approval</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Column 2 — today's timeline */}
        <View style={[s.col, { flex: 1.35 }]}>
          <SectionLabel text="Today's Timeline" color={colors.primary} colors={colors} />
          {dayEvents.length === 0 ? (
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, alignItems: 'center', paddingVertical: 30 }]}>
              <Clock3 size={22} color={colors.textTertiary} />
              <Text style={[s.empty, { color: colors.textTertiary, marginTop: 8 }]}>Nothing scheduled today</Text>
            </View>
          ) : (
            <View style={s.timeline}>
              <View style={[s.timelineRail, { backgroundColor: colors.border }]} />
              {dayEvents.map(ev => {
                const assignee = eventAssignee(ev);
                const hasAssignee = !!assignee.name;
                const accent = hasAssignee ? colors.primary : colors.teal;
                return (
                  <View key={ev.id} style={s.tlItem}>
                    <Text style={[s.tlTime, { color: colors.textSecondary }]}>{ev.time ? fmtTime(ev.time) : 'All day'}</Text>
                    <View style={[s.tlDot, { backgroundColor: accent, borderColor: colors.background, shadowColor: accent }]} />
                    <View style={[s.tlCard, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: accent }]}>
                      <Text style={[s.tlTitle, { color: colors.textPrimary }]} numberOfLines={1}>{ev.title}</Text>
                      {!!ev.location && <Text style={[s.tlMeta, { color: colors.textSecondary }]} numberOfLines={1}>📍 {ev.location}</Text>}
                      {hasAssignee && (
                        <View style={s.tlStatusRow}>
                          <Text style={[s.tlWho, { color: colors.primary }]} numberOfLines={1}>🚗 {assignee.name} driving</Text>
                          <StatusPill status={assignee.status} colors={colors} />
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Column 3 — in progress + activity pulse */}
        <View style={s.col}>
          <SectionLabel text="In Progress" color={colors.amber} colors={colors} />
          <View style={s.col3Scroll}>
            {inProgress.slice(0, 4).map(q => (
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

            <SectionLabel text="Family Chat" color={colors.pink} colors={colors} />
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, gap: 10 }]}>
              {recentChat.length === 0 ? (
                <View style={s.chatEmptyRow}>
                  <MessageCircle size={18} color={colors.textTertiary} />
                  <Text style={[s.empty, { color: colors.textTertiary }]}>No messages yet</Text>
                </View>
              ) : (
                recentChat.map(m => (
                  <View key={m.id} style={s.chatRow}>
                    <Text style={s.chatEmoji}>{memberEmoji(m.senderId)}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.chatText, { color: colors.textPrimary }]} numberOfLines={2}>
                        <Text style={{ fontWeight: '800' }}>{memberName(m.senderId)}: </Text>
                        {m.text}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        </View>
      </View>

      {/* Ambient footer — marginTop: 'auto' pins it to the bottom of the
          flexGrow wrapper above regardless of how tall the grid content
          actually is. */}
      <View style={[s.ambient, { borderTopColor: colors.border, marginTop: 'auto' }]}>
        <Sparkles size={14} color={colors.primary} />
        <Text style={[s.tagline, { color: colors.textTertiary }]}>
          <Text style={{ color: colors.primary, fontWeight: '800' }}>CONNECT.</Text> ORGANIZE. CARE. GROW.
        </Text>
      </View>
      </View>
    </ScrollView>
  );
}

function StatusPill({ status, colors }: { status?: string; colors: any }) {
  if (!status) return null;
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    pending:   { label: 'Awaiting',  bg: colors.amberLight, fg: colors.amber },
    confirmed: { label: 'Confirmed', bg: colors.tealLight,  fg: colors.teal },
    rejected:  { label: "Can't do",  bg: colors.primaryLight, fg: colors.danger },
  };
  const cfg = map[status];
  if (!cfg) return null;
  return (
    <View style={[s.statusPill, { backgroundColor: cfg.bg }]}>
      <Text style={[s.statusText, { color: cfg.fg }]}>{cfg.label}</Text>
    </View>
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
  grid: { flexDirection: 'row', gap: 18 },
  col: { flex: 1, gap: 14 },
  col3Scroll: { gap: 14 },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  swatch: { width: 8, height: 8, borderRadius: 3 },
  sectionLabel: { fontSize: TYPO.sectionLabel, fontWeight: '800', letterSpacing: LETTER_SPACING.sectionLabel },
  card: { borderRadius: 18, borderWidth: 1, padding: 15 },
  bigStat: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  bigIconWrap: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  bigNum: { fontSize: 27, fontWeight: '800', lineHeight: 29 },
  bigLabel: { fontSize: TYPO.caption, fontWeight: '600', marginTop: 1 },
  backlogRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 11, marginTop: 11 },
  backlogTitle: { flex: 1, fontSize: TYPO.label, fontWeight: '700', marginRight: 8 },
  coinPill: { paddingHorizontal: 9, borderRadius: 999, paddingVertical: 3 },
  coinText: { fontSize: 11, fontWeight: '800' },
  empty: { fontSize: TYPO.caption, fontWeight: '600', textAlign: 'center' },
  timeline: { position: 'relative' },
  timelineRail: { position: 'absolute', left: 51, top: 6, bottom: 6, width: 2 },
  tlItem: { flexDirection: 'row', gap: 14, marginBottom: 16 },
  tlTime: { width: 46, textAlign: 'right', fontSize: 11.5, fontWeight: '800', paddingTop: 3 },
  tlDot: {
    position: 'absolute', left: 46, top: 4, width: 11, height: 11, borderRadius: 6,
    borderWidth: 2.5, shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 0 },
  },
  tlCard: { flex: 1, marginLeft: 20, borderRadius: 15, borderWidth: 1, borderLeftWidth: 3, padding: 14 },
  tlTitle: { fontSize: TYPO.subheading, fontWeight: '800' },
  tlMeta: { fontSize: 11.5, fontWeight: '600', marginTop: 4 },
  tlStatusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  tlWho: { fontSize: 11.5, fontWeight: '800', flex: 1, marginRight: 8 },
  statusPill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  statusText: { fontSize: 10, fontWeight: '800' },
  choreCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 15, borderWidth: 1, padding: 12 },
  choreEmoji: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  choreTitle: { fontSize: TYPO.label, fontWeight: '800' },
  choreSub: { fontSize: 11, fontWeight: '600', marginTop: 1 },
  choreCoin: { fontSize: 11, fontWeight: '800' },
  chatEmptyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', paddingVertical: 6 },
  chatRow: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  chatEmoji: { fontSize: 17, marginTop: 1 },
  chatText: { fontSize: 12.5, fontWeight: '600', lineHeight: 17 },
  ambient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 26, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth,
  },
  tagline: { fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },
});
