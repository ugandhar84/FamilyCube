import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { formatTime } from '@/lib/units';
import { toTitle } from '@/lib/format';
import { TYPO } from '@/constants/theme';

interface NearbyLostAlert {
  id: string;
  pet_id: string;
  last_seen_address: string | null;
  contact_phone: string | null;
  reward_amount: number | null;
  created_at: string;
  pets?: { name: string; emoji: string; species: string; breed: string | null };
}

interface SosNearbyAlertsProps {
  nearbyAlerts: NearbyLostAlert[];
  alertsLoading: boolean;
  isDark: boolean;
  colors: any;
  s: any;
  onCall: (phone: string, name: string) => void;
}

export const SosNearbyAlerts = React.memo(function SosNearbyAlerts({
  nearbyAlerts, alertsLoading, isDark, colors, s, onCall,
}: SosNearbyAlertsProps) {
  if (!alertsLoading && nearbyAlerts.length === 0) return null;

  return (
    <View style={s.section}>
      <View style={s.sectionRow}>
        <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>
          Lost Pets Nearby{nearbyAlerts.length > 0 ? ` (${nearbyAlerts.length})` : ''}
        </Text>
        {alertsLoading && <ActivityIndicator size="small" color={colors.primary} />}
      </View>

      <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {nearbyAlerts.map((a, i) => (
          <View key={a.id} style={[s.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
            <View style={[s.rowIcon, { backgroundColor: '#FFF7ED' }]}>
              <Text style={{ fontSize: TYPO.title }}>{a.pets?.emoji ?? '🐾'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.rowTitle, { color: colors.textPrimary }]}>{a.pets?.name ?? 'Unknown'}</Text>
              <Text style={[s.rowSub, { color: colors.textSecondary }]}>
                {toTitle(a.pets?.species ?? '')}{a.pets?.breed ? ` · ${toTitle(a.pets.breed)}` : ''}
              </Text>
              {a.last_seen_address && (
                <Text style={[s.rowSub, { color: colors.textSecondary }]} numberOfLines={1}>📍 {a.last_seen_address}</Text>
              )}
              <Text style={[s.rowSub, { color: colors.textSecondary }]}>{`${format(parseISO(a.created_at), 'MMM d')} · ${formatTime(parseISO(a.created_at))}`}</Text>
            </View>
            {a.reward_amount != null && (
              <View style={s.rewardBadge}>
                <Text style={s.rewardAmt}>${a.reward_amount}</Text>
                <Text style={s.rewardLbl}>reward</Text>
              </View>
            )}
            {a.contact_phone && (
              <TouchableOpacity style={[s.iconBtn, { backgroundColor: isDark ? '#3D1515' : '#FEE2E2' }]}
                onPress={() => onCall(a.contact_phone!, a.pets?.name ?? 'owner')}>
                <Ionicons name="call-outline" size={14} color="#EF4444" />
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>
    </View>
  );
});
