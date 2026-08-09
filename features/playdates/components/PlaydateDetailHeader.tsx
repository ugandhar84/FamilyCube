import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import BackButton from '@/components/BackButton';
import { useTheme } from '@/lib/ThemeContext';
import type { Pet } from '@/features/playdates/components/playdateDetailTypes';
import { TYPO } from '@/constants/theme';

interface Props {
  myPet: Pet | null;
  otherPet: Pet | null;
}

function PetCard({ pet, label, colors }: { pet: Pet | null; label: string; colors: ReturnType<typeof useTheme>['colors'] }) {
  const color = pet?.accent_color ?? colors.primary;
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <View style={[s.petCard, { borderColor: `${color}60` }]}>
        {pet?.avatar_url
          ? <Image source={{ uri: pet.avatar_url }} cachePolicy="memory-disk" style={s.petImg} contentFit="cover" />
          : <LinearGradient colors={[`${color}30`, `${color}10`]} style={s.petGradient}>
              <Text style={{ fontSize: TYPO.title }}>{pet?.emoji}</Text>
            </LinearGradient>
        }
      </View>
      <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: color, maxWidth: 70 }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function PlaydateDetailHeader({ myPet, otherPet }: Props) {
  const { colors } = useTheme();
  return (
    <View style={s.header}>
      <BackButton />
      <View style={s.petsRow}>
        <PetCard pet={myPet} label={myPet?.name ?? 'You'} colors={colors} />
        <Text style={{ fontSize: TYPO.heading, marginBottom: 16 }}>🐾</Text>
        <PetCard pet={otherPet} label={otherPet?.name ?? 'Them'} colors={colors} />
      </View>
      <View style={{ width: 38 }} />
    </View>
  );
}

export default React.memo(PlaydateDetailHeader);

const s = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  petsRow:     { flex: 1, alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'center', gap: 10 },
  petCard:     { width: 52, height: 52, borderRadius: 12, overflow: 'hidden', borderWidth: 1.5 },
  petImg:      { width: '100%', height: '100%' },
  petGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
