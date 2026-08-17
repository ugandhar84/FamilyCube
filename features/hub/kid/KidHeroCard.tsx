import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { BRAND } from '@/components/FamilyCubeLogo';
import { fmtTime } from '../hubUtils';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';

// Identity + progress at a glance: level, streak, coin balance, XP bar,
// today's quest goal, and — if there's a ride coming — a live countdown.
export function KidHeroCard({
  active, colors, isDark, mainCoins, gpCoins, streak, level, xp, xpForNext, xpPct,
  doneToday, questGoal, questPct, confirmedRide, rideCountdown, nextEvent, nextCountdown,
}: {
  active: FamilyMember; colors: any; isDark: boolean;
  mainCoins: number; gpCoins: number; streak: number; level: number;
  xp: number; xpForNext: number; xpPct: number;
  doneToday: number; questGoal: number; questPct: number;
  confirmedRide: FamilyEvent | undefined; rideCountdown: number | null;
  nextEvent: FamilyEvent | undefined; nextCountdown: number | null;
}) {
  const rideUrgent = rideCountdown !== null && rideCountdown <= 15 && rideCountdown >= 0;
  const rideHere   = rideCountdown !== null && rideCountdown <= 2 && rideCountdown >= -5;

  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 14 }}>
      <View style={{ borderRadius: 24, overflow: 'hidden', backgroundColor: isDark ? '#1A0F33' : '#F3EEFF', borderWidth: 1.5, borderColor: BRAND.purple + '40' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, paddingBottom: 10 }}>
          <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: BRAND.purple + '25', alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: BRAND.purple + '70' }}>
            <Text style={{ fontSize: 32 }}>{active.emoji ?? '👤'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 19, fontWeight: '900', color: colors.textPrimary }}>{active.name.split(' ')[0]}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <View style={{ backgroundColor: BRAND.purple + '25', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: BRAND.purple }}>Lv {level} ⚡</Text>
              </View>
              {streak > 0 && (
                <View style={{ backgroundColor: '#FF660020', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Text style={{ fontSize: 10 }}>🔥</Text>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#FF6600' }}>{streak}d streak</Text>
                </View>
              )}
            </View>
          </View>
          <Pressable onPress={() => router.push('/(tabs)/store' as any)} style={{ alignItems: 'center', gap: 2 }}>
            <View style={{ backgroundColor: BRAND.amber + '20', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5, borderColor: BRAND.amber + '50', flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text style={{ fontSize: 14 }}>🪙</Text>
              <Text style={{ fontSize: 22, fontWeight: '900', color: BRAND.amber }}>{mainCoins}</Text>
            </View>
            {gpCoins > 0 && <Text style={{ fontSize: 10, fontWeight: '700', color: BRAND.purple }}>+{gpCoins} ⭐ GP</Text>}
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: 16, gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textTertiary }}>⚡ XP TO LEVEL {level + 1}</Text>
            <Text style={{ fontSize: 10, fontWeight: '700', color: BRAND.teal }}>{xp % xpForNext}/{xpForNext}</Text>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: isDark ? '#2D1F55' : '#E5DAFF', overflow: 'hidden' }}>
            <View style={{ height: 6, borderRadius: 3, width: `${Math.round(xpPct * 100)}%` as any, backgroundColor: BRAND.teal }} />
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 10, gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textTertiary }}>🎯 TODAY'S QUEST GOAL</Text>
            <Text style={{ fontSize: 10, fontWeight: '800', color: doneToday >= questGoal ? '#10B981' : BRAND.amber }}>
              {doneToday >= questGoal ? '✅ All done!' : `${doneToday}/${questGoal}`}
            </Text>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: isDark ? '#2D1F55' : '#E5DAFF', overflow: 'hidden' }}>
            <View style={{ height: 6, borderRadius: 3, width: `${Math.round(questPct * 100)}%` as any, backgroundColor: doneToday >= questGoal ? '#10B981' : BRAND.amber }} />
          </View>
        </View>

        {confirmedRide && rideCountdown !== null && rideCountdown > -10 && (
          <View style={{ marginHorizontal: 16, marginTop: 12, borderRadius: 16,
            backgroundColor: rideHere ? '#064E3B' : rideUrgent ? '#7C2D12' : (isDark ? '#0F2A20' : '#ECFDF5'),
            borderWidth: 1.5, borderColor: rideHere ? '#10B981' : rideUrgent ? '#EF4444' : '#10B98150',
            padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 24 }}>{rideHere ? '🚨' : '🚗'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: rideHere ? '#6EE7B7' : rideUrgent ? '#FCA5A5' : '#10B981' }}>
                {rideHere
                  ? `${confirmedRide.helper?.split(' ')[0]} is HERE! 🎉`
                  : rideUrgent
                    ? `${confirmedRide.helper?.split(' ')[0]} arrives in ${rideCountdown} min — get ready!`
                    : `${confirmedRide.helper?.split(' ')[0]} picks you up in ${rideCountdown}m`}
              </Text>
              <Text style={{ fontSize: 11, color: rideHere ? '#34D399' : rideUrgent ? '#F87171' : '#34D399' }}>
                {confirmedRide.title} · {fmtTime(confirmedRide.time)}
              </Text>
            </View>
          </View>
        )}
        {!confirmedRide && nextEvent && nextCountdown !== null && nextCountdown > 0 && (
          <View style={{ marginHorizontal: 16, marginTop: 12, borderRadius: 14, backgroundColor: isDark ? '#1A1A2E' : '#EEF2FF',
            borderWidth: 1, borderColor: '#6366F130', padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 18 }}>📅</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary }} numberOfLines={1}>
              {nextEvent.title} in {nextCountdown >= 60 ? `${Math.floor(nextCountdown / 60)}h ${nextCountdown % 60}m` : `${nextCountdown}m`}
            </Text>
          </View>
        )}

        <View style={{ height: 14 }} />
      </View>
    </View>
  );
}
