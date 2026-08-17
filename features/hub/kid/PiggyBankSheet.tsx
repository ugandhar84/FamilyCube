import { View, Text } from 'react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import AppBottomSheet from '@/components/AppBottomSheet';
import type { Reward } from '@/store/rewardStore';

const COIN_VAL = 0.10;

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
      title="🐷 Piggy Bank"
      subtitle="Your coin balance & cash-out value"
      accentColor={BRAND.amber}
      minHeight="55%">
      <View style={{ gap: 10 }}>
        <View style={{ borderRadius: 18, padding: 14, alignItems: 'center', gap: 4, backgroundColor: isDark ? '#1A1000' : '#FFF8E8', borderWidth: 1.5, borderColor: BRAND.amber + '50' }}>
          <Text style={{ fontSize: 32 }}>🐷</Text>
          <Text style={{ fontSize: 34, fontWeight: '900', color: BRAND.amber, lineHeight: 38 }}>{mainCoins}</Text>
          <Text style={{ fontSize: 11, color: colors.textTertiary, fontWeight: '600' }}>Main Store Coins</Text>
          {gpCoins > 0 && (
            <View style={{ backgroundColor: BRAND.purple + '20', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, marginTop: 2, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text style={{ fontSize: 11 }}>⭐</Text>
              <Text style={{ fontSize: 11, fontWeight: '800', color: BRAND.purple }}>+{gpCoins} Grandparent Bonus</Text>
            </View>
          )}
        </View>

        <View style={{ borderRadius: 14, padding: 12, backgroundColor: isDark ? colors.card : '#fff', borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0', gap: 7 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 11, color: colors.textSecondary }}>Main coins</Text>
            <Text style={{ fontSize: 13, fontWeight: '900', color: '#10B981' }}>${(mainCoins * COIN_VAL).toFixed(2)}</Text>
          </View>
          {gpCoins > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 11, color: colors.textSecondary }}>GP bonus</Text>
              <Text style={{ fontSize: 12, fontWeight: '800', color: BRAND.purple }}>${(gpCoins * COIN_VAL).toFixed(2)}</Text>
            </View>
          )}
          <View style={{ height: 1, backgroundColor: isDark ? colors.border : '#F1F5F9' }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textPrimary }}>Total 💰</Text>
            <Text style={{ fontSize: 15, fontWeight: '900', color: BRAND.amber }}>${((mainCoins + gpCoins) * COIN_VAL).toFixed(2)}</Text>
          </View>
        </View>

        {almostAffordable.length > 0 && (
          <View style={{ borderRadius: 14, padding: 12, backgroundColor: isDark ? colors.card : '#fff', borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0', gap: 8 }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textPrimary }}>🎯 Almost there!</Text>
            {almostAffordable.slice(0, 2).map(r => {
              const pct = Math.min(mainCoins / r.cost, 1);
              return (
                <View key={r.id} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 11, color: colors.textSecondary }}>{r.emoji} {r.title}</Text>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: BRAND.amber }}>Need {r.cost - mainCoins} more 🪙</Text>
                  </View>
                  <View style={{ height: 5, borderRadius: 3, backgroundColor: isDark ? colors.surface : '#F1F5F9', overflow: 'hidden' }}>
                    <View style={{ height: 5, borderRadius: 3, width: `${Math.round(pct * 100)}%` as any, backgroundColor: BRAND.amber }} />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[
            { icon: '✅', value: doneToday,    label: 'Done Today', color: '#10B981' },
            { icon: '🔥', value: streak,       label: 'Day Streak', color: '#FF6600' },
            { icon: '⚡', value: `Lv ${level}`, label: 'Level',     color: BRAND.purple },
          ].map(({ icon, value, label, color }) => (
            <View key={label} style={{ flex: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 4, backgroundColor: isDark ? colors.card : '#fff', borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0', alignItems: 'center', gap: 2 }}>
              <Text style={{ fontSize: 16 }}>{icon}</Text>
              <Text style={{ fontSize: 14, fontWeight: '900', color }}>{value}</Text>
              <Text style={{ fontSize: 9, fontWeight: '700', color: colors.textTertiary }}>{label}</Text>
            </View>
          ))}
        </View>

        <View style={{ borderRadius: 14, padding: 12, backgroundColor: BRAND.teal + '12', borderWidth: 1, borderColor: BRAND.teal + '40' }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: BRAND.teal, marginBottom: 3 }}>💡 How cash-outs work</Text>
          <Text style={{ fontSize: 11, color: colors.textSecondary, lineHeight: 16 }}>
            10 Coins = $1.00 real allowance! Ask at{' '}
            <Text style={{ fontWeight: '700', color: colors.textPrimary }}>Friday Family Dinner</Text>
            {' '}to cash out.
          </Text>
        </View>
      </View>
    </AppBottomSheet>
  );
}
