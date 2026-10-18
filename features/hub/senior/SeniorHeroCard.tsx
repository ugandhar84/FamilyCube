import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { KidSectionHeader } from '../kid/KidSectionHeader';
import { GP } from './seniorTheme';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';

/**
 * SeniorHeroCard — the grandparent Hub's "My day" card, same shell as the parent Family Pulse and the kid/teen hero: a tinted
 * rounded card, eyebrow + headline + one line on the left, a ringed dial on the right. Here the dial shows today's medications taken,
 * and the one line is the most time-sensitive fact (a confirmed ride coming up, otherwise the medication count). Larger type than
 * the other Hubs, per the senior scale.
 */
export function SeniorHeroCard({ active, colors, isDark, medsTotal, medsTaken, confirmedRide, rideCountdown, pendingCount }: {
  active: FamilyMember; colors: any; isDark: boolean;
  medsTotal: number; medsTaken: number;
  confirmedRide: FamilyEvent | undefined; rideCountdown: number | null;
  /** Things waiting on this person (ride asks, assigned tasks, approvals). */
  pendingCount: number;
}) {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const first = active.name.split(' ')[0];
  const pct = medsTotal > 0 ? Math.max(0, Math.min(1, medsTaken / medsTotal)) : 0;
  const R = 28, C = 2 * Math.PI * R;

  const rideLine = confirmedRide && rideCountdown !== null && rideCountdown > -30
    ? (rideCountdown <= 0 ? `Your ride is here: ${confirmedRide.title}` : `Ride in ${rideCountdown < 60 ? `${rideCountdown} min` : `${Math.round(rideCountdown / 60)} hr`}: ${confirmedRide.title}`)
    : null;
  const line = rideLine
    ?? (pendingCount > 0 ? `${pendingCount} thing${pendingCount === 1 ? '' : 's'} waiting for you` : medsTotal > 0 ? (medsTaken >= medsTotal ? 'All medications taken today' : `${medsTotal - medsTaken} medication${medsTotal - medsTaken === 1 ? '' : 's'} left today`) : 'Nothing needs you right now');

  return (
    <View style={{
      marginHorizontal: 16, marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 16, padding: 18,
      borderWidth: 1, borderColor: colors.border, borderRadius: 24, backgroundColor: colors.tealLight,
    }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <KidSectionHeader label="MY DAY" accent={colors.teal} colors={colors} />
        <Text style={{ fontSize: GP.title + 4, fontWeight: '800', color: colors.textPrimary }} numberOfLines={2}>Good {part}, {first}</Text>
        <Text style={{ fontSize: GP.body, color: colors.textSecondary, marginTop: 4, lineHeight: 22 }} numberOfLines={3}>{line}</Text>
      </View>
      {medsTotal > 0 && (
        <View style={{ width: 70, height: 70, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={70} height={70} viewBox="0 0 70 70" style={{ position: 'absolute' }}>
            <Circle cx={35} cy={35} r={R} stroke={colors.border} strokeWidth={7} fill="none" />
            <Circle cx={35} cy={35} r={R} stroke={colors.teal} strokeWidth={7} fill="none" strokeLinecap="round"
              strokeDasharray={`${C * pct} ${C}`} transform="rotate(-90 35 35)" />
          </Svg>
          <Text style={{ fontSize: GP.body, fontWeight: '800', color: colors.textPrimary }}>{medsTaken}/{medsTotal}</Text>
          <Text style={{ fontSize: 9, fontWeight: '700', color: colors.textTertiary }}>MEDS</Text>
        </View>
      )}
    </View>
  );
}
