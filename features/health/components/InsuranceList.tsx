import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { format, parseISO, differenceInDays, isPast } from 'date-fns';
import { EmptyCard } from '@/features/health/components/EmptyCard';
import { TYPO } from '@/constants/theme';

interface InsuranceItem {
  id: string;
  provider: string;
  end_date?: string | null;
  coverage_type?: string | null;
}

interface InsuranceListProps {
  insurance: InsuranceItem[];
  colors: any;
  s: any;
}

export const InsuranceList = React.memo(function InsuranceList({ insurance, colors, s }: InsuranceListProps) {
  if (insurance.length === 0) {
    return (
      <EmptyCard icon="shield-outline" label="No insurance on file" addLabel="Add insurance" onPress={() => router.push('/health/insurance')} colors={colors} />
    );
  }
  return (
    <View style={[s.card, { gap: 0 }]}>
      {insurance.slice(0, 5).map((p, i) => {
        const expired = p.end_date ? isPast(parseISO(p.end_date)) : false;
        const daysLeft = p.end_date ? differenceInDays(parseISO(p.end_date), new Date()) : null;
        const expiringSoon = !expired && daysLeft !== null && daysLeft <= 30;
        const dateColor = expired ? colors.danger : expiringSoon ? colors.warning : colors.success;
        return (
          <TouchableOpacity key={p.id}
            style={[s.apptRow, i < insurance.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
            activeOpacity={0.75} onPress={() => router.push('/health/insurance')}>
            <View style={[s.insIconWrap, { backgroundColor: dateColor + '15' }]}>
              <Ionicons name="shield-checkmark-outline" size={18} color={dateColor} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.apptTitle} numberOfLines={1}>{p.provider}</Text>
              {p.end_date ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                  <View style={{ backgroundColor: dateColor + '22', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: dateColor + '55' }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: dateColor }}>
                      {expired ? 'Expired' : expiringSoon ? 'Expiring soon' : 'Active'} · {format(parseISO(p.end_date), 'MMM d, yyyy')}
                    </Text>
                  </View>
                </View>
              ) : (
                <Text style={s.apptMeta} numberOfLines={1}>{p.coverage_type ?? 'Active policy'}</Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
});
