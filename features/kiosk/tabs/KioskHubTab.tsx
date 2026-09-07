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
import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { Clock3, Sparkles, ClipboardList, CheckCircle2, MessageCircle, RotateCcw, Gift } from 'lucide-react-native';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_RAIL_WIDTH } from '../kioskTheme';
import { KioskCard, KioskZoneHeader } from '../components/KioskSurface';
import { fmtTime, localDateStr } from '@/lib/dates';
import { useQuestStore } from '@/store/choreAdapter';
import { useEventStore, eventAssignee } from '@/store/eventStore';
import { useChatStore, type ChatMessage } from '@/store/chatStore';
import { useRewardStore } from '@/store/rewardStore';
import type { FamilyMember } from '@/store/familyStore';

const CHAT_CHANNEL = 'all';
// Module-level, not inline `[]` in the render — a stable reference across
// every render/instance, needed so chatMessages doesn't change identity
// (and re-trigger downstream memoization) just because the channel hasn't
// loaded yet.
const EMPTY_MESSAGES: ChatMessage[] = [];

export function KioskHubTab({ active, members, colors, isDark }: {
  active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean;
}) {
  // ── Responsive grid [CLIPPING BUG FIX] ────────────────────────────────
  // Live-reported: on a ~2000px landscape kiosk the dashboard's columns
  // ran off the right edge — "In Progress" and "Family Chat" were clipped
  // to "In…" / "Fa…" with no scrollbar and no reflow, i.e. their content
  // was genuinely unreachable. Two compounding causes:
  //
  //  1. availableWidth was computed from the WINDOW width, but this tab
  //     does not occupy the window — it renders inside KioskScreen's
  //     content pane, to the right of a KIOSK_RAIL_WIDTH nav rail. Every
  //     derived column width was therefore ~half the rail too wide, so a
  //     2-up row could not fit its own two columns.
  //  2. The 3-up branch set flexWrap:'nowrap'. With nowrap, children that
  //     cannot shrink below their intrinsic content width push the row
  //     past the container and simply overflow — nothing wraps and
  //     nothing scrolls. That is precisely the clipped-columns symptom.
  //
  // Fixed by measuring the CONTAINER rather than the window (onLayout, so
  // it's correct regardless of what chrome surrounds this tab and stays
  // correct through rotation/Split View), always allowing wrap, and giving
  // every column minWidth:0 so it can shrink instead of overflowing.
  const { width: winWidth } = useWindowDimensions();
  const [gridWidth, setGridWidth] = useState(0);
  const GRID_GAP = KIOSK_SPACE.md;
  const GRID_PADDING = KIOSK_SPACE.lg;
  // Fall back to a window-minus-rail estimate for the very first render,
  // before onLayout has reported; it is only ever used for one frame.
  const containerWidth = gridWidth > 0
    ? gridWidth
    : Math.max(0, winWidth - KIOSK_RAIL_WIDTH - GRID_PADDING * 2);
  // Breakpoints are on the REAL content width, so a portrait install
  // (~1640 wide) and a landscape one (~2360 wide) genuinely resolve to
  // different column counts rather than both taking whichever branch the
  // raw window width happened to hit.
  const columnsPerRow = containerWidth >= 1100 ? 3 : containerWidth >= 680 ? 2 : 1;
  const halfColWidth = Math.max(0, Math.floor((containerWidth - GRID_GAP) / 2));
  const { quests } = useQuestStore();
  const dayEvents = useEventStore(s => s.dayEvents);
  const loadChatChannel = useChatStore(s => s.loadChannel);
  // Was: useChatStore(s => s.channels[CHAT_CHANNEL]?.messages ?? []) — the
  // `?? []` fallback lived INSIDE the selector, so every render before the
  // channel loads returned a brand-new array literal; useSyncExternalStore
  // (what Zustand's hook is built on) compares snapshots by reference and
  // re-renders forever chasing a "changed" value that's actually the same
  // empty state each time ("getSnapshot should be cached" warning/loop).
  // Reading the channel object itself (stable reference once loaded, same
  // `undefined` reference every render before that) and defaulting OUTSIDE
  // the selector fixes it — same pattern KioskChatTab.tsx/ChatScreen.tsx
  // already use via their whole-store `const { channels } = useChatStore()`.
  const chatChannel = useChatStore(s => s.channels[CHAT_CHANNEL]);
  const chatMessages = chatChannel?.messages ?? EMPTY_MESSAGES;

  // The dashboard's chat pulse reads channels['all'] straight from the
  // store like KioskChatTab does, but this tab may be the very first thing
  // that mounts in a kiosk session — nothing has necessarily called
  // loadChannel yet, so the pulse would otherwise show empty until someone
  // actually taps into the Chat tab once. Idempotent/cheap to call again if
  // the Chat tab already loaded it.
  useEffect(() => { loadChatChannel(CHAT_CHANNEL); }, [loadChatChannel]);

  // Live "now" marker on the timeline — a wall-mounted kiosk showing
  // "today's schedule" with no indication of where "now" actually falls
  // among it reads as a static poster, not a live dashboard (live-
  // requested, matching the reference kiosk mock's red now-line). Ticks
  // once a minute — this timeline has no proportional time axis (each row
  // is a fixed-height list item, not positioned by clock time), so the
  // marker is inserted as its own row at the correct SORTED position
  // among today's events, rather than a pixel-positioned overlay line.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

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
  // Live-reported gap this closes too: a chore a parent sent back for redo
  // (choreAdapter maps the DB's redo_requested status to Quest status
  // 'declined') had NO glance visibility on the Hub either — same bug just
  // fixed on the Tasks board (KioskTasksTab's new "Needs Redo" column),
  // surfaced here too since the Hub's whole point is "everything at a
  // glance" without needing to open Tasks.
  const needsRedo = useMemo(() => quests.filter(q => q.status === 'declined'), [quests]);
  // Store redemption approvals are parent-only on mobile (StoreScreen's own
  // gate) — same rule here, no new permission invented.
  const isParent = active.role === 'parent';
  const redemptions = useRewardStore(s => s.redemptions);
  const pendingRedemptions = useMemo(
    () => isParent ? redemptions.filter(r => r.status === 'pending') : [],
    [redemptions, isParent],
  );

  const recentChat = useMemo(() => chatMessages.slice(-3).reverse(), [chatMessages]);

  const memberName = (id?: string) => members.find(m => m.id === id)?.name?.split(' ')[0];
  const memberEmoji = (id?: string) => members.find(m => m.id === id)?.emoji ?? '👤';

  // Only meaningful for TODAY's own timeline — dayEvents is already scoped
  // to the current day elsewhere in this app, but guard explicitly in case
  // that ever changes, rather than showing a stray "now" marker on the
  // wrong day's list.
  const nowHHMM = now.toTimeString().slice(0, 5);
  const showNowMarker = dayEvents.length > 0 && localDateStr(now) === localDateStr(new Date());
  // Insertion index: first event whose time is AFTER now — timed events
  // sort before/without-a-time all-day events per sortByTime, so this
  // naturally lands the marker among the timed ones and after any all-day
  // entries at the top.
  const nowMarkerIndex = dayEvents.findIndex(ev => !!ev.time && ev.time > nowHHMM);
  const nowInsertAt = nowMarkerIndex === -1 ? dayEvents.length : nowMarkerIndex;

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
        {/* Needs-attention strip — only rendered when there's genuinely
            something in it ("hide unnecessary info," live-requested), not
            a permanent empty-state row. Redo requests + pending store
            redemptions are exactly the kind of thing a parent glancing at
            the kitchen tablet needs to catch without opening Tasks/Store
            — the Hub's whole purpose is "everything at a glance," and both
            of these previously had zero visibility here at all. */}
        {(needsRedo.length > 0 || pendingRedemptions.length > 0) && (
          <View style={s.alertStrip}>
            {needsRedo.length > 0 && (
              <View style={[s.alertPill, { backgroundColor: colors.danger + '14', borderColor: colors.danger + '40' }]}>
                <RotateCcw size={16} color={colors.danger} />
                <Text style={[s.alertText, { color: colors.danger }]}>
                  {needsRedo.length} chore{needsRedo.length === 1 ? '' : 's'} sent back for redo
                </Text>
              </View>
            )}
            {pendingRedemptions.length > 0 && (
              <View style={[s.alertPill, { backgroundColor: colors.pink + '14', borderColor: colors.pink + '40' }]}>
                <Gift size={16} color={colors.pink} />
                <Text style={[s.alertText, { color: colors.pink }]}>
                  {pendingRedemptions.length} store redemption{pendingRedemptions.length === 1 ? '' : 's'} waiting on approval
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Three-zone layout — wraps to 2 or 1 columns per row on a
            narrower/portrait screen instead of staying rigidly 3-across
            (see columnsPerRow above). */}
        {/* onLayout measures the real content width (see the breakpoint
            block above). flexWrap is now ALWAYS 'wrap' — the old
            conditional 'nowrap' at 3-up is what let columns overflow the
            container instead of reflowing, silently clipping two of them
            off the right edge on a wide landscape screen. */}
        <View
          style={s.grid}
          onLayout={e => {
            const w = e.nativeEvent.layout.width;
            // Only update on a real change, so onLayout can't drive a
            // render loop by writing an identical value every pass.
            setGridWidth(prev => (Math.abs(prev - w) > 1 ? w : prev));
          }}
        >
        {/* Column 1 — backlog. 2-up row: `order` pushes this below the
            full-width Timeline (order 1) so it pairs with Column 3 on
            their own row instead of the Timeline splitting them. 1-up:
            full width, stacked in natural order. */}
        <View style={[s.col, columnsPerRow === 2 && ({ flex: undefined, width: halfColWidth, order: 2 } as any), columnsPerRow === 1 && s.colFullWidth]}>
          <SectionLabel text={isSenior ? 'Your Chores' : 'Household Backlog'} color={colors.amber} colors={colors} />
          <KioskCard colors={colors} isDark={isDark}>
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
                {/* Coins are a kid/teen incentive — a GP's own sponsored
                    adult task (isSenior's openPool branch above can include
                    these) has no payout concept on the phone app either. */}
                {!q.isAdultTask && (
                  <View style={[s.coinPill, { backgroundColor: colors.amberLight }]}>
                    <Text style={[s.coinText, { color: colors.amber }]}>{q.coins} 🪙</Text>
                  </View>
                )}
              </View>
            ))}
            {openPool.length === 0 && (
              <Text style={[s.empty, { color: colors.textTertiary }]}>Backlog is clear 🎉</Text>
            )}
          </KioskCard>

          <SectionLabel text="Chore Reviews" color={colors.teal} colors={colors} />
          <KioskCard colors={colors} isDark={isDark}>
            <View style={s.bigStat}>
              <View style={[s.bigIconWrap, { backgroundColor: colors.tealLight }]}>
                <CheckCircle2 size={22} color={colors.teal} />
              </View>
              <View>
                <Text style={[s.bigNum, { color: colors.textPrimary }]}>{pendingReview.length}</Text>
                <Text style={[s.bigLabel, { color: colors.textSecondary }]}>waiting on approval</Text>
              </View>
            </View>
          </KioskCard>
        </View>

        {/* Column 2 — today's timeline. order:1 (2-up only) so it's
            always the first, full-width row, with columns 1+3 (order:2)
            pairing up beneath it. */}
        <View style={[s.col, columnsPerRow < 3 ? ({ flexBasis: '100%', order: 1 } as any) : { flex: 1.35 }, columnsPerRow === 1 && s.colFullWidth]}>
          <SectionLabel text="Today's Timeline" color={colors.primary} colors={colors} />
          {dayEvents.length === 0 ? (
            <KioskCard colors={colors} isDark={isDark} style={{ alignItems: 'center', paddingVertical: KIOSK_SPACE.xl }}>
              <Clock3 size={22} color={colors.textTertiary} />
              <Text style={[s.empty, { color: colors.textTertiary, marginTop: KIOSK_SPACE.xs }]}>Nothing scheduled today</Text>
            </KioskCard>
          ) : (
            <View style={s.timeline}>
              <View style={[s.timelineRail, { backgroundColor: colors.border }]} />
              {showNowMarker && nowInsertAt === 0 && (
                <NowMarkerRow time={now} colors={colors} />
              )}
              {dayEvents.map((ev, i) => {
                const assignee = eventAssignee(ev);
                const hasAssignee = !!assignee.name;
                const accent = hasAssignee ? colors.primary : colors.teal;
                return (
                  <View key={ev.id}>
                    <View style={s.tlItem}>
                      <Text style={[s.tlTime, { color: colors.textSecondary }]}>{ev.time ? fmtTime(ev.time) : 'All day'}</Text>
                      <View style={[s.tlDot, { backgroundColor: accent, borderColor: colors.background, shadowColor: accent }]} />
                      <View style={[s.tlCard, {
                        backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: accent,
                        shadowColor: accent, shadowOpacity: isDark ? 0 : 0.1, elevation: isDark ? 0 : 3,
                      }]}>
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
                    {showNowMarker && nowInsertAt === i + 1 && (
                      <NowMarkerRow time={now} colors={colors} />
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Column 3 — in progress + activity pulse. Same order:2 as Column
            1 so both pair up on their own row below the full-width
            Timeline when 2-up; full width when 1-up. */}
        <View style={[s.col, columnsPerRow === 2 && ({ flex: undefined, width: halfColWidth, order: 2 } as any), columnsPerRow === 1 && s.colFullWidth]}>
          <SectionLabel text="In Progress" color={colors.amber} colors={colors} />
          <View style={s.col3Scroll}>
            {inProgress.slice(0, 4).map(q => (
              <View key={q.id} style={[s.choreCard, {
                backgroundColor: colors.card, borderColor: colors.border,
                shadowColor: colors.primary, shadowOpacity: isDark ? 0 : 0.08, elevation: isDark ? 0 : 2,
              }]}>
                <View style={[s.choreEmoji, { backgroundColor: colors.amberLight }]}>
                  <Text style={{ fontSize: 20 }}>🧺</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.choreTitle, { color: colors.textPrimary }]} numberOfLines={1}>{q.title}</Text>
                  <Text style={[s.choreSub, { color: colors.textSecondary }]} numberOfLines={1}>
                    {memberName(q.assignedToId) ?? 'Unassigned'}
                  </Text>
                </View>
                {!q.isAdultTask && (
                  <Text style={[s.choreCoin, { color: colors.amber }]}>{q.coins} 🪙</Text>
                )}
              </View>
            ))}
            {inProgress.length === 0 && (
              <KioskCard colors={colors} isDark={isDark}>
                <Text style={[s.empty, { color: colors.textTertiary }]}>Nothing in progress</Text>
              </KioskCard>
            )}

            <SectionLabel text="Family Chat" color={colors.pink} colors={colors} />
            <KioskCard colors={colors} isDark={isDark} style={{ gap: KIOSK_SPACE.sm }}>
              {recentChat.length === 0 ? (
                <View style={s.chatEmptyRow}>
                  <MessageCircle size={20} color={colors.textTertiary} />
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
            </KioskCard>
          </View>
        </View>
      </View>

      {/* Ambient footer — marginTop: 'auto' pins it to the bottom of the
          flexGrow wrapper above regardless of how tall the grid content
          actually is. */}
      <View style={[s.ambient, { borderTopColor: colors.border, marginTop: 'auto' }]}>
        <Sparkles size={16} color={colors.primary} />
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

// A horizontal line across the timeline rail marking "now," per the
// kitchen-kiosk reference the user pointed to (a red now-line cutting
// across the current day column) — reimagined for THIS timeline's rail-
// and-dot shape (a fixed-height item list, not a proportional time grid)
// as its own inserted row rather than a pixel-positioned overlay line,
// since there's no continuous time axis here to position a line against.
function NowMarkerRow({ time, colors }: { time: Date; colors: any }) {
  return (
    <View style={s.nowRow}>
      <Text style={[s.tlTime, { color: colors.primary, fontWeight: '900' }]}>
        {time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
      </Text>
      <View style={[s.nowDot, { backgroundColor: colors.primary, borderColor: colors.background }]} />
      <View style={[s.nowLine, { backgroundColor: colors.primary }]} />
    </View>
  );
}

// Was a tiny uppercase caption with an 8px dot — invisible as structure
// from across a kitchen. Now delegates to the shared ambient zone header
// (accent bar + heading-scale title), so the Hub's zones read as zones at
// a glance and match the language the Tasks board uses.
function SectionLabel({ text, color, colors }: { text: string; color: string; colors: any }) {
  return <KioskZoneHeader title={text} accent={color} colors={colors} />;
}

// ── Rescaled to the kiosk ladder ────────────────────────────────────────
// The responsive column logic above (columnsPerRow, the order-based 2-up
// reflow, the now-marker insertion) is genuinely right and is kept as-is —
// this is a scale pass on top of it, not a re-layout. Every size here was
// previously phone-calibrated: 10-12.5px timeline/chat/chore text that is
// simply not readable from across a kitchen, on the one screen most likely
// to be read from exactly there. The dashboard is glance-first, so the
// numbers that answer "is anything wrong?" (bigNum, tlTitle) lead hardest.
const s = StyleSheet.create({
  scroll: { padding: KIOSK_SPACE.lg, paddingBottom: KIOSK_SPACE.xxl },
  alertStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.sm, marginBottom: KIOSK_SPACE.lg },
  alertPill: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs, borderRadius: KIOSK_RADIUS.sm,
    borderWidth: 1, paddingHorizontal: KIOSK_SPACE.md, paddingVertical: KIOSK_SPACE.sm,
  },
  alertText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  // Always wraps; see the onLayout block in the component for why a
  // conditional 'nowrap' was the clipping bug.
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.md },
  // minWidth:0 is load-bearing: without it a column refuses to shrink
  // below its content's intrinsic width and pushes the row past the
  // container edge instead of wrapping.
  col: { flex: 1, minWidth: 0, gap: KIOSK_SPACE.md },
  colFullWidth: { flex: undefined, width: '100%', minWidth: 0 },
  col3Scroll: { gap: KIOSK_SPACE.md },
  bigStat: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.md },
  bigIconWrap: { width: 46, height: 46, borderRadius: KIOSK_RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  // The single most glanceable number on the dashboard — this is what
  // someone walking past is actually reading.
  bigNum: { fontSize: KIOSK_TYPO.hero, fontWeight: '800', lineHeight: KIOSK_TYPO.hero * 1.05 },
  bigLabel: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 2 },
  backlogRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: KIOSK_SPACE.sm, marginTop: KIOSK_SPACE.sm, minHeight: 44,
  },
  backlogTitle: { flex: 1, fontSize: KIOSK_TYPO.body, fontWeight: '700', marginRight: KIOSK_SPACE.xs },
  coinPill: { paddingHorizontal: KIOSK_SPACE.sm, borderRadius: KIOSK_RADIUS.sm, paddingVertical: 5 },
  coinText: { fontSize: KIOSK_TYPO.micro, fontWeight: '800' },
  empty: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', textAlign: 'center' },
  timeline: { position: 'relative' },
  timelineRail: { position: 'absolute', left: 59, top: 8, bottom: 8, width: 2 },
  tlItem: { flexDirection: 'row', gap: KIOSK_SPACE.md, marginBottom: KIOSK_SPACE.md },
  tlTime: { width: 52, textAlign: 'right', fontSize: KIOSK_TYPO.caption, fontWeight: '800', paddingTop: 3 },
  tlDot: {
    position: 'absolute', left: 54, top: 5, width: 12, height: 12, borderRadius: 6,
    borderWidth: 2.5, shadowOpacity: 0.5, shadowRadius: 5, shadowOffset: { width: 0, height: 0 },
  },
  // Timeline entries read as physical tiles resting on the counter, not
  // flat list rows — soft warm elevation is the main non-color signal
  // that separates this from a phone list. (Shadow color is set inline
  // from colors.primary at the call site; dark mode drops it, where a
  // cast shadow just reads as mud.)
  tlCard: {
    flex: 1, marginLeft: KIOSK_SPACE.lg, borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    borderLeftWidth: 4, padding: KIOSK_SPACE.sm,
    shadowRadius: 18, shadowOffset: { width: 0, height: 6 },
  },
  tlTitle: { fontSize: KIOSK_TYPO.subheading, fontWeight: '800' },
  tlMeta: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 5 },
  tlStatusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: KIOSK_SPACE.sm, gap: KIOSK_SPACE.xs },
  tlWho: { fontSize: KIOSK_TYPO.caption, fontWeight: '800', flex: 1, marginRight: KIOSK_SPACE.xs },
  statusPill: { paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: 5, borderRadius: KIOSK_RADIUS.sm },
  statusText: { fontSize: KIOSK_TYPO.micro, fontWeight: '800' },
  // Same row shape as tlItem (time label + dot-on-rail + content), but the
  // "content" is a plain horizontal line instead of a card — marks exactly
  // where "now" falls among today's events without competing with them
  // for visual weight the way a full card would.
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.md, marginBottom: KIOSK_SPACE.md },
  nowDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2.5 },
  nowLine: { flex: 1, height: 2, marginLeft: KIOSK_SPACE.xs, borderRadius: 1 },
  choreCard: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    borderRadius: KIOSK_RADIUS.md, borderWidth: 1, padding: KIOSK_SPACE.sm, minHeight: 60,
    shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
  },
  choreEmoji: { width: 40, height: 40, borderRadius: KIOSK_RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
  choreTitle: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  choreSub: { fontSize: KIOSK_TYPO.micro, fontWeight: '600', marginTop: 2 },
  choreCoin: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  chatEmptyRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs, justifyContent: 'center', paddingVertical: KIOSK_SPACE.xs },
  chatRow: { flexDirection: 'row', gap: KIOSK_SPACE.sm, alignItems: 'flex-start' },
  chatEmoji: { fontSize: 18, marginTop: 1 },
  chatText: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', lineHeight: KIOSK_TYPO.caption * 1.4 },
  ambient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: KIOSK_SPACE.sm,
    marginTop: KIOSK_SPACE.xl, paddingTop: KIOSK_SPACE.md, borderTopWidth: StyleSheet.hairlineWidth,
  },
  tagline: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', letterSpacing: 0.6 },
});
