import { View, Text } from 'react-native';
import { ClipboardCheck, ChevronRight, Gem } from 'lucide-react-native';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { GEMINI } from '@/constants/geminiRhythm';
import { KidSectionHeader } from './KidSectionHeader';
import type { Quest } from '@/store/questStore';

// KidChoresNeedsYouCard — the kid-side mirror of Parent's NeedsYouCard
// (features/hub/parent/NeedsYouCard.tsx): one compact card, single
// most-urgent chore item + a "+N more" count, instead of MyQuestsSection's
// old always-expanded, every-status-grouped card sitting permanently on
// the Hub [live-requested: "lets build need needs you similar to the
// parents needs you.. and open the chores and it is todo, submitted,
// approved, bounty etc? on the needs you we can display the count of
// bounty unclaimed, or pending one N+ more"].
//
// Priority for the single headline item (confirmed): Submitted (pending
// parent review — furthest along, most worth surfacing) > To Do (oldest/
// most due) > unclaimed Bounty (fallback once nothing of the kid's own is
// pending). Tapping the card opens MyChoresScreen on that item's own tab.
// 'review' (submitted, awaiting a parent) is NOT action-required BY THE
// KID — it's surfaced in MyChoresScreen's own Review tab, not here
// [live-requested: "we dont need to show the submit review item here in
// needyou .. only where any action is required we should show"]. The card
// only ever headlines todo/bounty now; reviewQuests still gates whether
// the card renders at all alongside them (kept visible once ANY chore
// activity exists), but never becomes the headline kind or counts toward
// extraCount.
export type KidChoresNeedsYouKind = 'todo' | 'bounty';

function statusFor(kind: KidChoresNeedsYouKind): { label: string; color: (colors: any) => string } {
  if (kind === 'bounty') return { label: 'Up for grabs', color: (c) => c.pink };
  return { label: 'To do', color: (c) => c.teal };
}

export function KidChoresNeedsYouCard({
  colors, isDark,
  todoQuests, reviewQuests, bountyQuests,
  onOpenTab,
}: {
  colors: any; isDark: boolean;
  todoQuests: Quest[]; reviewQuests: Quest[]; bountyQuests: Quest[];
  onOpenTab: (tab: 'todo' | 'review' | 'done' | 'bounty') => void;
}) {
  if (todoQuests.length === 0 && bountyQuests.length === 0) return null;

  const kind: KidChoresNeedsYouKind = todoQuests.length > 0 ? 'todo' : 'bounty';
  const list = kind === 'todo' ? todoQuests : bountyQuests;
  const headline = list[0];
  const extraCount = list.length - 1;
  const status = statusFor(kind);
  const statusColor = status.color(colors);

  const reason =
    kind === 'todo' ? `+${headline.coins} coins when it's done`
      : `First to claim it gets +${headline.coins} coins`;

  // Heading now sits OUTSIDE the card (matching Parent Hub's own NEEDS YOU
  // layout: one eyebrow above a single bordered card, not a label embedded
  // inside the card's own content column) — was a hand-rolled bar+Text
  // pair squeezed next to the icon chip instead of the shared
  // KidSectionHeader every other section uses, and sat inside the card
  // instead of above it like Parent's version
  // ["Needs you missing the section heading with eybrow.. in kinds" /
  // "we shoukd alighn like parent"].
  return (
    <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
      <KidSectionHeader label="NEEDS YOU" accent={colors.pink} colors={colors} />
      <AnimatedPressable
        onPress={() => onOpenTab(kind)}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 12,
          padding: 16,
          borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border,
          borderRadius: 22,
          backgroundColor: colors.pinkLight,
          ...(isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow),
        }}
      >
        <View style={{
          width: 42, height: 42, borderRadius: 14,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.65)',
        }}>
          {kind === 'bounty'
            ? <Gem size={21} color={colors.pink} strokeWidth={1.8} />
            : <ClipboardCheck size={21} color={colors.pink} strokeWidth={1.8} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: (isDark ? colors.textPrimary : GEMINI.titleColor), fontSize: 17, fontWeight: '700', marginBottom: 4 }} numberOfLines={2}>
            {headline.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: statusColor + '20' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: statusColor }}>{status.label}</Text>
            </View>
            <Text style={{ color: (isDark ? colors.textSecondary : GEMINI.bodyColor), fontSize: 12, flex: 1 }} numberOfLines={1}>
              {reason}
            </Text>
          </View>
          {extraCount > 0 && (
            <Text style={{ color: colors.pink, fontSize: 12, fontWeight: '700', marginTop: 4 }}>
              +{extraCount} more {kind === 'bounty' ? 'unclaimed' : 'to do'}
            </Text>
          )}
        </View>
        <ChevronRight size={20} color={colors.textTertiary} />
      </AnimatedPressable>
    </View>
  );
}
