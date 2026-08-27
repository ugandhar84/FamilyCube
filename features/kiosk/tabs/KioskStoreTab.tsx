/**
 * KioskStoreTab — reward grid for kiosk mode: bigger cards than the phone's
 * StoreScreen since there's width to spare, same redeem flow (deduct coins
 * via familyStore, then rewardStore.redeemReward), no admin/edit affordances
 * here (managing the reward catalog stays a phone/parent-profile action).
 */
import { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, Alert, StyleSheet } from 'react-native';
import { TYPO } from '@/constants/theme';
import { useRewardStore } from '@/store/rewardStore';
import { useFamilyStore } from '@/store/familyStore';
import type { FamilyMember } from '@/store/familyStore';

export function KioskStoreTab({ active, colors, isDark }: {
  active: FamilyMember; colors: any; isDark: boolean;
}) {
  const { rewards, redeemReward } = useRewardStore();
  const awardCoins = useFamilyStore(s => (s as any).awardCoins);

  const eligible = useMemo(
    () => rewards.filter(r => r.available && (!r.eligibleMemberIds || r.eligibleMemberIds.includes(active.id))),
    [rewards, active.id],
  );

  const coins = (active as any).coins ?? 0;

  const onRedeem = (reward: typeof rewards[number]) => {
    if (coins < reward.cost) {
      Alert.alert('Not enough coins', `${reward.title} costs ${reward.cost} 🪙 — ${active.name.split(' ')[0]} has ${coins}.`);
      return;
    }
    Alert.alert('Redeem this reward?', `Spend ${reward.cost} 🪙 on "${reward.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Redeem', onPress: () => {
          const ok = redeemReward(reward.id, active.id);
          if (ok && typeof awardCoins === 'function') awardCoins(active.id, -reward.cost);
        },
      },
    ]);
  };

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Text style={[s.title, { color: colors.textPrimary }]}>Reward Store</Text>
        <View style={[s.coinPill, { backgroundColor: colors.amberLight }]}>
          <Text style={[s.coinText, { color: colors.amber }]}>{coins} 🪙 · {active.name.split(' ')[0]}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.grid} showsVerticalScrollIndicator={false}>
        {eligible.map(r => {
          const affordable = coins >= r.cost;
          return (
            <Pressable
              key={r.id}
              onPress={() => onRedeem(r)}
              style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: affordable ? 1 : 0.5 }]}
            >
              <Text style={s.emoji}>{r.emoji}</Text>
              <Text style={[s.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>{r.title}</Text>
              <View style={[s.costPill, { backgroundColor: colors.amberLight }]}>
                <Text style={[s.costText, { color: colors.amber }]}>{r.cost} 🪙</Text>
              </View>
            </Pressable>
          );
        })}
        {eligible.length === 0 && (
          <Text style={[s.empty, { color: colors.textTertiary }]}>No rewards available right now</Text>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '800' },
  coinPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  coinText: { fontSize: TYPO.label, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  card: { width: 180, borderRadius: 18, borderWidth: 1, padding: 16, alignItems: 'center', gap: 8 },
  emoji: { fontSize: 36 },
  cardTitle: { fontSize: TYPO.body, fontWeight: '800', textAlign: 'center' },
  costPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
  costText: { fontSize: 12, fontWeight: '800' },
  empty: { fontSize: TYPO.body, fontWeight: '600', textAlign: 'center', width: '100%', marginTop: 40 },
});
