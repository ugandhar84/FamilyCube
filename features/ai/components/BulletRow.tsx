import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TYPO } from '@/constants/theme';

export const BulletRow = React.memo(function BulletRow({ text, icon = 'ellipse', iconColor, colors }: { text: string; icon?: any; iconColor?: string; colors: any }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
      <Ionicons name={icon} size={14} color={iconColor ?? colors.textTertiary} style={{ marginTop: 2 }} />
      <Text style={{ fontSize: TYPO.body, color: colors.textPrimary, flex: 1, lineHeight: 19 }}>{text}</Text>
    </View>
  );
});
