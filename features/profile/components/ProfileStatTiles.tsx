/**
 * ProfileStatTiles — the row of stat/action tiles below the hero card.
 * Shows pets count, mood scan count, and optionally an SOS tile.
 */

import React from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ProfileStatTilesProps {
  petsCount: number;
  moodScanCount: number | string | null;
  accent: string;
  colors: any;
  sosEnabled: boolean;
}

const ProfileStatTiles = React.memo(function ProfileStatTiles({ petsCount, moodScanCount, accent, colors, sosEnabled }: ProfileStatTilesProps) {
  const stats = [
    { val: petsCount,               lbl: 'My babies',   icon: 'paw-outline'    as const },
    { val: moodScanCount ?? '—',    lbl: 'Mood scans',  icon: 'camera-outline' as const },
  ];

  return (
    <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 }}>
      {stats.map(st => (
        <View key={st.lbl} style={{ flex: 1, backgroundColor: colors.card, borderRadius: 14,
          borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
          paddingVertical: 14, alignItems: 'center', gap: 4 }}>
          <Ionicons name={st.icon} size={18} color={accent} />
          <Text style={{ fontSize: TYPO.title, fontWeight: '700', color: colors.textPrimary }}>{st.val}</Text>
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>{st.lbl}</Text>
        </View>
      ))}
    </View>
  );
});

export default ProfileStatTiles;
