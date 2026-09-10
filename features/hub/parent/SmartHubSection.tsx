/**
 * SmartHubSection — Hub card linking to the parent-only Smart Hub screen
 * (thermostats today; more device types planned — see docs/smart-hub-mock-adapter.md).
 * Only rendered from ParentView since this is a parent-only feature end to end.
 */
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { TYPO, RADIUS } from '@/constants/theme';

export function SmartHubSection({ colors }: { colors: any }) {
  return (
    <View style={{ marginHorizontal: 16, marginBottom: 20 }}>
      <Text style={{ fontSize: TYPO.sectionLabel, fontWeight: '800', color: colors.textSecondary,
        textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
        Smart Hub
      </Text>
      <Pressable
        onPress={() => router.push('/hub/smart-hub' as any)}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 12,
          borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.border,
          backgroundColor: colors.card, padding: 14,
        }}
      >
        <View style={{
          width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
          backgroundColor: colors.tealLight,
        }}>
          <Text style={{ fontSize: 20 }}>🌡️</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>
            Smart devices
          </Text>
          <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>
            Thermostat schedules, filter changes, maintenance reminders
          </Text>
        </View>
      </Pressable>
    </View>
  );
}
