import React from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  StyleSheet, Linking, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDist } from '@/lib/units';
import type { Partner } from '@/lib/discovery';
import { TYPO } from '@/constants/theme';

interface SosNearbyVetsProps {
  nearbyVets: Partner[];
  vetsLoading: boolean;
  ac: string;
  isDark: boolean;
  colors: any;
  s: any;
  onCall: (phone: string, name: string) => void;
}

export const SosNearbyVets = React.memo(function SosNearbyVets({
  nearbyVets, vetsLoading, ac, isDark, colors, s, onCall,
}: SosNearbyVetsProps) {
  const { width } = useWindowDimensions();
  const cardW = (width - 32 - 8) / 2; // 16px side padding each side, 8px gap

  return (
    <View style={s.section}>
      <View style={s.sectionRow}>
        <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Nearby Vets</Text>
        {vetsLoading && <ActivityIndicator size="small" color={ac} />}
      </View>

      {!vetsLoading && nearbyVets.length === 0 && (
        <View style={[s.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ fontSize: TYPO.hero, marginBottom: 4 }}>🏥</Text>
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>No vets found nearby</Text>
        </View>
      )}

      {nearbyVets.length > 0 && (
        <View style={vs.grid}>
          {nearbyVets.map(v => (
            <View
              key={v.id}
              style={[vs.card, { width: cardW, backgroundColor: colors.card, borderColor: colors.border }]}
            >
              {/* Icon + 24h badge */}
              <View style={vs.topRow}>
                <View style={[vs.icon, { backgroundColor: isDark ? '#3D1515' : '#FEE2E2' }]}>
                  <Text style={{ fontSize: 22 }}>🏥</Text>
                </View>
                {v.is_24h && (
                  <View style={vs.badge24}>
                    <Text style={vs.badge24Txt}>24h</Text>
                  </View>
                )}
              </View>

              {/* Name */}
              <Text style={[vs.name, { color: colors.textPrimary }]} numberOfLines={2}>{v.name}</Text>

              {/* Distance + ETA */}
              <View style={vs.metaRow}>
                {v.distance_km != null && (
                  <Text style={[vs.meta, { color: colors.textSecondary }]}>
                    📍 {formatDist(v.distance_km)}
                  </Text>
                )}
                {v.eta_minutes != null && (
                  <Text style={[vs.meta, { color: colors.textSecondary }]}>
                    🚗 {v.eta_minutes} min
                  </Text>
                )}
              </View>

              {/* Actions */}
              <View style={vs.actions}>
                {v.cta_url ? (
                  <TouchableOpacity
                    style={[vs.btn, { backgroundColor: `${ac}18`, flex: v.phone ? 1 : undefined }]}
                    onPress={() => Linking.openURL(v.cta_url!).catch(() => {})}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="navigate-outline" size={15} color={ac} />
                    <Text style={[vs.btnTxt, { color: ac }]}>Go</Text>
                  </TouchableOpacity>
                ) : null}
                {v.phone ? (
                  <TouchableOpacity
                    style={[vs.btn, { backgroundColor: isDark ? '#3D1515' : '#FEE2E2', flex: v.cta_url ? 1 : undefined }]}
                    onPress={() => onCall(v.phone!, v.name)}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="call-outline" size={15} color="#EF4444" />
                    <Text style={[vs.btnTxt, { color: '#EF4444' }]}>Call</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
});

const vs = StyleSheet.create({
  grid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card:     { borderRadius: 14, borderWidth: 1, padding: 12, gap: 6 },
  topRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  icon:     { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badge24:  { backgroundColor: '#16A34A', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  badge24Txt:{ fontSize: 10, fontWeight: '700', color: '#fff' },
  name:     { fontSize: TYPO.body, fontWeight: '700', lineHeight: 17 },
  metaRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  meta:     { fontSize: TYPO.caption, fontWeight: '500' },
  actions:  { flexDirection: 'row', gap: 6, marginTop: 4 },
  btn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              gap: 4, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10 },
  btnTxt:   { fontSize: TYPO.caption, fontWeight: '700' },
});
