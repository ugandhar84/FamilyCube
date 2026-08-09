import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import BottomSheet from '@/components/BottomSheet';
import { formatDist } from '@/lib/units';
import { toTitle } from '@/lib/format';
import { NearbyPet } from './NearbyCard';
import { TYPO } from '@/constants/theme';

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

export const PetProfileSheet = React.memo(function PetProfileSheet({ pet, ac, colors, visible, onClose, onRequest, onWithdraw }: {
  pet: NearbyPet | null; ac: string; colors: any; visible: boolean;
  onClose: () => void; onRequest: () => void; onWithdraw: () => void;
}) {
  if (!pet) return null;
  const petAc = pet.accent_color ?? ac;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
        {/* Hero — full-bleed inside the sheet's horizontal padding */}
        <LinearGradient colors={[`${petAc}30`, `${petAc}08`]}
          style={{ height: 140, alignItems: 'center', justifyContent: 'center', marginBottom: -40, marginHorizontal: -24 }}>
          {pet.avatar_url
            ? <Image source={{ uri: pet.avatar_url }} cachePolicy="memory-disk" style={{ width: 96, height: 96, borderRadius: 48,
                borderWidth: 3, borderColor: colors.card }} />
            : <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: `${petAc}25`,
                alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.card }}>
                <Text style={{ fontSize: 48 }}>{pet.emoji}</Text>
              </View>
          }
        </LinearGradient>

        <View style={{ paddingTop: 48, gap: 6 }}>
          <Text style={{ fontSize: TYPO.title, fontWeight: '900', color: colors.textPrimary,
            textAlign: 'center', letterSpacing: -0.5 }}>
            {pet.emoji} {pet.name}
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
            {pet.breed && (
              <View style={{ backgroundColor: `${petAc}18`, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: petAc }}>{toTitle(pet.breed)}</Text>
              </View>
            )}
            {pet.birthday && (
              <View style={{ backgroundColor: '#14B8A618', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#14B8A6' }}>{petAgeLabel(pet.birthday)}</Text>
              </View>
            )}
            <View style={{ backgroundColor: colors.inputBg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4,
              flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="location-outline" size={11} color={colors.textTertiary} />
              <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary }}>{formatDist(pet.distanceKm)}</Text>
            </View>
          </View>

          {/* Action buttons */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
            <TouchableOpacity style={{ flex: 1, height: 52, borderRadius: 16, borderWidth: 1.5,
              borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
              onPress={onClose}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textSecondary }}>Close</Text>
            </TouchableOpacity>
            {!pet.requested
              ? <TouchableOpacity style={{ flex: 2, height: 52, borderRadius: 16, backgroundColor: petAc,
                  alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
                  onPress={() => { onRequest(); onClose(); }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#fff' }}>🐾 Request Playdate</Text>
                </TouchableOpacity>
              : <TouchableOpacity style={{ flex: 2, height: 52, borderRadius: 16, backgroundColor: '#E24B4A18',
                  alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#E24B4A' }}
                  onPress={() => { onWithdraw(); onClose(); }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#E24B4A' }}>Withdraw Request</Text>
                </TouchableOpacity>
            }
          </View>
        </View>
    </BottomSheet>
  );
});
