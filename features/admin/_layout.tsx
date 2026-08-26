// Admin console gate — deep-link-only section, NOT part of the bottom-tab
// navigator. Reached via a hidden entry point in ProfileSettingsScreen
// (parent role + confirmed app admin only) or direct navigation to
// /admin/*; this gate blocks the latter path regardless of how it's
// reached, using the same useIsAppAdmin() check the entry point itself
// uses so the two can never disagree.
//
// Replaces the previous version of this file, which gated on
// `profiles.is_admin` — a column belonging to the unrelated, unmodified
// PawBond template admin section (queried pets/social_posts/etc, none of
// which exist in Family Cube's schema). This gates on the new dedicated
// app_admins table instead (see migration 20260925090000_create_admin_console.sql).
import { Stack, router } from 'expo-router';
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import { useIsAppAdmin } from '@/lib/hooks/useIsAppAdmin';

export default function AdminLayout() {
  const { colors } = useTheme();
  const { isAdmin, loading } = useIsAppAdmin();

  if (loading) {
    return (
      <View style={[s.gate, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={[s.gate, { backgroundColor: colors.background }]}>
        <View style={{
          width: 64, height: 64, borderRadius: RADIUS.xl, alignItems: 'center', justifyContent: 'center',
          backgroundColor: colors.surface,
        }}>
          <Ionicons name="lock-closed" size={28} color={colors.textTertiary} />
        </View>
        <Text style={[s.gateText, { color: colors.textPrimary }]}>Admin access required</Text>
        <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, textAlign: 'center', maxWidth: 260 }}>
          This section is restricted to the app's platform administrators.
        </Text>
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          activeOpacity={0.7}
          style={{
            marginTop: 8, paddingHorizontal: 20, paddingVertical: 11,
            borderRadius: RADIUS.md, backgroundColor: colors.primary,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: TYPO.caption }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.primary,
        headerTitleStyle: { fontWeight: '700', fontSize: TYPO.subheading },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index"          options={{ title: 'Admin Console' }} />
      <Stack.Screen name="feature-flags"  options={{ title: 'Feature Flags' }} />
      <Stack.Screen name="paywall-groups" options={{ title: 'Paywall Groups' }} />
      <Stack.Screen name="analytics"      options={{ title: 'Analytics' }} />
      <Stack.Screen name="growth"         options={{ title: 'Growth' }} />
      <Stack.Screen name="users"          options={{ title: 'Users' }} />
      <Stack.Screen name="families"       options={{ title: 'Families' }} />
      <Stack.Screen name="broadcast"      options={{ title: 'Broadcast' }} />
    </Stack>
  );
}

const s = StyleSheet.create({
  gate:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  gateText: { fontSize: TYPO.body, fontWeight: '600', textAlign: 'center' },
});
