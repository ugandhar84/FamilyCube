import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { vaxStatus } from '@/features/health/components/HealthUtils';
import { EmptyCard } from '@/features/health/components/EmptyCard';
import { TYPO } from '@/constants/theme';

interface VaxRow { id: string; name: string; next_due: string | null; last_given: string | null }

interface VaccineStripProps {
  vaxes: VaxRow[];
  colors: any;
  s: any;
}

export const VaccineStrip = React.memo(function VaccineStrip({ vaxes, colors, s }: VaccineStripProps) {
  if (vaxes.length === 0) {
    return (
      <EmptyCard icon="shield-checkmark-outline" label="No vaccines recorded" addLabel="Add vaccine" onPress={() => router.push('/health/vaccines')} colors={colors} />
    );
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 10, flexDirection: 'row', paddingBottom: 2 }}
      style={{ marginHorizontal: -16 }}>
      {vaxes.slice(0, 5).map(v => {
        const st = vaxStatus(v.next_due, colors);
        const dateLabel = v.last_given
          ? `Last: ${format(parseISO(v.last_given), 'MMM yyyy')}`
          : v.next_due
          ? `Due: ${format(parseISO(v.next_due), 'MMM d')}`
          : null;
        return (
          <TouchableOpacity key={v.id} style={[s.vaxChip, { borderColor: st.color + '30' }]}
            activeOpacity={0.75} onPress={() => router.push('/health/vaccines')}>
            <Text style={{ fontSize: TYPO.title, marginBottom: 6 }}>💉</Text>
            <Text style={s.vaxName} numberOfLines={1}>{v.name}</Text>
            {dateLabel && <Text style={s.vaxDate}>{dateLabel}</Text>}
            <View style={[s.vaxBadge, { backgroundColor: st.bg }]}>
              <Text style={[s.vaxBadgeText, { color: st.color }]}>{st.label}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
});
