/**
 * ParentStatsColumn — the persistent left-side shell for a parent in kiosk
 * mode, replacing the shared nav rail (KioskScreen.tsx's own `rail`) on
 * EVERY tab, not just Overview.
 *
 * ── Why this moved out of KioskOverviewTab.tsx ───────────────────────────
 * Live-corrected: the first version of this lived inside KioskOverviewTab
 * and only rendered while `effectiveTab === 'overview'` — tapping into
 * Meals from it meant the whole shell (including this column) disappeared
 * and a real tab switch happened, which is exactly the "still navigates
 * away like before" behavior that was reported as wrong. The actual ask:
 * "the side [column] will stay as it is with page links and the stats on
 * any page — and when user clicks on it it should only replace the tab,
 * rest of the screen [stays]." That means this column is a PERSISTENT
 * SHELL mounted at the KioskScreen level, independent of which tab is
 * active — the same relationship KioskHeader already has to every screen,
 * just for the left side instead of the top.
 *
 * Mounted from KioskScreen.tsx alongside its own (hidden, for a parent)
 * nav rail — see that file's own render for exactly where. Its own data
 * (pending approval counts, kid balances) is derived here independently,
 * not threaded down from KioskOverviewTab, since this column now renders
 * whether or not KioskOverviewTab itself is even mounted.
 */
import { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import type { FamilyMember } from '@/store/familyStore';
import { useQuestStore } from '@/store/choreAdapter';
import { useRewardStore } from '@/store/rewardStore';
import { useKidRequestStore } from '@/store/kidRequestStore';
import { WidgetCard } from './KioskOS';
import { useKioskColors, kioskRoleAccent, type KioskColors } from '../kioskPalette';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { railForRole, type KioskTabKey } from '../kioskTabs';

export function ParentStatsColumn({
  active, members, familyName, activeTab, onNavigate, onAskFam,
}: {
  active: FamilyMember;
  members: FamilyMember[];
  /** Shown under the active member's name — replaces the header's own
   *  family-name text (removed from there as redundant: same info, once
   *  is enough). */
  familyName: string;
  /** The screen's real current tab (KioskScreen.tsx's `effectiveTab`) —
   *  this column highlights whichever row actually matches, rather than
   *  assuming Overview is always the active one. */
  activeTab: KioskTabKey;
  onNavigate: (tab: KioskTabKey) => void;
  /** Opens the real KioskAskFamDrawer (same one the nav rail's own "Ask
   *  Fam" card opens elsewhere) — live-corrected: this slot was "Message
   *  the kids" (a quick note to family chat), swapped back to the real Ask
   *  Fam feature this column's pinned-action slot originally carried. */
  onAskFam: () => void;
}) {
  const { k, isDark } = useKioskColors();
  // Live-corrected: the mock's own 300px (grid-template-columns: 300px 1fr
  // 340px) rendered visibly oversized on a real device — a live screenshot
  // showed this column eating roughly a third of the screen instead of a
  // real ~13%. Rather than keep chasing a window-relative formula (the
  // window-percentage version before this had the same problem), this is
  // now a plain fixed width sized to its own content: the tab list's
  // longest real label ("Memories"/"School") plus its icon and padding —
  // "fit to the content," not a fraction of window width.

  const kids = useMemo(
    () => members.filter(m =>
      !m.deletedAt && m.inviteStatus !== 'pending' && (m.role === 'kid' || m.role === 'teen')),
    [members],
  );

  const { quests } = useQuestStore();
  const redemptions = useRewardStore(s => s.redemptions);
  const kidRequests = useKidRequestStore(s => s.requests);

  const pendingChoreCount = useMemo(
    () => quests.filter(q => q.status === 'pending_approval').length,
    [quests],
  );
  const pendingRedemptionCount = useMemo(
    () => redemptions.filter(r => r.status === 'pending').length,
    [redemptions],
  );
  const pendingRequestCount = useMemo(
    () => kidRequests.filter(r => r.status === 'pending' && (!r.toMemberId || r.toMemberId === active.id)).length,
    [kidRequests, active.id],
  );

  const rows: { label: string; value: number }[] = [
    { label: 'Chores pending review', value: pendingChoreCount },
    { label: 'Redemption requests', value: pendingRedemptionCount },
    { label: 'Kid requests awaiting reply', value: pendingRequestCount },
  ];

  return (
    <View style={s.statsCol}>
      {/* Live-requested: identity is STICKY (always visible, never
          scrolls away) — pulled out of the ScrollView entirely rather
          than a real position:sticky (RN's ScrollView doesn't support
          sticky children the way a web page does; a plain sibling above
          the scroll area is the correct RN equivalent, and simpler than
          stickyHeaderIndices for a single always-visible card). The
          household tools row (Broadcast/Lock Kiosk/Dim to Standby) was
          removed per live direction — those same three actions already
          live in KioskHeader's own Announcement/Lock/Standby buttons, and
          having them twice was judged redundant rather than a helpful
          second access point. */}
      {/* Mock's own .identity is 22px/20px padding — genuinely more than
          the generic .panel-head's 16px/18px/10px every other card uses
          (WidgetCard's own default KIOSK_SPACE.md=14 padding). Live-
          requested to match that real, larger identity padding rather
          than the shared default. */}
      <WidgetCard k={k} isDark={isDark} style={s.statsIdentityCard}>
        <View style={s.statsIdentity}>
          <View style={[s.statsAvatar, { backgroundColor: kioskRoleAccent(k, active.role) + (isDark ? '26' : '18') }]}>
            <Text style={s.statsAvatarEmoji}>{active.emoji ?? '👤'}</Text>
          </View>
          <Text style={[s.statsName, { color: k.text }]} numberOfLines={1}>{active.name?.trim().split(' ')[0]}</Text>
          <Text style={[s.statsSub, { color: k.textMuted }]} numberOfLines={1}>{familyName}</Text>
        </View>
      </WidgetCard>

      {/* Own ScrollView, same "scrolls independently, pinned action stays
          put" shape as KioskScreen.tsx's shared nav rail (its Ask Fam card
          below the tab list) — a real multi-column page has each column
          handle its own overflow, not one shared page-level scroll. Now
          holds the tab list + stats only — identity is the sticky header
          above it, Ask Family AI is the pinned footer below it. */}
      <ScrollView style={s.statsColScrollBody} contentContainerStyle={s.statsColScroll} showsVerticalScrollIndicator={false}>
        {/* This column's own copy of the tab list — the actual replacement
            for KioskScreen.tsx's shared nav rail, hidden for a parent on
            every tab now, not just Overview. Same railForRole/onNavigate
            every other tab already uses, laid out to fit here. Highlights
            `activeTab`, whichever tab that really is — not hardcoded to
            Overview, which was the bug in the first version of this. */}
        <WidgetCard k={k} isDark={isDark} padded={false}>
          <View style={{ borderRadius: KIOSK_RADIUS.sm, overflow: 'hidden' }}>
            {railForRole(active.role).map((item, i) => {
              const isActive = item.key === activeTab;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => onNavigate(item.key)}
                  disabled={isActive}
                  style={({ pressed }) => [
                    s.railTabRow,
                    i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: k.cardBorder },
                    isActive
                      ? { backgroundColor: k.primary }
                      : { backgroundColor: pressed ? k.cardHover : 'transparent' },
                  ]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={item.label}
                >
                  <item.Icon size={16} color={isActive ? k.onPrimary : k.textMuted} />
                  <Text style={[s.railTabLabel, { color: isActive ? k.onPrimary : k.text }]} numberOfLines={1}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </WidgetCard>

        <WidgetCard k={k} isDark={isDark}>
          <View>
            {rows.map((row, i) => (
              <View key={row.label} style={[s.statsRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: k.cardBorder }]}>
                <Text style={[s.statsLabel, { color: k.textMuted }]} numberOfLines={2}>{row.label}</Text>
                <Text style={[s.statsValue, { color: k.text }]}>{row.value}</Text>
              </View>
            ))}
            {kids.map(kid => {
              const total = ((kid as any).mainCoins ?? 0) + ((kid as any).gpCoins ?? 0);
              return (
                <View key={kid.id} style={[s.statsRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: k.cardBorder }]}>
                  <Text style={[s.statsLabel, { color: k.textMuted }]} numberOfLines={1}>
                    {kid.name?.trim().split(' ')[0]}'s balance
                  </Text>
                  <Text style={[s.statsValue, { color: k.text }]}>{total} coins</Text>
                </View>
              );
            })}
          </View>
        </WidgetCard>
      </ScrollView>

      <Pressable
        onPress={onAskFam}
        style={({ pressed }) => [s.messageKidsBtn, { backgroundColor: pressed ? k.cardHover : k.text }]}
        accessibilityRole="button"
        accessibilityLabel="Ask Family AI"
        accessibilityHint="Look up your family's schedule, chores and meals"
      >
        <View style={s.askFamRow}>
          <Sparkles size={16} color={k.purple} />
          <Text style={[s.messageKidsTitle, { color: k.card }]}>Ask Family AI</Text>
        </View>
        <Text style={[s.messageKidsSub, { color: k.card }]}>Quick answers about your family's day</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  // width set inline per-render from colWidth (real window-relative), not
  // here — see the component body's own comment.
  // flex:1 so the ScrollView between the sticky identity header and the
  // pinned Ask Family AI footer actually claims the real remaining
  // vertical space, rather than just stacking by content height.
  //
  // width, NOT flex — this column is itself a child of KioskScreen.tsx's
  // s.row (flexDirection:'row'), where `flex` means "grow HORIZONTALLY."
  // A real, live-caught bug: an earlier version had `flex:1` here (meant
  // to make the inner ScrollView fill remaining vertical space) and it
  // instead made this WHOLE column compete for the row's width on equal
  // footing with the content area beside it — visibly ~1/3 of the screen
  // on a real device instead of a real ~13%. The row's default
  // alignItems:'stretch' already gives this column the row's full HEIGHT
  // with no flex needed for that; width is fixed content-driven instead
  // (see this component body's own comment on colWidth's replacement).
  // marginTop matches the shared nav rail's own paddingVertical
  // (KioskScreen.tsx's s.rail, KIOSK_SPACE.sm=10) — this column replaces
  // that rail for a parent, but rendered with zero top spacing sat flush
  // against the header with no breathing room at all, less even than the
  // rail it replaced (which already had 10px here).
  statsCol: { width: 240, gap: KIOSK_SPACE.md, marginTop: KIOSK_SPACE.sm },
  // flex:1 here is correct — this is INSIDE statsCol (a flexDirection:
  // 'column' by default), where flex:1 correctly means "fill remaining
  // VERTICAL space" between the sticky identity header above and the
  // pinned Ask Family AI footer below.
  statsColScrollBody: { flex: 1 },
  statsColScroll: { gap: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.md },
  // Mock's exact .identity padding (22px 20px) — overrides WidgetCard's
  // shared 14px default for this card specifically.
  statsIdentityCard: { paddingVertical: 22, paddingHorizontal: 20 },
  statsIdentity: { alignItems: 'flex-start' },
  statsAvatar: {
    width: 44, height: 44, borderRadius: KIOSK_RADIUS.md,
    alignItems: 'center', justifyContent: 'center', marginBottom: KIOSK_SPACE.sm,
  },
  statsAvatarEmoji: { fontSize: 20 },
  statsName: { fontSize: KIOSK_TYPO.heading, fontWeight: '800' },
  statsSub: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 2 },
  statsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.sm,
  },
  statsLabel: { flex: 1, fontSize: KIOSK_TYPO.caption, fontWeight: '600' },
  statsValue: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  railTabRow: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    paddingHorizontal: KIOSK_SPACE.md, paddingVertical: KIOSK_SPACE.sm,
    minHeight: KIOSK_HIT.control,
  },
  railTabLabel: { fontSize: KIOSK_TYPO.caption, fontWeight: '700' },
  messageKidsBtn: {
    borderRadius: KIOSK_RADIUS.sm, padding: KIOSK_SPACE.md,
    minHeight: KIOSK_HIT.control,
  },
  askFamRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs },
  messageKidsTitle: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  messageKidsSub: { fontSize: KIOSK_TYPO.micro, fontWeight: '600', marginTop: 2, opacity: 0.75 },
  toolsCol: { gap: KIOSK_SPACE.xs },
  toolBtn: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    borderWidth: 1, borderRadius: KIOSK_RADIUS.sm,
    paddingHorizontal: KIOSK_SPACE.md, minHeight: KIOSK_HIT.control,
  },
  toolIcon: { fontSize: 16 },
  toolLabel: { fontSize: KIOSK_TYPO.caption, fontWeight: '700' },
});
