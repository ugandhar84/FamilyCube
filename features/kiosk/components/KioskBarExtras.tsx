/**
 * Bits that sit at the two ends of the kiosk bottom bar: the active profile's
 * avatar (opens the system menu) and the clock / date / temperature that used
 * to live in the removed top header.
 */
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { FamilyMember } from '@/store/familyStore';
import { KIOSK_TYPO, KIOSK_SPACE } from '../kioskTheme';
import { useKioskColors, kioskRoleAccent } from '../kioskPalette';
import { useKioskWeather } from '../useKioskWeather';
import { KioskAvatar } from './KioskAvatar';
import { useNow } from './KioskHomeParts';

export function KioskBarProfile({ member, open, onPress }: { member: FamilyMember; open: boolean; onPress: () => void }) {
  const { k } = useKioskColors();
  const tint = kioskRoleAccent(k, member.role);
  const first = member.name?.trim().split(' ')[0] ?? '';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.profile, pressed && { opacity: 0.7 }]}
      accessibilityRole="button" accessibilityState={{ expanded: open }}
      accessibilityLabel={`${first}, profile menu`} accessibilityHint="Switch profile, lock, and settings"
    >
      <View style={[s.ring, { borderColor: open ? k.primary : tint }]}>
        <KioskAvatar
          name={member.name} emoji={member.emoji} avatarUrl={member.avatarUrl}
          size={36} bgColor={k.well} k={k}
        />
      </View>
      <Text style={[s.name, { color: open ? k.primary : k.textFaint }]} numberOfLines={1}>{first}</Text>
    </Pressable>
  );
}

export function KioskBarClock({ compact }: { compact?: boolean }) {
  const { k } = useKioskColors();
  const now = useNow();
  const weather = useKioskWeather();
  return (
    <View style={[s.clock, compact && { alignItems: 'center', paddingLeft: 0, minWidth: 0 }]}>
      <Text style={[s.time, { color: k.text }]}>{now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</Text>
      <Text style={[s.date, { color: k.textMuted }]} numberOfLines={1}>
        {now.toLocaleDateString('en-US', compact ? { weekday: 'short' } : { weekday: 'short', month: 'short', day: 'numeric' })}
        {weather ? ` · ${Math.round(weather.temperature)}${weather.unit}` : ''}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  profile: { alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 8, paddingHorizontal: KIOSK_SPACE.md, minHeight: 58, minWidth: 72 },
  ring: { borderWidth: 2.5, borderRadius: 22, padding: 1 },
  name: { fontSize: KIOSK_TYPO.micro, fontWeight: '800', maxWidth: 70 },
  clock: { alignItems: 'flex-end', justifyContent: 'center', paddingLeft: KIOSK_SPACE.md, minWidth: 120 },
  time: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  date: { fontSize: KIOSK_TYPO.label, fontWeight: '600' },
});
