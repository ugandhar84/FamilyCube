import { View, Text } from 'react-native';
import { PiggyBank, Star, Target, CheckCircle2, Flame, Zap, Lightbulb } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { KID } from './kidTheme';
import AppBottomSheet from '@/components/AppBottomSheet';
import type { Reward } from '@/store/rewardStore';

const COIN_VAL = 0.10;

// Money-green — "cash value" accent, distinct from brand teal used
// elsewhere in this sheet. Not colors.success (which IS brand teal in this
// app) — kept as one local constant.
const MONEY_GREEN = '#10B981';
// Streak-orange — fire/streak accent, not present in the brand palette;
// left as a distinct literal per design (see final report).
const STREAK_ORANGE = '#FF6600';

export function PiggyBankSheet({
  visible, onClose, colors, isDark, mainCoins, gpCoins, almostAffordable, doneToday, streak, level,
}: {
  visible: boolean; onClose: () => void; colors: any; isDark: boolean;
  mainCoins: number; gpCoins: number; almostAffordable: Reward[];
  doneToday: number; streak: number; level: number;
}) {
  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      title="Piggy Bank"
      subtitle="Your coin balance & cash-out value"
      accentColor={BRAND.amber}
      minHeight="55%">
      <View style={{ gap: 10 }}>
        <View style={{ borderRadius: 18, padding: 16, alignItems: 'center', gap: 5, backgroundColor: isDark ? '#1A1000' : '#FFF8E8', borderWidth: 1.5, borderColor: BRAND.amber + '50' }}>
          <PiggyBank size={34} color={BRAND.amber} />
          <Text style={{ fontSize: KID.hero, fontWeight: '900', color: BRAND.amber, lineHeight: 36 }}>{mainCoins}</Text>
          <Text style={{ fontSize: KID.tiny, color: colors.textTertiary, fontWeight: '600' }}>Main Store Coins</Text>
          {gpCoins > 0 && (
            <View style={{ backgroundColor: BRAND.purple + '20', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, marginTop: 2, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Star size={12} color={BRAND.purple} fill={BRAND.purple} />
              <Text style={{ fontSize: KID.tiny, fontWeight: '800', color: BRAND.purple }}>+{gpCoins} Grandparent Bonus</Text>
            </View>
          )}
        </View>

        <View style={{ borderRadius: 14, padding: 13, backgroundColor: colors.card, borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0', gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: KID.tiny, color: colors.textSecondary }}>Main coins</Text>
            <Text style={{ fontSize: KID.sub, fontWeight: '900', color: MONEY_GREEN }}>${(mainCoins * COIN_VAL).toFixed(2)}</Text>
          </View>
          {gpCoins > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: KID.tiny, color: colors.textSecondary }}>GP bonus</Text>
              <Text style={{ fontSize: KID.sub, fontWeight: '800', color: BRAND.purple }}>${(gpCoins * COIN_VAL).toFixed(2)}</Text>
            </View>
          )}
          <View style={{ height: 1, backgroundColor: isDark ? colors.border : '#F1F5F9' }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: KID.sub, fontWeight: '700', color: colors.textPrimary }}>Total 💰</Text>
            <Text style={{ fontSize: KID.title, fontWeight: '900', color: BRAND.amber }}>${((mainCoins + gpCoins) * COIN_VAL).toFixed(2)}</Text>
          </View>
        </View>

        {almostAffordable.length > 0 && (
          <View style={{ borderRadius: 14, padding: 13, backgroundColor: colors.card, borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0', gap: 9 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Target size={14} color={colors.textPrimary} />
              <Text style={{ fontSize: KID.tiny, fontWeight: '800', color: colors.textPrimary }}>Almost there!</Text>
            </View>
            {almostAffordable.slice(0, 2).map(r => {
              const pct = Math.min(mainCoins / r.cost, 1);
              return (
                <View key={r.id} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: KID.tiny, color: colors.textSecondary }}>{r.emoji} {r.title}</Text>
                    <Text style={{ fontSize: KID.tiny, fontWeight: '700', color: BRAND.amber }}>Need {r.cost - mainCoins} more 🪙</Text>
                  </View>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: isDark ? colors.surface : '#F1F5F9', overflow: 'hidden' }}>
                    <View style={{ height: 6, borderRadius: 3, width: `${Math.round(pct * 100)}%` as any, backgroundColor: BRAND.amber }} />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[
            { Icon: CheckCircle2, value: doneToday,    label: 'Done Today', color: MONEY_GREEN },
            { Icon: Flame,        value: streak,       label: 'Day Streak', color: STREAK_ORANGE },
            { Icon: Zap,          value: `Lv ${level}`, label: 'Level',     color: BRAND.purple },
          ].map(({ Icon, value, label, color }) => (
            <View key={label} style={{ flex: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 4, backgroundColor: colors.card, borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0', alignItems: 'center', gap: 4 }}>
              <Icon size={18} color={color} />
              <Text style={{ fontSize: KID.sub, fontWeight: '900', color }}>{value}</Text>
              <Text style={{ fontSize: KID.tiny, fontWeight: '700', color: colors.textTertiary }}>{label}</Text>
            </View>
          ))}
        </View>

        <View style={{ borderRadius: 14, padding: 13, backgroundColor: BRAND.teal + '12', borderWidth: 1, borderColor: BRAND.teal + '40' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Lightbulb size={14} color={BRAND.teal} />
            <Text style={{ fontSize: KID.tiny, fontWeight: '800', color: BRAND.teal }}>How cash-outs work</Text>
          </View>
          <Text style={{ fontSize: KID.tiny, color: colors.textSecondary, lineHeight: 16 }}>
            10 Coins = $1.00 real allowance! Ask at{' '}
            <Text style={{ fontWeight: '700', color: colors.textPrimary }}>Friday Family Dinner</Text>
            {' '}to cash out.
          </Text>
        </View>
      </View>
    </AppBottomSheet>
  );
}
