import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';

function getGreeting(firstName: string): string {
  const h = new Date().getHours();
  const tod = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  return `Good ${tod}, ${firstName}`;
}

// Same page-level greeting Parent's Hub leads with (TodayView.tsx) — sits
// on the page background, no card boundary. `summary` is an optional pill
// below the greeting (e.g. "2 chores to do today"). `balance` is an
// optional coin chip (teens only — parents have no personal balance) that
// opens the Store/Cash Out on tap, replacing what used to be a separate
// gradient hero card.
export function HubGreetingHeader({ firstName, summary, balance, colors, isDark }: {
  firstName: string; summary?: string; balance?: number; colors: any; isDark: boolean;
}) {
  return (
    <View style={{ paddingHorizontal: 16, marginTop: 8, marginBottom: 16 }}>
      <Text style={{ fontSize: 26, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3 }}>
        {getGreeting(firstName)}
      </Text>
      {summary ? (
        <View style={{
          alignSelf: 'flex-start', marginTop: 10,
          backgroundColor: colors.accent + (isDark ? '25' : '14'),
          borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7,
        }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.accent }}>
            {summary}
          </Text>
        </View>
      ) : null}
      {balance !== undefined && (
        <Pressable onPress={() => router.push('/(tabs)/store' as any)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 8,
            backgroundColor: isDark ? BRAND.amber + '18' : BRAND.amber + '12',
            borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 }}>
          <Text style={{ fontSize: TYPO.label }}>🪙</Text>
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: BRAND.amber }}>
            {balance} coins · Cash Out →
          </Text>
        </Pressable>
      )}
    </View>
  );
}
