import { View, Text, Pressable } from 'react-native';
import { ClipboardCheck, MessageCircle, PiggyBank, Gift, ArrowUpRight } from 'lucide-react-native';
import { KID } from './kidTheme';
import { useUIStore } from '@/store/uiStore';
import { KidSectionHeader } from './KidSectionHeader';

// KidActionGrid — figma's "Quick actions" block: a 2x2 grid of pastel
// cards, each with an icon chip + arrow-up-right affordance in the header
// row, then a title + one-line status/subtitle underneath (not a bare
// icon+label tile) ["this kids figma rythem ... inspiring the parents hub
// rythms"]. Check-in quick taps (I'm Home!/Running Late) moved to their
// own compact row below this grid (see KidCheckinRow), matching the mock's
// separate "Quick check-ins" strip under the 2x2 action cards.
export function KidActionGrid({ onMyChores, onAskParent, onPiggyBank, myChoresSubtitle, colors, isDark }: {
  onMyChores: () => void;
  onAskParent: () => void;
  onPiggyBank: () => void;
  /** e.g. "2 of 3 approved today" — figma's chore-inbox tile subtitle. */
  myChoresSubtitle?: string;
  colors: any; isDark: boolean;
}) {
  const tiles: { Icon: typeof ClipboardCheck; title: string; subtitle: string; bg: string; iconColor: string; onPress: () => void }[] = [
    { Icon: ClipboardCheck, title: 'My Chores',  subtitle: myChoresSubtitle ?? 'See what\'s left today', bg: colors.pinkLight,   iconColor: colors.pink,   onPress: onMyChores },
    { Icon: MessageCircle,  title: 'Ask Parent', subtitle: 'Permission, questions & more', bg: colors.pinkLight,   iconColor: colors.pink,   onPress: onAskParent },
    { Icon: PiggyBank,      title: 'Piggy Bank', subtitle: 'Track your savings',           bg: colors.tealLight,   iconColor: colors.teal,   onPress: onPiggyBank },
    { Icon: Gift,           title: 'Rewards',    subtitle: 'Spend your coins',             bg: colors.amberLight,  iconColor: colors.amber,  onPress: () => useUIStore.getState().setOpenRewardsScreenRequested(true) },
  ];

  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 14 }}>
      <KidSectionHeader label="QUICK ACTIONS" accent={colors.pink} colors={colors} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {tiles.map(({ Icon, title, subtitle, bg, iconColor, onPress }) => (
          <Pressable key={title} onPress={onPress}
            style={{ flexBasis: '47%', flexGrow: 1, borderRadius: 22, padding: 16, gap: 14,
              backgroundColor: bg, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Icon size={22} color={iconColor} strokeWidth={2} />
              <ArrowUpRight size={15} color={colors.textTertiary} />
            </View>
            <View>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>{title}</Text>
              <Text style={{ fontSize: KID.tiny, color: colors.textSecondary, marginTop: 3 }} numberOfLines={2}>{subtitle}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ─── Quick check-ins — figma's compact 3-pill strip under the action grid ──
export function KidCheckinRow({ onCheckin, colors }: {
  onCheckin: (type: 'home' | 'ready' | 'late') => void;
  colors: any;
}) {
  const pills: { label: string; type: 'home' | 'ready' | 'late' }[] = [
    { label: "I'm Home", type: 'home' },
    { label: "I'm Ready", type: 'ready' },
    { label: 'Running Late', type: 'late' },
  ];
  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 14, gap: 8 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary }}>Quick check-in</Text>
      <View style={{ flexDirection: 'row', gap: 7 }}>
        {pills.map(({ label, type }) => (
          <Pressable key={type} onPress={() => onCheckin(type)}
            style={{ flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center',
              backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
