// Admin feature-flags screen — extends the real, already-wired
// lib/featureFlags.ts system (FeatureFlagKey union, feature_flags table,
// realtime subscription) with a write UI. Reads reuse useFeatureFlag() so
// this screen reflects the exact same live state every gated component in
// the app sees; writes go through lib/db/admin.ts's setFeatureFlag(), which
// the feature_flags_admin_write RLS policy (is_app_admin()) allows.
import { useState } from 'react';
import { View, Text, ScrollView, Switch, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import { useFeatureFlag, type FeatureFlagKey } from '@/lib/featureFlags';
import { setFeatureFlag } from '@/lib/db/admin';
import { showAlert } from '@/components/AppAlert';

// Grouped for readability — mirrors lib/featureFlags.ts's own registry
// comments (gamification family, chat/security, misc). Update this list
// whenever FeatureFlagKey changes; TypeScript's exhaustiveness isn't
// enforced here on purpose (a screen listing is cosmetic grouping, not a
// second source of truth for which keys exist).
const GROUPS: { label: string; keys: { key: FeatureFlagKey; description: string }[] }[] = [
  {
    label: 'Gamification',
    keys: [
      { key: 'gamification', description: 'XP / levels / coins / daily quests / leaderboard — parent switch for the whole system' },
      { key: 'daily_quests', description: 'Daily quest panel (sub-feature of gamification)' },
      { key: 'leaderboard', description: 'Weekly leaderboard (sub-feature of gamification)' },
      { key: 'seasonal_events', description: 'Time-limited holiday challenges' },
    ],
  },
  {
    label: 'Rewards',
    keys: [
      { key: 'rewards_marketplace', description: 'Partner coupons redeemable with coins' },
    ],
  },
  {
    label: 'Chat & Security',
    keys: [
      { key: 'per_device_e2e', description: 'Multi-device chat encryption envelope (per-device public-key ECDH)' },
    ],
  },
  {
    label: 'Grocery',
    keys: [
      { key: 'store_proximity_reminders', description: "Geofence a pinned store location, notify when nearby with pending items on that store's list" },
    ],
  },
  {
    label: 'iOS',
    keys: [
      { key: 'home_screen_widgets', description: 'Small/medium home-screen widgets, role-based content — reserved ahead of the native build' },
    ],
  },
];

function FlagRow({ flagKey, description, colors }: { flagKey: FeatureFlagKey; description: string; colors: any }) {
  const enabled = useFeatureFlag(flagKey);
  const [saving, setSaving] = useState(false);

  const onToggle = async (next: boolean) => {
    setSaving(true);
    try {
      await setFeatureFlag(flagKey, next);
    } catch (e: any) {
      showAlert("Couldn't update flag", e?.message ?? 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 13, paddingHorizontal: 14,
      borderRadius: RADIUS.md, backgroundColor: colors.card,
      borderWidth: 1, borderColor: colors.border, marginBottom: 8,
    }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{flagKey}</Text>
        <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, marginTop: 1 }}>{description}</Text>
      </View>
      {saving ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Switch
          value={enabled}
          onValueChange={onToggle}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#fff"
        />
      )}
    </View>
  );
}

export default function FeatureFlagsScreen() {
  const { colors } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {GROUPS.map(group => (
          <View key={group.label} style={{ marginBottom: 20 }}>
            <Text style={{
              fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
              textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10,
            }}>
              {group.label}
            </Text>
            {group.keys.map(({ key, description }) => (
              <FlagRow key={key} flagKey={key} description={description} colors={colors} />
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
