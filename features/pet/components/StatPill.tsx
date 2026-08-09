import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TYPO } from '@/constants/theme';

interface StatPillProps {
  icon: string;
  value: string;
  label: string;
}

export const StatPill = React.memo(function StatPill({ icon, value, label }: StatPillProps) {
  return (
    <View style={sp.wrap}>
      <Text style={sp.icon}>{icon}</Text>
      <Text style={sp.value}>{value}</Text>
      <Text style={sp.label}>{label}</Text>
    </View>
  );
});

const sp = StyleSheet.create({
  wrap:  { alignItems: 'center', flex: 1 },
  icon:  { fontSize: TYPO.heading, marginBottom: 2 },
  value: { fontSize: TYPO.subheading, fontWeight: '800', color: '#fff', lineHeight: 20 },
  label: { fontSize: TYPO.label, color: 'rgba(255,255,255,0.7)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 1 },
});
