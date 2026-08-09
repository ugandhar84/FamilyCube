import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TYPO } from '@/constants/theme';

export const SymptomSection = React.memo(function SymptomSection({ title, icon, color, children }: { title: string; icon: any; color: any; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Ionicons name={icon} size={14} color={color.textPrimary} />
        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: color.textPrimary, letterSpacing: 0.5 }}>{title.toUpperCase()}</Text>
      </View>
      {children}
    </View>
  );
});
