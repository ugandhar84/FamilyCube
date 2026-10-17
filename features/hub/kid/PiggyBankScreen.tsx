import { View, Text, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PiggyBank, Star, Target, CheckCircle2, Flame, Zap, Lightbulb, Receipt } from 'lucide-react-native';
import { GEMINI } from '@/constants/geminiRhythm';
import { PageHeading } from '@/components/PageHeading';
import { KID } from './kidTheme';
import type { Reward } from '@/store/rewardStore';
import { useChoreStore } from '@/store/choreStore';
import { useUIStore } from '@/store/uiStore';

// Scenario 8.1 — real "Recent Activity" list reading straight from
// choreStore.transactions (the same audit-trail row every quest approval,
// bonus, and GP match already writes), scoped to the viewer's own
// transactions only (5.3's sibling-balance-privacy rule).
function RecentActivityList({ colors, isDark, memberId }: { colors: any; isDark: boolean; memberId: string }) {
  const transactions = useChoreStore(s => s.transactions);
  const mine = transactions
    .filter(t => t.userId === memberId && !(t.notes ?? '').includes('[Denied]'))
    .slice(0, 8);

  if (mine.length === 0) return null;
  const cardBg = isDark ? colors.card : GEMINI.cardBg;

  return (
    <View style={{ borderRadius: 16, padding: 16, backgroundColor: cardBg, borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border, gap: 10, ...(isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Receipt size={14} color={colors.textPrimary} />
        <Text style={{ fontSize: KID.tiny, fontWeight: '800', color: colors.textPrimary }}>Recent Activity</Text>
      </View>
      {mine.map(t => {
        const isNegative = t.amount < 0 || t.transactionType === 'CASH_OUT' || t.transactionType === 'SPENT';
        const sign = isNegative ? '-' : '+';
        return (
          <View key={t.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: KID.tiny, color: isDark ? colors.textSecondary : GEMINI.bodyColor, flex: 1, marginRight: 8 }} numberOfLines={1}>
              {t.notes || (t.transactionType === 'EARNED' ? 'Chore reward' : t.transactionType)}
            </Text>
            <Text style={{ fontSize: KID.tiny, fontWeight: '800', color: isNegative ? colors.danger : colors.teal }}>
              {sign}{Math.abs(t.amount)} 🪙
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// PiggyBankScreen — full-page "action center" for the Piggy Bank Quick
// Action tile, replacing PiggyBankSheet's AppBottomSheet shell per
// CLAUDE.md's standing no-bottom-sheets rule and the figma-rhythm pass's
// "same action center for each category" direction. Content/logic below
// is unchanged from PiggyBankSheet — only the outer shell moved from a
// bottom sheet to a plain View+PageHeading+ScrollView (the KidView parent
// wraps this in FullPageOverlay, same convention as AskParentHubScreen).
export function PiggyBankScreen({
  onClose, colors, isDark, mainCoins, gpCoins, almostAffordable, doneToday, streak, level, memberId, goalReward,
}: {
  onClose: () => void; colors: any; isDark: boolean;
  mainCoins: number; gpCoins: number; almostAffordable: Reward[];
  doneToday: number; streak: number; level: number;
  memberId?: string;
  goalReward?: Reward;
}) {
  const insets = useSafeAreaInsets();
  mainCoins = Math.max(0, mainCoins);
  gpCoins = Math.max(0, gpCoins);
  const householdSettings = useChoreStore(s => s.householdSettings);
  const ratio = householdSettings.pointsToFiatRatio;
  const symbol = householdSettings.currencySymbol;
  const coinsPerUnit = ratio > 0 ? Math.round(1 / ratio) : 100;
  const canvas = isDark ? colors.background : GEMINI.canvas;
  const cardBg = isDark ? colors.card : GEMINI.cardBg;
  const cardShadow = isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow;

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <View style={{ backgroundColor: canvas }}>
        <PageHeading
          eyebrow="FAMILY CUBE · PIGGY BANK"
          title="Piggy Bank"
          subtitle="Your coin balance & cash-out value"
          accent="amber"
          Icon={PiggyBank}
          onTitlePress={onClose}
          topInset={insets.top}
        />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        <View style={{ borderRadius: 22, padding: 20, alignItems: 'center', gap: 6, backgroundColor: colors.amberLight, borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border, ...cardShadow }}>
          <PiggyBank size={34} color={colors.amber} />
          <Text style={{ fontSize: KID.hero, fontWeight: '900', color: colors.amber, lineHeight: 36 }}>{mainCoins}</Text>
          <Text style={{ fontSize: KID.tiny, color: colors.textTertiary, fontWeight: '600' }}>Main Store Coins</Text>
          {gpCoins > 0 && (
            <View style={{ backgroundColor: colors.pinkLight, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, marginTop: 2, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Star size={12} color={colors.pink} fill={colors.pink} />
              <Text style={{ fontSize: KID.tiny, fontWeight: '800', color: colors.pink }}>+{gpCoins} Grandparent Bonus</Text>
            </View>
          )}
        </View>

        <View style={{ borderRadius: 16, padding: 16, backgroundColor: cardBg, borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border, gap: 10, ...cardShadow }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: KID.tiny, color: isDark ? colors.textSecondary : GEMINI.bodyColor }}>Main coins</Text>
            <Text style={{ fontSize: KID.sub, fontWeight: '900', color: colors.teal }}>{symbol}{(mainCoins * ratio).toFixed(2)}</Text>
          </View>
          {gpCoins > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: KID.tiny, color: isDark ? colors.textSecondary : GEMINI.bodyColor }}>GP bonus</Text>
              <Text style={{ fontSize: KID.sub, fontWeight: '800', color: colors.pink }}>{symbol}{(gpCoins * ratio).toFixed(2)}</Text>
            </View>
          )}
          <View style={{ height: 1, backgroundColor: isDark ? colors.border : GEMINI.border }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: KID.sub, fontWeight: '700', color: isDark ? colors.textPrimary : GEMINI.titleColor }}>Total 💰</Text>
            <Text style={{ fontSize: KID.title, fontWeight: '900', color: colors.amber }}>{symbol}{((mainCoins + gpCoins) * ratio).toFixed(2)}</Text>
          </View>
        </View>

        {goalReward && (() => {
          const remaining = Math.max(goalReward.cost - mainCoins, 0);
          const pct = Math.min(mainCoins / goalReward.cost, 1);
          return (
            <Pressable onPress={() => { onClose(); useUIStore.getState().setOpenRewardsScreenRequested(true); }}
              style={{ borderRadius: 16, padding: 16, backgroundColor: colors.pinkLight, borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border, gap: 9, ...cardShadow }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Target size={14} color={colors.pink} />
                <Text style={{ fontSize: KID.tiny, fontWeight: '800', color: colors.pink }}>My Goal</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: KID.sub, fontWeight: '800', color: isDark ? colors.textPrimary : GEMINI.titleColor, flex: 1, flexShrink: 1 }} numberOfLines={1}>
                  {goalReward.emoji} {goalReward.title}
                </Text>
                <Text style={{ fontSize: KID.tiny, fontWeight: '700', color: colors.pink, flexShrink: 0 }} numberOfLines={1}>
                  {remaining > 0 ? `${remaining} more 🪙` : 'Ready! 🎉'}
                </Text>
              </View>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: isDark ? colors.surface : colors.pinkLight, overflow: 'hidden' }}>
                <View style={{ height: 8, borderRadius: 4, width: `${Math.round(pct * 100)}%` as any, backgroundColor: colors.pink }} />
              </View>
              <Text style={{ fontSize: KID.tiny, fontWeight: '700', color: colors.textTertiary, alignSelf: 'flex-end' }}>
                {Math.round(pct * 100)}%
              </Text>
            </Pressable>
          );
        })()}

        {!goalReward && almostAffordable.length > 0 && (
          <View style={{ borderRadius: 16, padding: 16, backgroundColor: cardBg, borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border, gap: 9, ...cardShadow }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Target size={14} color={isDark ? colors.textPrimary : GEMINI.titleColor} />
              <Text style={{ fontSize: KID.tiny, fontWeight: '800', color: isDark ? colors.textPrimary : GEMINI.titleColor }}>Almost there!</Text>
            </View>
            {almostAffordable.slice(0, 2).map(r => {
              const pct = Math.min(mainCoins / r.cost, 1);
              return (
                <View key={r.id} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: KID.tiny, color: isDark ? colors.textSecondary : GEMINI.bodyColor, flex: 1, flexShrink: 1 }} numberOfLines={1}>{r.emoji} {r.title}</Text>
                    <Text style={{ fontSize: KID.tiny, fontWeight: '700', color: colors.amber, flexShrink: 0 }} numberOfLines={1}>Need {r.cost - mainCoins} more 🪙</Text>
                  </View>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: isDark ? colors.surface : colors.amberLight, overflow: 'hidden' }}>
                    <View style={{ height: 6, borderRadius: 3, width: `${Math.round(pct * 100)}%` as any, backgroundColor: colors.amber }} />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[
            { Icon: CheckCircle2, value: doneToday,    label: 'Done Today', color: colors.teal },
            { Icon: Flame,        value: streak,       label: 'Day Streak', color: colors.amber },
            { Icon: Zap,          value: `Lv ${level}`, label: 'Level',     color: colors.pink },
          ].map(({ Icon, value, label, color }) => (
            <View key={label} style={{ flex: 1, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 4, backgroundColor: cardBg, borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border, alignItems: 'center', gap: 4, ...cardShadow }}>
              <Icon size={18} color={color} />
              <Text style={{ fontSize: KID.sub, fontWeight: '900', color }}>{value}</Text>
              <Text style={{ fontSize: KID.tiny, fontWeight: '700', color: colors.textTertiary }}>{label}</Text>
            </View>
          ))}
        </View>

        {memberId && <RecentActivityList colors={colors} isDark={isDark} memberId={memberId} />}

        <View style={{ borderRadius: 16, padding: 16, backgroundColor: colors.tealLight, borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Lightbulb size={14} color={colors.teal} />
            <Text style={{ fontSize: KID.tiny, fontWeight: '800', color: colors.teal }}>How cash-outs work</Text>
          </View>
          <Text style={{ fontSize: KID.tiny, color: isDark ? colors.textSecondary : GEMINI.bodyColor, lineHeight: 16 }}>
            {coinsPerUnit} Coins = {symbol}1.00 real allowance! Ask at{' '}
            <Text style={{ fontWeight: '700', color: isDark ? colors.textPrimary : GEMINI.titleColor }}>Friday Family Dinner</Text>
            {' '}to cash out.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
