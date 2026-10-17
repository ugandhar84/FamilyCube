import { View, Text } from 'react-native';
import { ClipboardCheck, MessageCircle, PiggyBank, Gift, ArrowUpRight } from 'lucide-react-native';
import { KID } from './kidTheme';
import { GEMINI } from '@/constants/geminiRhythm';
import { useUIStore } from '@/store/uiStore';
import { KidSectionHeader } from './KidSectionHeader';
import { AnimatedPressable } from '@/components/AnimatedPressable';

// KidActionGrid — figma's "Quick actions" block: a 2x2 grid of pastel
// cards, each with an icon chip + arrow-up-right affordance in the header
// row, then a title + one-line status/subtitle underneath (not a bare
// icon+label tile) ["this kids figma rythem ... inspiring the parents hub
// rythms"]. Check-in quick taps (I'm Home!/Running Late) moved to their
// own compact row below this grid (see KidCheckinRow), matching the mock's
// separate "Quick check-ins" strip under the 2x2 action cards.
export function KidActionGrid({ onMyChores, onAskParent, onPiggyBank, myChoresSubtitle, choreStats, rewardStats, colors, isDark }: {
  onMyChores: () => void;
  onAskParent: () => void;
  onPiggyBank: () => void;
  /** e.g. "2 of 3 approved today" — figma's chore-inbox tile subtitle. */
  myChoresSubtitle?: string;
  /** Stacked To do/Review/Done today counts — mirrors the Parent Hub's
      "Add a task" tile [live-requested: "we should have the counters on
      my chores similar to the Parents.. on my chores quick action card"].
      Optional so the tile still renders fine if a caller doesn't pass it. */
  choreStats?: { label: string; value: number; color: string }[];
  /** Stacked Pending/Approved today counts on the Rewards tile
      [live-requested: "rewards card should show the pending rewards
      request, approved requests today if available"]. Optional — falls
      back to the plain "Spend your coins" subtitle when omitted. */
  rewardStats?: { label: string; value: number; color: string }[];
  colors: any; isDark: boolean;
}) {
  // Each tile gets its own pastel from the brand's *Light token set — was
  // My Chores and Ask Parent both on colors.pinkLight, reading as one
  // repeated color instead of 4 distinct tiles [live-requested: "hub quick
  // actions should get distinct pastels"]. primaryLight (terracotta) is
  // the one brand pastel not already used elsewhere on this grid/row, so
  // Ask Parent takes it instead of doubling up on pink.
  const tiles: { Icon: typeof ClipboardCheck; title: string; subtitle: string; bg: string; iconColor: string; onPress: () => void }[] = [
    { Icon: MessageCircle,  title: 'Ask Parent', subtitle: 'Permission, questions & more', bg: colors.primaryLight, iconColor: colors.primary, onPress: onAskParent },
    { Icon: PiggyBank,      title: 'Piggy Bank', subtitle: 'Track your savings',           bg: colors.tealLight,    iconColor: colors.teal,    onPress: onPiggyBank },
  ];

  // No marginBottom — RideStatusCard right below always supplies its own
  // marginTop: 14 (HubFullWidthActionCard), so adding a trailing margin
  // here doubled that gap to 28px ["ask for ride card is also having
  // more top of the card"]. marginTop stays here since the sections
  // above (ChoresNeedsYou/NeedsYou) are conditionally absent and never
  // reliably supply their own bottom margin.
  return (
    <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
      <KidSectionHeader label="QUICK ACTIONS" accent={colors.pink} colors={colors} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {/* My Chores — same stacked-counters shape as the Parent Hub's
            "Add a task" tile (icon left, counts stacked beside it, title
            pinned to the bottom) instead of a single subtitle line. */}
        <AnimatedPressable onPress={onMyChores}
          style={{ flexBasis: '47%', flexGrow: 1, minHeight: 116, borderRadius: 22, padding: 16,
            backgroundColor: colors.pinkLight, borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border,
            justifyContent: 'space-between',
            ...(isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow) }}>
          {choreStats && choreStats.length > 0 ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'stretch' }}>
              <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 10 }}>
                <View style={{ justifyContent: 'center' }}>
                  <ClipboardCheck size={30} color={colors.pink} strokeWidth={2} />
                </View>
                <View style={{ gap: 2, justifyContent: 'center' }}>
                  {choreStats.map(s => (
                    <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: s.color, minWidth: 16 }}>{s.value}</Text>
                      <Text style={{ fontSize: 10, color: isDark ? colors.textSecondary : GEMINI.bodyColor }} numberOfLines={1}>{s.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <ArrowUpRight size={15} color={colors.textTertiary} />
            </View>
          ) : (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <ClipboardCheck size={22} color={colors.pink} strokeWidth={2} />
              <ArrowUpRight size={15} color={colors.textTertiary} />
            </View>
          )}
          <View>
            <Text style={{ fontSize: 15, fontWeight: '700', color: isDark ? colors.textPrimary : GEMINI.titleColor }} numberOfLines={1}>My Chores</Text>
            {!choreStats && (
              <Text style={{ fontSize: KID.tiny, color: isDark ? colors.textSecondary : GEMINI.bodyColor, marginTop: 3 }} numberOfLines={2}>{myChoresSubtitle ?? 'See what\'s left today'}</Text>
            )}
          </View>
        </AnimatedPressable>

        {/* Rewards — same stacked-counters shape as My Chores when the
            kid has pending/approved-today redemption requests to show. */}
        <AnimatedPressable onPress={() => useUIStore.getState().setOpenRewardsScreenRequested(true)}
          style={{ flexBasis: '47%', flexGrow: 1, minHeight: 116, borderRadius: 22, padding: 16,
            backgroundColor: colors.amberLight, borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border,
            justifyContent: 'space-between',
            ...(isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow) }}>
          {rewardStats && rewardStats.length > 0 ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'stretch' }}>
              <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 10 }}>
                <View style={{ justifyContent: 'center' }}>
                  <Gift size={30} color={colors.amber} strokeWidth={2} />
                </View>
                <View style={{ gap: 2, justifyContent: 'center' }}>
                  {rewardStats.map(s => (
                    <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: s.color, minWidth: 16 }}>{s.value}</Text>
                      <Text style={{ fontSize: 10, color: isDark ? colors.textSecondary : GEMINI.bodyColor }} numberOfLines={1}>{s.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <ArrowUpRight size={15} color={colors.textTertiary} />
            </View>
          ) : (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Gift size={22} color={colors.amber} strokeWidth={2} />
              <ArrowUpRight size={15} color={colors.textTertiary} />
            </View>
          )}
          <View>
            <Text style={{ fontSize: 15, fontWeight: '700', color: isDark ? colors.textPrimary : GEMINI.titleColor }} numberOfLines={1}>Rewards</Text>
            {!rewardStats && (
              <Text style={{ fontSize: KID.tiny, color: isDark ? colors.textSecondary : GEMINI.bodyColor, marginTop: 3 }} numberOfLines={2}>Spend your coins</Text>
            )}
          </View>
        </AnimatedPressable>

        {tiles.map(({ Icon, title, subtitle, bg, iconColor, onPress }) => (
          <AnimatedPressable key={title} onPress={onPress}
            style={{ flexBasis: '47%', flexGrow: 1, borderRadius: 22, padding: 16, gap: 14,
              backgroundColor: bg, borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border,
              ...(isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow) }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Icon size={22} color={iconColor} strokeWidth={2} />
              <ArrowUpRight size={15} color={colors.textTertiary} />
            </View>
            <View>
              <Text style={{ fontSize: 15, fontWeight: '700', color: isDark ? colors.textPrimary : GEMINI.titleColor }} numberOfLines={1}>{title}</Text>
              <Text style={{ fontSize: KID.tiny, color: isDark ? colors.textSecondary : GEMINI.bodyColor, marginTop: 3 }} numberOfLines={2}>{subtitle}</Text>
            </View>
          </AnimatedPressable>
        ))}
      </View>
    </View>
  );
}

// ─── Quick check-ins — figma's compact 3-pill strip under the action grid ──
export function KidCheckinRow({ onCheckin, colors, isDark }: {
  onCheckin: (type: 'home' | 'ready' | 'late') => void;
  colors: any; isDark?: boolean;
}) {
  const pills: { label: string; type: 'home' | 'ready' | 'late' }[] = [
    { label: "I'm Home", type: 'home' },
    { label: "I'm Ready", type: 'ready' },
    { label: 'Running Late', type: 'late' },
  ];
  // RideStatusCard right above has no marginBottom of its own (only its
  // own marginTop, same one-sided convention as everywhere else), so this
  // row needs its own marginTop or the two cards sit flush against each
  // other with zero gap ["quick check in is sticking to the ask for ride
  // card?"].
  return (
    <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
      <KidSectionHeader label="QUICK CHECK-IN" accent={colors.primary} colors={colors} />
      <View style={{ flexDirection: 'row', gap: 7 }}>
        {pills.map(({ label, type }) => (
          <AnimatedPressable key={type} onPress={() => onCheckin(type)}
            style={{ flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center',
              backgroundColor: isDark ? colors.card : GEMINI.cardBg, borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border,
              ...(isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow) }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
          </AnimatedPressable>
        ))}
      </View>
    </View>
  );
}
