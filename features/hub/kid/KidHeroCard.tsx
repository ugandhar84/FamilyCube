import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Zap, Target, CheckCircle2, AlertTriangle, PartyPopper, Car, Calendar } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { fmtTime } from '../hubUtils';
import { KID } from './kidTheme';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';

// Money-green — "ride is here / goal met" positive accent, distinct from
// brand teal (used elsewhere in this card for XP progress). Not colors.success
// (which IS brand teal in this app) — kept as one local constant.
const MONEY_GREEN = '#10B981';
// Streak-orange — fire/streak accent, not present in the brand palette;
// left as a distinct literal per design (see final report).
const STREAK_ORANGE = '#FF6600';
// Indigo — "next event" accent, distinct from brand purple; kept as one
// local constant instead of a repeated bare hex.
const INDIGO_ACCENT = '#6366F1';

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
  const goalMet = doneToday >= questGoal;

  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 14 }}>
      <View style={{ borderRadius: 24, overflow: 'hidden', backgroundColor: isDark ? '#1A0F33' : '#F3EEFF', borderWidth: 1.5, borderColor: BRAND.purple + '40' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, paddingBottom: 12 }}>
          <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: BRAND.purple + '25', alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: BRAND.purple + '70' }}>
            <Text style={{ fontSize: KID.hero }}>{active.emoji ?? '👤'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: KID.title, fontWeight: '900', color: colors.textPrimary }}>{active.name.split(' ')[0]}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <View style={{ backgroundColor: BRAND.purple + '25', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Zap size={11} color={BRAND.purple} fill={BRAND.purple} />
                <Text style={{ fontSize: KID.tiny, fontWeight: '800', color: BRAND.purple }}>Lv {level}</Text>
              </View>
              {streak > 0 && (
                <View style={{ backgroundColor: `${STREAK_ORANGE}20`, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Text style={{ fontSize: KID.tiny }}>🔥</Text>
                  <Text style={{ fontSize: KID.tiny, fontWeight: '800', color: STREAK_ORANGE }}>{streak}d streak</Text>
                </View>
              )}
            </View>
          </View>
          <Pressable onPress={() => router.push('/(tabs)/store' as any)} style={{ alignItems: 'center', gap: 3 }}>
            <View style={{ backgroundColor: BRAND.amber + '20', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1.5, borderColor: BRAND.amber + '50', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: KID.body }}>🪙</Text>
              <Text style={{ fontSize: KID.hero, fontWeight: '900', color: BRAND.amber, lineHeight: 34 }}>{mainCoins}</Text>
            </View>
            {gpCoins > 0 && <Text style={{ fontSize: KID.tiny, fontWeight: '700', color: BRAND.purple }}>+{gpCoins} ⭐ GP</Text>}
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: 16, gap: 5 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Zap size={12} color={colors.textTertiary} />
              <Text style={{ fontSize: KID.sub, fontWeight: '700', color: colors.textTertiary }}>XP to level {level + 1}</Text>
            </View>
            <Text style={{ fontSize: KID.sub, fontWeight: '700', color: BRAND.teal }}>{xp % xpForNext}/{xpForNext}</Text>
          </View>
          <View style={{ height: 7, borderRadius: 4, backgroundColor: isDark ? '#2D1F55' : '#E5DAFF', overflow: 'hidden' }}>
            <View style={{ height: 7, borderRadius: 4, width: `${Math.round(xpPct * 100)}%` as any, backgroundColor: BRAND.teal }} />
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 5 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Target size={12} color={colors.textTertiary} />
              <Text style={{ fontSize: KID.sub, fontWeight: '700', color: colors.textTertiary }}>Today's quest goal</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {goalMet && <CheckCircle2 size={13} color={MONEY_GREEN} />}
              <Text style={{ fontSize: KID.sub, fontWeight: '800', color: goalMet ? MONEY_GREEN : BRAND.amber }}>
                {goalMet ? 'All done!' : `${doneToday}/${questGoal}`}
              </Text>
            </View>
          </View>
          <View style={{ height: 7, borderRadius: 4, backgroundColor: isDark ? '#2D1F55' : '#E5DAFF', overflow: 'hidden' }}>
            <View style={{ height: 7, borderRadius: 4, width: `${Math.round(questPct * 100)}%` as any, backgroundColor: goalMet ? MONEY_GREEN : BRAND.amber }} />
          </View>
        </View>

        {confirmedRide && rideCountdown !== null && rideCountdown > -10 && (
          <View style={{ marginHorizontal: 16, marginTop: 12, borderRadius: 16,
            backgroundColor: rideHere ? '#064E3B' : rideUrgent ? '#7C2D12' : (isDark ? '#0F2A20' : '#ECFDF5'),
            borderWidth: 1.5, borderColor: rideHere ? MONEY_GREEN : rideUrgent ? colors.danger : `${MONEY_GREEN}50`,
            padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {rideHere
              ? <PartyPopper size={24} color="#6EE7B7" />
              : rideUrgent
                ? <AlertTriangle size={24} color="#FCA5A5" />
                : <Car size={24} color={MONEY_GREEN} />}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: KID.sub, fontWeight: '800', color: rideHere ? '#6EE7B7' : rideUrgent ? '#FCA5A5' : MONEY_GREEN }}>
                {rideHere
                  ? `${confirmedRide.helper?.split(' ')[0]} is HERE! 🎉`
                  : rideUrgent
                    ? `${confirmedRide.helper?.split(' ')[0]} arrives in ${rideCountdown} min — get ready!`
                    : `${confirmedRide.helper?.split(' ')[0]} picks you up in ${rideCountdown}m`}
              </Text>
              <Text style={{ fontSize: KID.tiny, color: rideHere ? '#34D399' : rideUrgent ? '#F87171' : '#34D399', marginTop: 1 }}>
                {confirmedRide.title} · {fmtTime(confirmedRide.time)}
              </Text>
            </View>
          </View>
        )}
        {!confirmedRide && nextEvent && nextCountdown !== null && nextCountdown > 0 && (
          <View style={{ marginHorizontal: 16, marginTop: 12, borderRadius: 14, backgroundColor: isDark ? '#1A1A2E' : '#EEF2FF',
            borderWidth: 1, borderColor: `${INDIGO_ACCENT}30`, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Calendar size={17} color={INDIGO_ACCENT} />
            <Text style={{ fontSize: KID.sub, fontWeight: '700', color: colors.textSecondary }} numberOfLines={1}>
              {nextEvent.title} in {nextCountdown >= 60 ? `${Math.floor(nextCountdown / 60)}h ${nextCountdown % 60}m` : `${nextCountdown}m`}
            </Text>
          </View>
        )}

        <View style={{ height: 14 }} />
      </View>
    </View>
  );
}
