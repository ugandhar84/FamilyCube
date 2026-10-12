import { View, Text } from 'react-native';
import { CheckCircle2, Calendar, Flame } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { KID } from './kidTheme';
import { KidSectionHeader } from './KidSectionHeader';
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
  active, colors, isDark, mainCoins, gpCoins, streak, level,
  doneToday, questGoal, questPct, confirmedRide, rideCountdown, members, nextEvent, nextCountdown,
}: {
  active: FamilyMember; colors: any; isDark: boolean;
  mainCoins: number; gpCoins: number; streak: number; level: number;
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
  // "My Pulse" — the Kid Hub's own instance of the Parent Hub's
  // FamilyPulseCard shell (features/hub/parent/FamilyPulseCard.tsx): same
  // card geometry (gradient-tinted card, 24px radius, eyebrow+headline+body
  // on the left, a 70x70 ringed stat dial on the right) ["why can't we use
  // the parent family pulse hero as the My Pulse and show the ring to show
  // the Quest progress and the COINS, for kids"] — the ring shows quest
  // completion (an arc, not a static count) instead of the parent card's
  // sharing-count ring, and coins sit inside the ring's center label
  // instead of the parent card's "N/M sharing" text.
  const encouragement = goalMet ? "You're on fire today! 🔥" : `${questGoal - doneToday} quest${questGoal - doneToday === 1 ? '' : 's'} to go — you've got this!`;
  const pct = Math.max(0, Math.min(1, questPct));

  return (
    <View style={{
      marginHorizontal: 16, marginBottom: 16,
      flexDirection: 'row', flexWrap: 'wrap', gap: 16, padding: 20,
      borderWidth: 1, borderColor: colors.border, borderRadius: 24,
      backgroundColor: colors.tealLight,
      shadowColor: colors.teal, shadowOffset: { width: 0, height: 12 }, shadowOpacity: isDark ? 0 : 0.08, shadowRadius: 30,
    }}>
      <View style={{ flex: 1, minWidth: 180 }}>
        <KidSectionHeader label="MY PULSE" accent={colors.teal} colors={colors} />

        <Text style={{ fontSize: 21, fontWeight: '700', letterSpacing: -0.5, color: colors.textPrimary, marginTop: 6, marginBottom: 6 }}>
          {encouragement}
        </Text>

        {streak > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Flame size={15} color="#F97316" fill="#F97316" />
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary }}>{streak}-day streak!</Text>
          </View>
        )}

        {/* Coin balances — same role as the parent card's status line,
            now showing the kid's two balances instead of a sentence. */}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
          <Text style={{ fontSize: 26, fontWeight: '700', color: colors.textPrimary }}>{mainCoins}</Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary }}>coins</Text>
          {gpCoins > 0 && (
            <View style={{ backgroundColor: isDark ? BRAND.purple + '20' : BRAND.purple + '16',
              borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 2 }}>
              <Text style={{ fontSize: KID.tiny, fontWeight: '800', color: BRAND.purple }}>+{gpCoins} ⭐ GP</Text>
            </View>
          )}
        </View>
        <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 2 }}>Level {level} · tap your coins to see rewards</Text>
      </View>

      {/* Quest-progress ring — same 70x70/5px-border geometry as
          FamilyPulseCard's sharing-ring, but the border's top-arc color
          swaps to the done/goal-met accent so the ring itself reads as a
          progress dial, not just a static badge. RN can't stroke a true
          partial-arc border, so goalMet flips the whole ring to solid
          money-green as the "full" state — matching the hero's own
          CheckCircle2 "All done!" treatment elsewhere in this file. */}
      <View style={{
        width: 70, height: 70, borderRadius: 35,
        borderWidth: 5, borderColor: colors.teal + '2E',
        borderTopColor: goalMet ? MONEY_GREEN : colors.teal,
        borderRightColor: pct > 0.5 ? (goalMet ? MONEY_GREEN : colors.teal) : colors.teal + '2E',
        alignItems: 'center', justifyContent: 'center',
      }}>
        {goalMet && <CheckCircle2 size={14} color={MONEY_GREEN} style={{ marginBottom: 1 }} />}
        <Text style={{ fontSize: 16, fontWeight: '700', color: goalMet ? MONEY_GREEN : colors.textPrimary }}>
          {doneToday}/{questGoal}
        </Text>
        <Text style={{ fontSize: 10, color: colors.textTertiary }}>quests</Text>
      </View>

      {/* A confirmed ride gets its own full row (with confirm/dismiss/send-
          driver-late actions) in KidNeedsYouSection right below this card —
          showing the identical "picks you up at X" line here too was pure
          duplication (confirmed live: the same banner rendered twice on
          screen, one with no way to dismiss it). This card only shows the
          next-event fallback now, for whatever's coming up that ISN'T
          already covered by a Needs You ride row. */}
      {!confirmedRide && nextEvent && nextCountdown !== null && nextCountdown > 0 && (
        <View style={{ borderRadius: 16, backgroundColor: isDark ? colors.card : '#fff',
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
