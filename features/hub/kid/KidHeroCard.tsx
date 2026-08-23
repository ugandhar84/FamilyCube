import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Zap, Target, CheckCircle2, Calendar } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { KID } from './kidTheme';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';

// Brand gradient — purple (GROW) sweeping into pink (CARE), the two cube
// faces this card sits closest to in spirit (identity + reward). Energetic
// "game HUD" background instead of a flat pastel card; dark mode deepens
// both stops so it still reads as a distinct surface against the page.
const HERO_GRADIENT_LIGHT: [string, string] = [BRAND.purple, BRAND.pink];
const HERO_GRADIENT_DARK: [string, string] = ['#3D2166', '#5C1F3F'];

// Money-green — "goal met" positive accent on the quest-progress bar, kept
// distinct from the white fill used everywhere else on this gradient.
const MONEY_GREEN = '#10B981';

// Identity + progress at a glance: level, streak, coin balance, XP bar,
// today's quest goal, and — if there's a ride coming — a live countdown.
export function KidHeroCard({
  active, colors, isDark, mainCoins, gpCoins, streak, level, xp, xpForNext, xpPct,
  doneToday, questGoal, questPct, confirmedRide, nextEvent, nextCountdown,
}: {
  active: FamilyMember; colors: any; isDark: boolean;
  mainCoins: number; gpCoins: number; streak: number; level: number;
  xp: number; xpForNext: number; xpPct: number;
  doneToday: number; questGoal: number; questPct: number;
  confirmedRide: FamilyEvent | undefined;
  nextEvent: FamilyEvent | undefined; nextCountdown: number | null;
}) {
  const goalMet = doneToday >= questGoal;

  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 18 }}>
      <LinearGradient
        colors={isDark ? HERO_GRADIENT_DARK : HERO_GRADIENT_LIGHT}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ borderRadius: 24, overflow: 'hidden' }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, paddingBottom: 12 }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.5)' }}>
            <Text style={{ fontSize: 24 }}>{active.emoji ?? '👤'}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: KID.title, fontWeight: '900', color: '#fff' }} numberOfLines={1}>{active.name.split(' ')[0]}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Zap size={11} color="#fff" fill="#fff" />
                <Text style={{ fontSize: KID.tiny, fontWeight: '800', color: '#fff' }}>Lv {level}</Text>
              </View>
              {streak > 0 && (
                <View style={{ backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Text style={{ fontSize: KID.tiny }}>🔥</Text>
                  <Text style={{ fontSize: KID.tiny, fontWeight: '800', color: '#fff' }}>{streak}d streak</Text>
                </View>
              )}
            </View>
          </View>
          <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=kid member=${active.name} tapped "coin balance" on "KidHeroCard" → navigate to /(tabs)/store [features/hub/kid/KidHeroCard.tsx:62]`); router.push('/(tabs)/store' as any); }} style={{ alignItems: 'center', gap: 3, flexShrink: 0 }}>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text style={{ fontSize: KID.sub }}>🪙</Text>
              <Text style={{ fontSize: KID.title, fontWeight: '900', color: BRAND.amber }} numberOfLines={1}>{mainCoins}</Text>
            </View>
            {gpCoins > 0 && <Text style={{ fontSize: KID.tiny, fontWeight: '700', color: '#fff' }}>+{gpCoins} ⭐ GP</Text>}
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: 16, gap: 5 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Zap size={12} color="rgba(255,255,255,0.75)" />
              <Text style={{ fontSize: KID.sub, fontWeight: '700', color: 'rgba(255,255,255,0.75)' }}>XP to level {level + 1}</Text>
            </View>
            <Text style={{ fontSize: KID.sub, fontWeight: '700', color: '#fff' }}>{xp % xpForNext}/{xpForNext}</Text>
          </View>
          <View style={{ height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}>
            <View style={{ height: 7, borderRadius: 4, width: `${Math.round(xpPct * 100)}%` as any, backgroundColor: '#fff' }} />
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 5 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Target size={12} color="rgba(255,255,255,0.75)" />
              <Text style={{ fontSize: KID.sub, fontWeight: '700', color: 'rgba(255,255,255,0.75)' }}>Today's quest goal</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {goalMet && <CheckCircle2 size={13} color="#fff" />}
              <Text style={{ fontSize: KID.sub, fontWeight: '800', color: '#fff' }}>
                {goalMet ? 'All done!' : `${doneToday}/${questGoal}`}
              </Text>
            </View>
          </View>
          <View style={{ height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}>
            <View style={{ height: 7, borderRadius: 4, width: `${Math.round(questPct * 100)}%` as any, backgroundColor: goalMet ? MONEY_GREEN : '#fff' }} />
          </View>
        </View>

        {!confirmedRide && nextEvent && nextCountdown !== null && nextCountdown > 0 && (
          <View style={{ marginHorizontal: 16, marginTop: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.16)',
            padding: 11, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Calendar size={17} color="#fff" />
            <Text style={{ fontSize: KID.sub, fontWeight: '700', color: '#fff' }} numberOfLines={1}>
              {nextEvent.title} in {nextCountdown >= 60 ? `${Math.floor(nextCountdown / 60)}h ${nextCountdown % 60}m` : `${nextCountdown}m`}
            </Text>
          </View>
        )}

        <View style={{ height: 14 }} />
      </LinearGradient>
    </View>
  );
}
