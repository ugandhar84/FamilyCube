import { View, Text } from 'react-native';

/**
 * KidSectionHeader — the Parent Hub's own eyebrow pattern (small accent
 * underline bar + letter-spaced uppercase label) reused above Kid Hub
 * sections, so the two Hubs read as the same app instead of two different
 * design languages ["now lets give the kids hub screen witht he rythem and
 * desing insipiration of the parents hub" — section structure too].
 */
export function KidSectionHeader({ label, accent, colors }: {
  label: string; accent: string; colors: any;
}) {
  return (
    <View style={{ alignSelf: 'flex-start', marginBottom: 8 }}>
      <View style={{ height: 2, width: 22, borderRadius: 1, backgroundColor: accent, marginBottom: 6, opacity: 0.7 }} />
      <Text style={{ color: colors.textTertiary, fontSize: 10, fontWeight: '700', letterSpacing: 0.9 }}>
        {label}
      </Text>
    </View>
  );
}
