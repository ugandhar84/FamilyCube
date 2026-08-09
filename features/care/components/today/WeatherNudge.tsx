import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TYPO } from '@/constants/theme';

interface Props {
  nudge: string;
  onDismiss: () => void;
  colors: any;
}

export default function WeatherNudge({ nudge, onDismiss, colors }: Props) {
  return (
    <View style={[s.nudgeBanner, { backgroundColor: colors.warning + '22', borderColor: colors.warning + '60' }]}>
      <Text style={[s.nudgeText, { color: colors.textPrimary, flex: 1 }]}>{nudge}</Text>
      <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close" size={16} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  nudgeBanner: { marginHorizontal: 12, marginBottom: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  nudgeText:   { fontSize: TYPO.caption },
});
