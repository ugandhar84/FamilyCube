import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { toTitle } from '@/lib/format';
import { EmptyCard } from '@/features/health/components/EmptyCard';

interface MedItem {
  id: string;
  name: string;
  is_active?: boolean;
  dosage?: string | null;
  frequency?: string | null;
}

interface ActiveMedicationsListProps {
  activeMeds: MedItem[];
  colors: any;
  s: any;
  onPressMed: (m: MedItem) => void;
  onAddMed: () => void;
}

export const ActiveMedicationsList = React.memo(function ActiveMedicationsList({
  activeMeds, colors, s, onPressMed, onAddMed,
}: ActiveMedicationsListProps) {
  if (activeMeds.length === 0) {
    return (
      <EmptyCard icon="medical-outline" label="No active medications" addLabel="Add medication" onPress={onAddMed} colors={colors} />
    );
  }
  return (
    <View style={[s.card, { gap: 0 }]}>
      {activeMeds.slice(0, 5).map((m, i) => (
        <TouchableOpacity key={m.id}
          onPress={() => onPressMed(m)}
          activeOpacity={0.75}
          style={[s.medCard, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
          <View style={[s.medIcon, { backgroundColor: m.is_active ? colors.success + '18' : colors.textDisabled + '18' }]}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: m.is_active ? colors.success : colors.textDisabled }} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.medName} numberOfLines={1}>{m.name}</Text>
            <View style={{ gap: 2, marginTop: 4 }}>
              {m.dosage && (
                <Text style={[s.medMeta, { color: colors.textSecondary }]} numberOfLines={1}>💊 {m.dosage}</Text>
              )}
              {m.frequency && (
                <Text style={[s.medMeta, { color: colors.textSecondary }]} numberOfLines={1}>🔄 {toTitle(m.frequency.replace(/_/g, ' '))}</Text>
              )}
            </View>
          </View>
          <View style={[s.activeBadge, { backgroundColor: m.is_active ? colors.success + '22' : colors.border }]}>
            <Text style={[s.activeBadgeText, { color: m.is_active ? colors.success : colors.textSecondary }]}>
              {m.is_active ? 'Active' : 'Stopped'}
            </Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
});
