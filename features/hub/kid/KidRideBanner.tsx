import { View, Text } from 'react-native';
import { Car, PartyPopper } from 'lucide-react-native';
import { fmtTime } from '../hubUtils';
import { KID } from './kidTheme';
import type { FamilyEvent } from '@/store/eventStore';

// Money-green — "ride here / on the way" positive accent, distinct from
// brand teal used elsewhere in the kid hub. Not colors.success (which IS
// brand teal in this app) — kept as one local constant.
const MONEY_GREEN = '#10B981';

// Full-width "your ride is coming" banner — separate from the hero card's own
// mini countdown so it stays visible even after scrolling past the hero.
export function KidRideBanner({ ev, rideCountdown, colors, isDark }: {
  ev: FamilyEvent; rideCountdown: number; colors: any; isDark: boolean;
}) {
  const rideUrgent = rideCountdown <= 15 && rideCountdown >= 0;
  const rideHere   = rideCountdown <= 2 && rideCountdown >= -5;
  const Icon = rideHere ? PartyPopper : Car;
  const iconColor = rideHere ? '#6EE7B7' : rideUrgent ? '#FCA5A5' : MONEY_GREEN;

  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
      <View style={{ borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: rideHere ? '#064E3B' : rideUrgent ? '#7C2D12' : (isDark ? '#0F2A20' : '#ECFDF5'),
        borderWidth: 1.5, borderColor: rideHere ? MONEY_GREEN : rideUrgent ? colors.danger : `${MONEY_GREEN}50` }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: iconColor + '25', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={22} color={iconColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: KID.body, fontWeight: '900', color: iconColor }}>
            {rideHere ? `${ev.helper?.split(' ')[0]} is HERE! 🎉`
              : rideUrgent ? `${ev.helper?.split(' ')[0]} arrives in ${rideCountdown} min!`
              : `${ev.helper?.split(' ')[0]} picks you up in ${rideCountdown}m`}
          </Text>
          <Text style={{ fontSize: KID.tiny, color: '#34D399', marginTop: 2 }}>
            {ev.title} · {fmtTime(ev.time)}
          </Text>
        </View>
        {rideUrgent && !rideHere && (
          <View style={{ backgroundColor: colors.danger, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 }}>
            <Text style={{ fontSize: KID.sub, fontWeight: '900', color: '#fff' }}>Get ready!</Text>
          </View>
        )}
      </View>
    </View>
  );
}
