/**
 * HealthRewardsSection — collapsed perks strip inside HealthScreen.
 * Shows coin balance + top rewards; taps through to full StoreScreen.
 */
import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRewardStore } from '@/store/rewardStore';
import { useFamilyStore } from '@/store/familyStore';
import { TYPO } from '@/constants/theme';

const CAT_EMOJI: Record<string, string> = {
  Treats: '🍬', Experiences: '🎡', 'Screen Time': '📱', Privileges: '🔑', Special: '⭐',
};

interface Props {
  colors: any;
  isDark: boolean;
  accent: string;
}

export function HealthRewardsSection({ colors, isDark, accent }: Props) {
  const [open, setOpen] = useState(false);
  const rewards = useRewardStore(s => s.rewards);
  const { members, activeMemberId } = useFamilyStore();

  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const coins = activeMember?.coins ?? 0;

  const topRewards = rewards.filter(r => r.available !== false).slice(0, 6);

  const border = isDark ? '#2D2D4E' : '#E5E7EB';
  const card   = isDark ? '#1F1F38' : '#FFFFFF';

  return (
    <View style={{ marginBottom: 20 }}>
      {/* Collapsible header */}
      <TouchableOpacity
        onPress={() => setOpen(o => !o)}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          backgroundColor: card, borderRadius: open ? 0 : 14, borderTopLeftRadius: 14, borderTopRightRadius: 14,
          borderWidth: 1, borderColor: open ? accent + '50' : border,
          borderBottomWidth: open ? 0 : 1,
          paddingHorizontal: 14, paddingVertical: 12, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 34, height: 34, borderRadius: 10,
            backgroundColor: accent + '18', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 18 }}>🎁</Text>
          </View>
          <View>
            <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>Perks & Rewards</Text>
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 1 }}>
              {rewards.length} rewards · {coins} coins
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ backgroundColor: accent + '18', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4,
            borderWidth: 1, borderColor: accent + '35' }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: accent }}>🪙 {coins}</Text>
          </View>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textTertiary} />
        </View>
      </TouchableOpacity>

      {/* Expanded content */}
      {open && (
        <View style={{ backgroundColor: card, borderWidth: 1, borderTopWidth: 0, borderColor: accent + '50',
          borderBottomLeftRadius: 14, borderBottomRightRadius: 14, paddingBottom: 12 }}>
          {topRewards.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 24, gap: 6 }}>
              <Text style={{ fontSize: 32 }}>🎁</Text>
              <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>No rewards yet</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 12, gap: 8 }}>
              {topRewards.map(r => (
                <View key={r.id} style={{ width: 120, backgroundColor: isDark ? '#2D2D4E' : '#F9FAFB',
                  borderRadius: 12, padding: 10, borderWidth: 1, borderColor: border }}>
                  <Text style={{ fontSize: 24, marginBottom: 4 }}>
                    {CAT_EMOJI[r.category ?? 'Special'] ?? '⭐'}
                  </Text>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary }}
                    numberOfLines={2}>{r.title}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 5 }}>
                    <Text style={{ fontSize: TYPO.micro, color: accent, fontWeight: '800' }}>🪙 {r.cost ?? 0}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          <TouchableOpacity
            onPress={() => router.push('/(tabs)/store')}
            style={{ marginHorizontal: 12, marginTop: 10, paddingVertical: 10, borderRadius: 10,
              backgroundColor: accent + '18', borderWidth: 1, borderColor: accent + '40',
              alignItems: 'center' }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: accent }}>See all rewards →</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
