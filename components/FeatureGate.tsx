import { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import PaywallSheet from '@/components/PaywallSheet';

// ── Feature disabled (maintenance / feature flag off) ─────────────────────────
export function FeatureUnavailable({
  label,
  proGate,
  message,
  petName,
  ctaLabel,
  headline,
  perks,
}: {
  label: string;
  proGate?: boolean;
  message?: string;
  petName?: string;
  ctaLabel?: string;
  headline?: string;
  perks?: string[];
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (proGate) setOpen(true);
  }, [proGate]);

  if (proGate) {
    return (
      <>
        {/* Subtle background so there's something behind the sheet */}
        <View style={[s.backdrop, { backgroundColor: colors.background }]} />
        <PaywallSheet
          visible={open}
          onClose={() => { setOpen(false); router.back(); }}
          headline={headline ?? label}
          body={message ?? `Upgrade to Pro to unlock this feature for ${petName ?? 'your pet'}.`}
          petName={petName}
          perks={perks}
        />
      </>
    );
  }

  return (
    <View style={[s.wrap, { backgroundColor: colors.background }]}>
      <Ionicons name="construct-outline" size={40} color={colors.textTertiary} />
      <Text style={[s.title, { color: colors.textPrimary }]}>{label}</Text>
      <Text style={[s.sub, { color: colors.textSecondary }]}>
        This feature is temporarily unavailable. Check back soon.
      </Text>
    </View>
  );
}

// ── Ultimate exclusive feature gate ───────────────────────────────────────────
export function UltimateGate({
  icon,
  featureName,
  tagline,
  perks,
  currentTier,
  petName,
  ctaLabel,
}: {
  icon: string;
  featureName: string;
  tagline: string;
  perks: string[];
  currentTier: 'free' | 'pro' | 'ultimate';
  petName?: string;
  ctaLabel?: string;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(true); }, []);

  return (
    <>
      <View style={[s.backdrop, { backgroundColor: colors.background }]} />
      <PaywallSheet
        visible={open}
        onClose={() => { setOpen(false); router.back(); }}
        headline={featureName}
        body={tagline}
        petName={petName}
        perks={perks}
      />
    </>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1 },
  wrap:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  title:    { fontSize: 20, fontWeight: '800', textAlign: 'center', letterSpacing: -0.3 },
  sub:      { fontSize: 14, textAlign: 'center', lineHeight: 19, marginTop: -4 },
});
