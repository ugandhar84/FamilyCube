import { View, Text } from 'react-native';
import { fmtTime } from '../hubUtils';
import type { FamilyEvent } from '@/store/eventStore';

// Full-width "your ride is coming" banner — separate from the hero card's own
// mini countdown so it stays visible even after scrolling past the hero.
export function KidRideBanner({ ev, rideCountdown, colors, isDark }: {
  ev: FamilyEvent; rideCountdown: number; colors: any; isDark: boolean;
}) {
  const rideUrgent = rideCountdown <= 15 && rideCountdown >= 0;
  const rideHere   = rideCountdown <= 2 && rideCountdown >= -5;

  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
      <View style={{ borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: rideHere ? '#064E3B' : rideUrgent ? '#7C2D12' : (isDark ? '#0F2A20' : '#ECFDF5'),
        borderWidth: 1.5, borderColor: rideHere ? '#10B981' : rideUrgent ? '#EF4444' : '#10B98150' }}>
        <Text style={{ fontSize: 28 }}>{rideHere ? '🚨' : '🚗'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '900', color: rideHere ? '#6EE7B7' : rideUrgent ? '#FCA5A5' : '#10B981' }}>
            {rideHere ? `${ev.helper?.split(' ')[0]} is HERE! 🎉`
              : rideUrgent ? `${ev.helper?.split(' ')[0]} arrives in ${rideCountdown} min!`
              : `${ev.helper?.split(' ')[0]} picks you up in ${rideCountdown}m`}
          </Text>
          <Text style={{ fontSize: 11, color: '#34D399', marginTop: 2 }}>
            {ev.title} · {fmtTime(ev.time)}
          </Text>
        </View>
        {rideUrgent && !rideHere && (
          <View style={{ backgroundColor: '#EF4444', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: '900', color: '#fff' }}>Get ready!</Text>
          </View>
        )}
      </View>
    </View>
  );
}
