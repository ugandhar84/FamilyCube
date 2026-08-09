import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/ThemeContext';
import PawBondLoader from '@/components/PawBondLoader';
import { TYPO } from '@/constants/theme';

export default function AdminLayout() {
  const { colors, isDark } = useTheme();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setAllowed(false); return; }
      const { data } = await supabase
        .from('profiles').select('is_admin').eq('id', session.user.id).single();
      setAllowed(data?.is_admin === true);
    })();
  }, []);

  if (allowed === null) return (
    <View style={[s.gate, { backgroundColor: colors.background }]}>
      <PawBondLoader size={48} isDark={isDark} />
    </View>
  );

  if (!allowed) {
    return (
      <View style={[s.gate, { backgroundColor: colors.background }]}>
        <Text style={[s.gateText, { color: colors.textSecondary }]}>🚫 Admin access required</Text>
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
      <Stack.Screen name="index"            options={{ title: 'Admin Console' }} />
      <Stack.Screen name="analytics"        options={{ title: 'Analytics' }} />
      <Stack.Screen name="users"            options={{ title: 'Users' }} />
      <Stack.Screen name="pets"             options={{ title: 'Pets' }} />
      <Stack.Screen name="sponsored"        options={{ title: 'Sponsored Listings' }} />
      <Stack.Screen name="sponsored-edit"   options={{ title: 'Edit Listing', presentation: 'modal' }} />
      <Stack.Screen name="moderation"       options={{ title: 'Content Moderation' }} />
      <Stack.Screen name="push"             options={{ title: 'Push Notifications' }} />
      <Stack.Screen name="media-retention"  options={{ title: 'Media Retention' }} />
      <Stack.Screen name="recommendations"  options={{ title: 'Recommendations' }} />
      <Stack.Screen name="costs"            options={{ title: 'Cost Analytics' }} />
      <Stack.Screen name="settings"         options={{ title: 'Feature Settings' }} />
      <Stack.Screen name="pricing"          options={{ title: 'Pricing' }} />
      <Stack.Screen name="blocked-words"    options={{ title: 'Blocked Words' }} />
      <Stack.Screen name="feedback"         options={{ title: 'Feedback & Bug Reports' }} />
      <Stack.Screen name="rewards-offers"      options={{ title: 'Partner Offers' }} />
      <Stack.Screen name="coins-config"       options={{ title: 'Coins & Rewards Config' }} />
      <Stack.Screen name="rewards-bulk-upload" options={{ title: 'Bulk Upload' }} />
    </Stack>
  );
}

const s = StyleSheet.create({
  gate:     { flex: 1, alignItems: 'center', justifyContent: 'center' },
  gateText: { fontSize: TYPO.subheading, fontWeight: '600' },
});
