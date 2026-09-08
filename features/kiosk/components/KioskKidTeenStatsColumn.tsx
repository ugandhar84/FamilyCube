/**
 * KioskKidTeenStatsColumn — the persistent left-side shell for a kid/teen
 * in kiosk mode, replacing the shared nav rail (KioskScreen.tsx's own
 * `rail`) on EVERY tab, not just Overview — same real pattern
 * ParentStatsColumn.tsx already established for parent
 * [live-requested: "did we miss that leftside colum strip for the profile
 * and the tab navigations similar to the parent?" / "we should use the
 * parent style tab navigation and the left side column" / "i dont want
 * nav rail"].
 *
 * Mounted from KioskScreen.tsx alongside its own (hidden, for kid/teen)
 * nav rail — same relationship ParentStatsColumn has to that file. Real
 * data only: mainCoins/gpCoins/streak (same fields the Overview's own
 * KioskMyBalancePanel reads), and a real pending-request count from
 * kidRequestStore (mirroring ParentStatsColumn's own pending-count rows,
 * scoped to this member's own outgoing requests instead of the household's
 * incoming ones).
 *
 * Kid gets one extra pinned action row (Check In) that teen doesn't —
 * KidCheckinRow/CheerSquadSection are real KidView.tsx-only mobile
 * features with no teen equivalent (confirmed: grepped the whole hub/
 * kiosk tree, zero teen matches), so this column does not invent one.
 *
 * My balance sits directly under the identity card — real mainCoins/
 * gpCoins/streak/redemption fields, same as Overview's own
 * KioskMyBalancePanel — for BOTH kid and teen [live-requested: "we can
 * move my balace under the profile hero section" / "one small widget" /
 * "i asked for teens too"].
 *
 * Teen ADDITIONALLY gets a real 8-destination ask-a-parent grid lower down
 * in this column, in the slot kid instead uses for Check In
 * [live-requested: "heer instead of balance we must show the quick
 * actions right.. for teens" / "show the quick actions in a grid incons
 * possble ones in my place of my balce widget"] — the same real
 * ASK_PARENT_OPTIONS data + open(key) action kid's own "Your stuff" card
 * (KioskKidQuickActions) and KioskTasksTab's picker both already use;
 * role-agnostic (confirmed by reading it: no kid-only assumption anywhere
 * in that hook or ASK_PARENT_OPTIONS), so this is a genuine reuse, not a
 * new flow.
 */
import { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Sparkles, MessageCircleQuestion } from 'lucide-react-native';
import type { FamilyMember } from '@/store/familyStore';
import { useQuestStore } from '@/store/choreAdapter';
import { useRewardStore } from '@/store/rewardStore';
import { useKidRequestStore } from '@/store/kidRequestStore';
import { weekOf } from '@/features/vault/tabs/meals/types';
import { WidgetCard } from './KioskOS';
import { KioskKidCheckInTile } from './KioskKidQuickActions';
import { useKioskAskParent, ASK_PARENT_OPTIONS } from './KioskAskParentFlow';
import { useKioskColors, kioskRoleAccent } from '../kioskPalette';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { railForRole, type KioskTabKey } from '../kioskTabs';

export function KioskKidTeenStatsColumn({
  active, members, familyName, activeTab, onNavigate, onAskFam,
}: {
  active: FamilyMember;
  members: FamilyMember[];
  familyName: string;
  activeTab: KioskTabKey;
  onNavigate: (tab: KioskTabKey) => void;
  onAskFam: () => void;
}) {
  const { k, isDark } = useKioskColors();
  const isKid = active.role === 'kid';

  // Real 8-destination ask-a-parent flow — same hook/options
  // KioskKidQuickActions' own "Your stuff" grid and KioskTasksTab's picker
  // both already use, opened here directly per-tile (no picker step) for
  // teen's own quick-actions entry point instead of the balance card kid
  // gets in this same slot.
  const { open: openAskParent, node: askParentNode } = useKioskAskParent({ active, members });

  const redemptions = useRewardStore(s => s.redemptions);
  const main = (active as any).mainCoins ?? 0;
  const gp = (active as any).gpCoins ?? 0;
  const total = main + gp;
  const streak = (active as any).streak ?? 0;

  // Same real "this week" derivation KioskOverviewTab.tsx's own
  // weekChoreCounts uses (assigned or acted-on since this week's Monday,
  // excluding cancelled/archived) — self-contained here rather than
  // threaded down, since this column is now mounted at the KioskScreen
  // level independent of whether KioskOverviewTab itself is even mounted
  // (same reason ParentStatsColumn.tsx derives its own stats).
  const { quests } = useQuestStore();
  const progress = useMemo(() => {
    const [wy, wm, wd] = weekOf().split('-').map(Number);
    const weekStart = new Date(wy, wm - 1, wd);
    let done = 0, totalCount = 0;
    for (const q of quests) {
      if (q.assignedToId !== active.id) continue;
      const at = q.approvedAt ?? q.submittedAt ?? q.claimedAt;
      const relevant = q.status !== 'cancelled' && q.status !== 'archived' && (!at || new Date(at) >= weekStart);
      if (!relevant) continue;
      totalCount += 1;
      if (q.status === 'approved' || q.status === 'done') done += 1;
    }
    return totalCount > 0 ? { done, total: totalCount } : null;
  }, [quests, active.id]);

  const lastRedeemed = useMemo(() => {
    const mine = redemptions
      .filter(r => r.memberId === active.id)
      .sort((a, b) => b.redeemedAt.localeCompare(a.redeemedAt));
    return mine[0];
  }, [redemptions, active.id]);

  const pendingRequestCount = useKidRequestStore(
    s => s.requests.filter(r => r.fromMemberId === active.id && r.status === 'pending').length,
  );

  return (
    <View style={s.statsCol}>
      <WidgetCard k={k} isDark={isDark} style={s.statsIdentityCard}>
        <View style={s.statsIdentity}>
          <View style={[s.statsAvatar, { backgroundColor: kioskRoleAccent(k, active.role) + (isDark ? '26' : '18') }]}>
            <Text style={s.statsAvatarEmoji}>{active.emoji ?? '👤'}</Text>
          </View>
          <Text style={[s.statsName, { color: k.text }]} numberOfLines={1}>{active.name?.trim().split(' ')[0]}</Text>
          <Text style={[s.statsSub, { color: k.textMuted }]} numberOfLines={1}>{familyName}</Text>
        </View>
      </WidgetCard>

      {/* My balance, moved to sit directly under the identity card
          (always visible, not inside the scrollable tab-list area below)
          [live-requested: "we can move my balace under the profile hero
          section" / "one small widget" / "i asked for teens too"] — same
          real mainCoins/gpCoins/streak/redemption fields
          KioskMyBalancePanel (Overview centerCol) already reads. Kid AND
          teen both get this; teen's own quick-actions grid lower down is
          a SEPARATE addition, not a replacement for its own balance. */}
      <WidgetCard k={k} isDark={isDark} style={s.balanceHeroCard}>
        <Text style={[s.balanceAmt, { color: k.gold }]} numberOfLines={1}>
          {total}<Text style={[s.balanceUnit, { color: k.textMuted }]}> coins</Text>
        </Text>
        <Text style={[s.balanceSub, { color: k.textFaint }]} numberOfLines={2}>
          {[
            progress ? `${progress.done}/${progress.total} chores this week` : null,
            streak > 0 ? `${streak} day streak` : null,
            lastRedeemed ? 'redeemed recently' : null,
          ].filter(Boolean).join(' · ') || 'No activity yet this week'}
        </Text>
      </WidgetCard>

      <ScrollView style={s.statsColScrollBody} contentContainerStyle={s.statsColScroll} showsVerticalScrollIndicator={false}>
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

        {/* Teen: real 8-destination ask-a-parent grid — a genuine
            ADDITION for teen in this scrollable section, not a
            replacement for its own balance (balance moved up under the
            identity card for BOTH kid and teen; teen additionally gets
            this grid here since kid instead gets Check In in this same
            slot) [live-requested: "heer instead of balance we must show
            the quick actions right.. for teens" / "show the quick
            actions in a grid incons possble ones in my place of my balce
            widget" / "i asked for teens too"]. Same real
            ASK_PARENT_OPTIONS data + open(key) action kid's own "Your
            stuff" card (KioskKidQuickActions) and KioskTasksTab's picker
            both already use — tapping a tile jumps straight to that real
            destination modal, no intermediate picker step, same as kid's
            own grid. */}
        {!isKid && (
          <WidgetCard k={k} isDark={isDark}>
            <Text style={[s.gridTitle, { color: k.textMuted }]} numberOfLines={1}>MY STUFF</Text>
            <View style={s.askGrid}>
              {ASK_PARENT_OPTIONS.map(opt => (
                <Pressable
                  key={opt.key}
                  onPress={() => openAskParent(opt.key)}
                  style={({ pressed }) => [
                    s.askTile,
                    { backgroundColor: pressed ? k.cardHover : k.well, borderColor: k.cardBorder },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={opt.label}
                  accessibilityHint={opt.desc}
                >
                  <opt.Icon size={18} color={opt.accent(k)} />
                  <Text style={[s.askTileLabel, { color: k.text }]} numberOfLines={2}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>
          </WidgetCard>
        )}

        {/* Pending requests — real kidRequestStore count, kept as its own
            small card now that the coin/streak summary moved up to sit
            directly under the identity card instead. Shown for both kid
            and teen (a teen's own requests count is just as real). */}
        {pendingRequestCount > 0 && (
          <WidgetCard k={k} isDark={isDark}>
            <View style={s.statsRow}>
              <Text style={[s.statsLabel, { color: k.textMuted }]} numberOfLines={2}>Requests waiting on a parent</Text>
              <Text style={[s.statsValue, { color: k.text }]}>{pendingRequestCount}</Text>
            </View>
          </WidgetCard>
        )}

        {/* Check In — real KidView.tsx-only feature (KidCheckinRow), no
            teen equivalent on the real phone. */}
        {isKid && (
          <WidgetCard k={k} isDark={isDark} padded={false} style={{ padding: KIOSK_SPACE.sm }}>
            <KioskKidCheckInTile active={active} />
          </WidgetCard>
        )}
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

      {askParentNode}
    </View>
  );
}

const s = StyleSheet.create({
  // Same real sizing/spacing as ParentStatsColumn.tsx — see that file's
  // own comments for the width/marginTop/marginLeft provenance.
  statsCol: { width: 240, gap: KIOSK_SPACE.md, marginTop: KIOSK_SPACE.lg, marginLeft: KIOSK_SPACE.lg },
  statsColScrollBody: { flex: 1 },
  statsColScroll: { gap: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.md },
  statsIdentityCard: { paddingVertical: 22, paddingHorizontal: 20 },
  // One small widget, directly under the identity card.
  balanceHeroCard: { paddingVertical: KIOSK_SPACE.md },
  statsIdentity: { alignItems: 'flex-start' },
  statsAvatar: {
    width: 44, height: 44, borderRadius: KIOSK_RADIUS.md,
    alignItems: 'center', justifyContent: 'center', marginBottom: KIOSK_SPACE.sm,
  },
  statsAvatarEmoji: { fontSize: 20 },
  statsName: { fontSize: KIOSK_TYPO.heading, fontWeight: '800' },
  statsSub: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 2 },
  // Teen's Ask a Parent grid — 2-up (the narrow 240px column has no room
  // for 4-up like KioskKidQuickActions' own wider "Your stuff" card),
  // real ASK_PARENT_OPTIONS icon + label per tile.
  gridTitle: { fontSize: KIOSK_TYPO.micro, fontWeight: '800', letterSpacing: 0.5, marginBottom: KIOSK_SPACE.sm },
  askGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.xs },
  askTile: {
    flexBasis: '47%', flexGrow: 1, minHeight: KIOSK_HIT.control, borderRadius: KIOSK_RADIUS.sm, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: KIOSK_SPACE.sm, paddingHorizontal: KIOSK_SPACE.xs,
  },
  askTileLabel: { fontSize: KIOSK_TYPO.micro, fontWeight: '700', textAlign: 'center' },
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
  balanceAmt: { fontSize: 28, fontWeight: '900', fontVariant: ['tabular-nums'] },
  balanceUnit: { fontSize: KIOSK_TYPO.label, fontWeight: '700' },
  balanceSub: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 2 },
  messageKidsBtn: {
    borderRadius: KIOSK_RADIUS.sm, padding: KIOSK_SPACE.md,
    minHeight: KIOSK_HIT.control,
  },
  askFamRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs },
  messageKidsTitle: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  messageKidsSub: { fontSize: KIOSK_TYPO.micro, fontWeight: '600', marginTop: 2, opacity: 0.75 },
});
