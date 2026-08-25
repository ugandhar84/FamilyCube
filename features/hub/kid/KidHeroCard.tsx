import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Zap, Target, CheckCircle2, Calendar, Flame, Car } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { KID } from './kidTheme';
import { fmtTime } from '../hubUtils';
import { eventAssignee } from '@/store/eventStore';
import { driverLabelByName } from '@/lib/format';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';

// Money-green — "goal met" positive accent on the quest-progress bar; also
// matches the "ride" accent used throughout the Kid Hub (KidNeedsYouSection's
// ride row) so the hero's own ride chip reads as the same fact, not a
// differently-colored duplicate.
const MONEY_GREEN = '#10B981';

// Identity + progress at a glance: level, streak, coin balance, XP bar,
// today's quest goal, and — if there's a ride coming — a live countdown.
// No card box/border/shadow (deliberately not a boxed surface) — the fun
// comes from shape, color, and a game-HUD-style avatar ring/coin pill
// instead of a flat enclosing container.
export function KidHeroCard({
  active, colors, isDark, mainCoins, gpCoins, streak, level, xp, xpForNext, xpPct,
  doneToday, questGoal, questPct, confirmedRide, rideCountdown, members, nextEvent, nextCountdown,
}: {
  active: FamilyMember; colors: any; isDark: boolean;
  mainCoins: number; gpCoins: number; streak: number; level: number;
  xp: number; xpForNext: number; xpPct: number;
  doneToday: number; questGoal: number; questPct: number;
  confirmedRide: FamilyEvent | undefined;
  // The single most time-sensitive fact belongs right here in the
  // glanceable hero card, not only competing for space in the "Needs You"
  // list below — that list keeps the full actionable ride banner (confirm
  // pickup / alert my parent), this is just the at-a-glance countdown.
  rideCountdown?: number | null;
  members?: FamilyMember[];
  nextEvent: FamilyEvent | undefined; nextCountdown: number | null;
}) {
  const goalMet = doneToday >= questGoal;

  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 20, gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{
          width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center',
          backgroundColor: colors.kidLight, borderWidth: 3, borderColor: colors.kid,
          shadowColor: colors.kid, shadowOpacity: isDark ? 0 : 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4,
        }}>
          <Text style={{ fontSize: 30 }}>{active.emoji ?? '👤'}</Text>
          <View style={{
            position: 'absolute', bottom: -4, alignSelf: 'center',
            backgroundColor: colors.kid, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2,
            borderWidth: 2, borderColor: isDark ? colors.background : '#fff',
            flexDirection: 'row', alignItems: 'center', gap: 2,
          }}>
            <Zap size={9} color="#fff" fill="#fff" />
            <Text style={{ fontSize: 10, fontWeight: '900', color: '#fff' }}>{level}</Text>
          </View>
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: KID.title + 3, fontWeight: '900', color: colors.textPrimary }} numberOfLines={1}>
            Hey {active.name.split(' ')[0]}! 👋
          </Text>
          {streak > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5, alignSelf: 'flex-start',
              backgroundColor: '#F9731618', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Flame size={12} color="#F97316" fill="#F97316" />
              <Text style={{ fontSize: KID.sub, fontWeight: '800', color: '#F97316' }}>{streak}-day streak!</Text>
            </View>
          )}
        </View>

        <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=kid member=${active.name} tapped "coin balance" on "KidHeroCard" → navigate to /(tabs)/store [features/hub/kid/KidHeroCard.tsx:62]`); router.push('/(tabs)/store' as any); }}
          style={{ alignItems: 'center', gap: 3, flexShrink: 0 }}>
          <View style={{
            backgroundColor: BRAND.amber, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9,
            flexDirection: 'row', alignItems: 'center', gap: 6,
            shadowColor: BRAND.amber, shadowOpacity: isDark ? 0 : 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3,
          }}>
            <Text style={{ fontSize: KID.body }}>🪙</Text>
            <Text style={{ fontSize: KID.title, fontWeight: '900', color: '#fff' }} numberOfLines={1}>{mainCoins}</Text>
          </View>
          {gpCoins > 0 && <Text style={{ fontSize: KID.tiny, fontWeight: '800', color: colors.textSecondary }}>+{gpCoins} ⭐ GP</Text>}
        </Pressable>
      </View>

      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: colors.kid + '20', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={10} color={colors.kid} fill={colors.kid} />
            </View>
            <Text style={{ fontSize: KID.sub, fontWeight: '800', color: colors.textSecondary }}>XP to level {level + 1}</Text>
          </View>
          <Text style={{ fontSize: KID.sub, fontWeight: '800', color: colors.kid }}>{xp % xpForNext}/{xpForNext}</Text>
        </View>
        <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.kid + '15', overflow: 'hidden' }}>
          <View style={{ height: 10, borderRadius: 5, width: `${Math.max(6, Math.round(xpPct * 100))}%` as any, backgroundColor: colors.kid }} />
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: (goalMet ? MONEY_GREEN : BRAND.amber) + '20', alignItems: 'center', justifyContent: 'center' }}>
              <Target size={10} color={goalMet ? MONEY_GREEN : BRAND.amber} />
            </View>
            <Text style={{ fontSize: KID.sub, fontWeight: '800', color: colors.textSecondary }}>Today's quest goal</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {goalMet && <CheckCircle2 size={14} color={MONEY_GREEN} />}
            <Text style={{ fontSize: KID.sub, fontWeight: '900', color: goalMet ? MONEY_GREEN : colors.textPrimary }}>
              {goalMet ? 'All done! 🎉' : `${doneToday}/${questGoal}`}
            </Text>
          </View>
        </View>
        <View style={{ height: 10, borderRadius: 5, backgroundColor: (goalMet ? MONEY_GREEN : BRAND.amber) + '15', overflow: 'hidden' }}>
          <View style={{ height: 10, borderRadius: 5, width: `${Math.max(6, Math.round(questPct * 100))}%` as any, backgroundColor: goalMet ? MONEY_GREEN : BRAND.amber }} />
        </View>
      </View>

      {confirmedRide && rideCountdown != null && rideCountdown > 0 ? (
        <View style={{ borderRadius: 16, backgroundColor: isDark ? MONEY_GREEN + '1f' : '#ECFDF5',
          padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: MONEY_GREEN + '25', alignItems: 'center', justifyContent: 'center' }}>
            <Car size={15} color={MONEY_GREEN} />
          </View>
          <Text style={{ fontSize: KID.sub, fontWeight: '800', color: MONEY_GREEN, flex: 1 }} numberOfLines={1}>
            {driverLabelByName(eventAssignee(confirmedRide).name, members ?? []) ?? 'Ride'} picks you up
            {rideCountdown >= 60 ? ` at ${fmtTime(confirmedRide.time)}` : ` in ${rideCountdown}m`}
          </Text>
        </View>
      ) : nextEvent && nextCountdown !== null && nextCountdown > 0 && (
        <View style={{ borderRadius: 16, backgroundColor: colors.tealLight,
          padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.teal + '25', alignItems: 'center', justifyContent: 'center' }}>
            <Calendar size={15} color={colors.teal} />
          </View>
          <Text style={{ fontSize: KID.sub, fontWeight: '800', color: colors.teal, flex: 1 }} numberOfLines={1}>
            {nextEvent.title} in {nextCountdown >= 60 ? `${Math.floor(nextCountdown / 60)}h ${nextCountdown % 60}m` : `${nextCountdown}m`}
          </Text>
        </View>
      )}
    </View>
  );
}
