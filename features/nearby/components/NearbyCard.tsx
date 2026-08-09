import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/lib/ThemeContext';
import { formatDist } from '@/lib/units';
import { toTitle } from '@/lib/format';
import { TYPO } from '@/constants/theme';

const SW = Dimensions.get('window').width;

function petAgeLabel(birthDate: string | null): string {
  if (!birthDate) return 'Age unknown';
  const birth = new Date(birthDate);
  const today = new Date();
  const totalMonths = (today.getFullYear() - birth.getFullYear()) * 12 + (today.getMonth() - birth.getMonth());
  if (totalMonths < 1) return 'Newborn';
  if (totalMonths < 12) return `${totalMonths}m old`;
  const y = Math.floor(totalMonths / 12);
  const m = totalMonths % 12;
  return m > 0 ? `${y}y ${m}m` : `${y}y old`;
}

export interface NearbyPet {
  id: string; name: string; species: string; breed: string | null;
  emoji: string; accent_color: string | null; avatar_url: string | null;
  birthday: string | null; latitude: number; longitude: number;
  owner_id: string; distanceKm: number;
  gender?: string | null;
  location_area?: string | null;
  age?: { years: number; months: number } | null;
  owner?: { full_name: string; avatar_url?: string | null; handle?: string | null; user_emoji?: string | null };
  requested?: boolean;
}

// ── Nearby Pet Card (grid, full detail) ───────────────────────────────────────
const GRID_CARD_W    = (SW - 48) / 2;
const GRID_PHOTO_H   = GRID_CARD_W * 0.7; // 30% less height than the card width (was aspectRatio: 1)

export const NearbyCard = React.memo(function NearbyCard({ pet, ac, colors, onRequest, onWithdraw, onPress }: {
  pet: NearbyPet; ac: string; colors: any;
  onRequest: () => void; onWithdraw: () => void;
  onPress: () => void;
}) {
  const petAc = pet.accent_color ?? ac;
  const ageStr = pet.birthday ? petAgeLabel(pet.birthday) : null;

  return (
    <TouchableOpacity style={[ns.card, { width: GRID_CARD_W, backgroundColor: colors.card, shadowColor: colors.textPrimary }]}
      activeOpacity={0.88} onPress={onPress}>

      {/* Photo zone — 30% shorter */}
      <View style={[ns.photoZone, { backgroundColor: `${petAc}18` }]}>
        {pet.avatar_url
          ? <Image source={{ uri: pet.avatar_url }} cachePolicy="memory-disk" style={ns.photo} contentFit="cover" />
          : <LinearGradient colors={[`${petAc}40`, `${petAc}12`]} style={ns.emojiZone}>
              <Text style={ns.emoji}>{pet.emoji}</Text>
            </LinearGradient>
        }
        <View style={[ns.distBadge, { backgroundColor: 'rgba(0,0,0,0.52)' }]}>
          <Ionicons name="navigate-outline" size={9} color="#fff" />
          <Text style={ns.distBadgeText}>{formatDist(pet.distanceKm)}</Text>
        </View>
        {pet.owner && (
          <View style={ns.parentBadge}>
            {pet.owner.avatar_url
              ? <Image source={{ uri: pet.owner.avatar_url }} cachePolicy="memory-disk" style={ns.parentBadgeImg} contentFit="cover" />
              : <Text style={ns.parentBadgeInitial}>
                  {pet.owner.handle?.charAt(0).toUpperCase() ?? pet.owner.user_emoji ?? '?'}
                </Text>
            }
          </View>
        )}
      </View>

      {/* Info */}
      <View style={ns.info}>
        <Text style={[ns.name, { color: colors.textPrimary }]} numberOfLines={1}>{pet.name}</Text>
        {(pet.breed || pet.species) && (
          <Text style={[ns.breed, { color: colors.textSecondary }]} numberOfLines={1}>
            {toTitle(pet.breed ?? pet.species)}
          </Text>
        )}

        {/* Age + area row */}
        <View style={ns.metaRow}>
          {ageStr && (
            <View style={[ns.metaPill, { backgroundColor: `${petAc}15` }]}>
              <Text style={[ns.metaText, { color: petAc }]}>{ageStr}</Text>
            </View>
          )}
        </View>

        {/* CTA */}
        {!pet.requested ? (
          <TouchableOpacity
            style={[ns.btn, { backgroundColor: petAc }]}
            onPress={(e) => { e.stopPropagation?.(); onRequest(); }}
            activeOpacity={0.8}>
            <Text style={ns.btnText}>🐾 Playdate</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[ns.btn, { backgroundColor: '#E24B4A18', borderWidth: 1, borderColor: '#E24B4A', marginTop: 8 }]}
            onPress={(e) => { e.stopPropagation?.(); onWithdraw(); }}>
            <Ionicons name="close-outline" size={13} color="#E24B4A" />
            <Text style={[ns.btnText, { color: '#E24B4A' }]}>Withdraw</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
});

export const ns = StyleSheet.create({
  card:         { borderRadius: 18, overflow: 'hidden', marginBottom: 12,
                  shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  photoZone:    { width: '100%', height: GRID_PHOTO_H, position: 'relative' },
  photo:        { width: '100%', height: '100%' },
  emojiZone:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emoji:        { fontSize: 40 },
  distBadge:    { position: 'absolute', top: 6, right: 6, flexDirection: 'row', alignItems: 'center', gap: 3,
                  paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 },
  distBadgeText:{ fontSize: TYPO.body, fontWeight: '700', color: '#fff' },
  parentBadge:  { position: 'absolute', top: 6, left: 6, width: 28, height: 28, borderRadius: 14,
                  backgroundColor: '#7C5CBF', borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)',
                  alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  parentBadgeImg:     { width: 28, height: 28, borderRadius: 14 },
  parentBadgeInitial: { fontSize: TYPO.body, fontWeight: '800', color: '#fff' },
  info:         { padding: 10, gap: 2 },
  name:         { fontSize: TYPO.body, fontWeight: '800', letterSpacing: -0.3 },
  breed:        { fontSize: TYPO.body, fontWeight: '500', opacity: 0.7 },
  metaRow:      { flexDirection: 'row', gap: 4, marginTop: 4, flexWrap: 'wrap' },
  metaPill:     { flexDirection: 'row', alignItems: 'center', gap: 3,
                  paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 },
  metaText:     { fontSize: TYPO.body, fontWeight: '600' },
  btn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
                  borderRadius: 16, paddingVertical: 9, marginTop: 8 },
  btnText:      { fontSize: TYPO.body, fontWeight: '800', color: '#fff' },
  smallBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3,
                  borderRadius: 10, paddingVertical: 7 },
  smallBtnText: { fontSize: TYPO.body, fontWeight: '700' },
});
