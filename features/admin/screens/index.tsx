// Admin console home — array-driven section list so adding a third admin
// section later is a one-line addition here, not a new hardcoded button.
import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import { getAdminHomeStats, type AdminHomeStats } from '@/lib/db/admin';

type AdminSection = {
  id: string;
  label: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  accent: 'primary' | 'parent' | 'kid' | 'accent' | 'danger';
};

const SECTIONS: AdminSection[] = [
  {
    id: 'analytics',
    label: 'Analytics',
    subtitle: 'Platform-wide usage counts, live',
    icon: 'bar-chart-outline',
    route: '/admin/analytics',
    accent: 'primary',
  },
  {
    id: 'growth',
    label: 'Growth',
    subtitle: 'Signups, onboarding, subscriber tiers',
    icon: 'trending-up-outline',
    route: '/admin/growth',
    accent: 'accent',
  },
  {
    id: 'families',
    label: 'Families',
    subtitle: 'Browse every family and its members',
    icon: 'home-outline',
    route: '/admin/families',
    accent: 'parent',
  },
  {
    id: 'users',
    label: 'Users',
    subtitle: 'Search accounts, block or delete',
    icon: 'people-circle-outline',
    route: '/admin/users',
    accent: 'danger',
  },
  {
    id: 'feature-flags',
    label: 'Feature Flags',
    subtitle: 'Enable or disable in-progress features remotely',
    icon: 'flag-outline',
    route: '/admin/feature-flags',
    accent: 'kid',
  },
  {
    id: 'paywall-groups',
    label: 'Paywall Groups',
    subtitle: 'Assign features to subscription tiers, at runtime',
    icon: 'card-outline',
    route: '/admin/paywall-groups',
    accent: 'accent',
  },
  {
    id: 'broadcast',
    label: 'Broadcast',
    subtitle: 'Push a message to everyone, or parents only',
    icon: 'megaphone-outline',
    route: '/admin/broadcast',
    accent: 'primary',
  },
];

const ACCENT_LIGHT_KEY: Record<AdminSection['accent'], string> = {
  primary: 'primaryLight', parent: 'tealLight', kid: 'amberLight', accent: 'pinkLight', danger: 'primaryLight',
};

function StatTile({ label, value, colors, loading }: { label: string; value: number | string; colors: any; loading: boolean }) {
  return (
    <View style={{
      flex: 1, backgroundColor: colors.card, borderRadius: RADIUS.md,
      borderWidth: 1, borderColor: colors.border, padding: 14, gap: 6,
    }}>
      {loading ? (
        <View style={{ height: TYPO.title, width: 40, borderRadius: RADIUS.sm, backgroundColor: colors.surface }} />
      ) : (
        <Text style={{ fontSize: TYPO.title, fontWeight: '800', color: colors.textPrimary }}>{value}</Text>
      )}
      <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

export default function AdminHomeScreen() {
  const { colors } = useTheme();
  const [stats, setStats] = useState<AdminHomeStats | null>(null);
  const [statsFailed, setStatsFailed] = useState(false);

  useEffect(() => {
    getAdminHomeStats().then(setStats).catch(() => setStatsFailed(true));
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <Text style={{ fontSize: TYPO.heading, fontWeight: '800', color: colors.textPrimary, marginBottom: 2 }}>
          Admin Console
        </Text>
        <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, marginBottom: 20 }}>
          Platform controls — visible only to app_admins
        </Text>

        {!statsFailed && (
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
            <StatTile label="Families" value={stats?.totalFamilies ?? 0} colors={colors} loading={!stats} />
            <StatTile label="Members" value={stats?.totalMembers ?? 0} colors={colors} loading={!stats} />
          </View>
        )}

        <Text style={{
          fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
          textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10,
        }}>
          Sections
        </Text>

        {SECTIONS.map(section => {
          const accentColor = colors[section.accent];
          return (
            <TouchableOpacity
              key={section.id}
              activeOpacity={0.7}
              onPress={() => router.push(section.route as any)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                paddingVertical: 14, paddingHorizontal: 14,
                borderRadius: RADIUS.md, backgroundColor: colors.card,
                borderWidth: 1, borderColor: colors.border, marginBottom: 8,
              }}
            >
              <View style={{
                width: 36, height: 36, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center',
                backgroundColor: (colors as any)[ACCENT_LIGHT_KEY[section.accent]],
              }}>
                <Ionicons name={section.icon} size={19} color={accentColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{section.label}</Text>
                <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, marginTop: 1 }}>{section.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
