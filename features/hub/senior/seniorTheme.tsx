import { View, Text } from 'react-native';

// Elderly-friendly type scale. The shared TYPO steps bottom out at 11px
// (label) and 9px (micro) — fine on a kid's screen, too small here — so the
// Senior Hub reads off its own floor instead.
export const GP = { title: 18, body: 16, sub: 14, tiny: 12 };

export const DECLINE_PRESETS = ['Schedule conflict', 'Vehicle unavailable', 'Feeling unwell', 'Work commitment'];

// Three plain-language bands break the Senior Hub into Today / Help Out /
// My Grandkids, so there's one obvious place to look for each thing.
// (A fourth, Memories, was removed as redundant with the dedicated
// Memories tab — see SeniorView.tsx's own history for that change.)
export function GroupBand({ label, color, colors }: { label: string; color: string; colors: any }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ width: 5, height: 22, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ fontSize: 20, fontWeight: '900', color: colors.textPrimary, letterSpacing: 0.3 }}>{label}</Text>
      <View style={{ flex: 1, height: 1.5, backgroundColor: color + '30', borderRadius: 1 }} />
    </View>
  );
}
