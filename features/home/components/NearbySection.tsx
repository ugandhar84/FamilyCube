import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import PawBondLoader from '@/components/PawBondLoader';
import { NearbyCarousel } from '@/components/home/PartnerComponents';
import { DISCOVER_CHIPS } from '@/lib/homeUtils';
import { radiusLabel } from '@/lib/units';
import type { PartnerCategory } from '@/lib/discovery';
import { TYPO } from '@/constants/theme';

interface NearbySectionProps {
  pet: any;
  partnersLoading: boolean;
  allPartners: any[];
  coords: any;
  nearbyRadiusKm: number | null;
  discoverCat: PartnerCategory | null;
  setDiscoverCat: (cat: PartnerCategory | null) => void;
  displayPartners: any[];
  openPartner: (partner: any) => void;
  colors: any;
  s: any;
}

export const NearbySection = React.memo(function NearbySection({
  pet, partnersLoading, allPartners, coords, nearbyRadiusKm,
  discoverCat, setDiscoverCat, displayPartners, openPartner,
  colors, s,
}: NearbySectionProps) {
  if (!partnersLoading && allPartners.length === 0 && coords == null) return null;

  return (
    <View style={s.discoverWrap}>
      <View style={s.sectionHeaderRow}>
        <View>
          <Text style={s.sectionHeaderLabel}>Near you</Text>
          <Text style={s.discoverSub}>
            Trusted spots{pet?.name ? ` for ${pet.name}` : ''}{coords && nearbyRadiusKm ? ` · within ${radiusLabel(nearbyRadiusKm)}` : ''}
          </Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/nearby-places' as any)}>
          <Text style={s.sectionHeaderLink}>See all →</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
        {DISCOVER_CHIPS.map((c) => {
          const on = discoverCat === c.value;
          const count = c.value === null
            ? allPartners.length
            : allPartners.filter(p => p.category === c.value).length;
          return (
            <TouchableOpacity
              key={c.label}
              onPress={() => setDiscoverCat(c.value)}
              style={[
                s.chip,
                on
                  ? { backgroundColor: colors.primary, borderColor: colors.primary }
                  : { backgroundColor: colors.card, borderColor: colors.border },
              ]}
              activeOpacity={0.8}
            >
              <Text style={[s.chipText, { color: on ? '#fff' : colors.textSecondary }]}>
                {c.emoji ? `${c.emoji} ` : ''}{c.label}
              </Text>
              {count > 0 && (
                <View style={{
                  backgroundColor: on ? 'rgba(255,255,255,0.28)' : colors.primary + '22',
                  borderRadius: 8,
                  paddingHorizontal: 5,
                  paddingVertical: 1,
                  marginLeft: 3,
                }}>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: on ? '#fff' : colors.primary }}>
                    {count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {partnersLoading ? (
        <View style={s.discoverLoading}>
          <PawBondLoader size={44} />
          <Text style={[s.discoverEmptySub, { marginTop: 8 }]}>Finding places nearby…</Text>
        </View>
      ) : !coords ? (
        <View style={s.discoverEmpty}>
          <Text style={s.discoverEmptyEmoji}>📍</Text>
          <Text style={s.discoverEmptyText}>Enable location to see nearby places</Text>
          <Text style={s.discoverEmptySub}>Go to Settings → Privacy → Location → PawBond</Text>
        </View>
      ) : displayPartners.length === 0 ? (
        <View style={s.discoverEmpty}>
          <Text style={s.discoverEmptyEmoji}>
            {DISCOVER_CHIPS.find(c => c.value === discoverCat)?.emoji || '🐾'}
          </Text>
          <Text style={s.discoverEmptyText}>
            No {discoverCat ? DISCOVER_CHIPS.find(c => c.value === discoverCat)?.label.toLowerCase() ?? 'places' : 'pet-friendly spots'} found{nearbyRadiusKm ? ` within ${radiusLabel(nearbyRadiusKm)}` : ''}
          </Text>
          <Text style={s.discoverEmptySub}>Try a different category or check back later</Text>
        </View>
      ) : (
        <NearbyCarousel partners={displayPartners} colors={colors} s={s} onPress={openPartner} />
      )}
    </View>
  );
});
