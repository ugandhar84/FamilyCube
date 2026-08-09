import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { PlaydateEntry } from '@/features/playdates/types';

interface Props { pet: PlaydateEntry['pet']; size?: number; }

export const PetAvatar = React.memo(function PetAvatar({ pet, size = 52 }: Props) {
  const ac = pet.accent_color ?? '#7C5CBF';
  return (
    <LinearGradient colors={[`${ac}38`, `${ac}12`]}
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
      {pet.avatar_url
        ? <Image source={{ uri: pet.avatar_url }} cachePolicy="memory-disk"
            style={{ width: size - 6, height: size - 6, borderRadius: (size - 6) / 2 }} contentFit="cover" />
        : <Text style={{ fontSize: size * 0.44 }}>{pet.emoji}</Text>
      }
    </LinearGradient>
  );
});

export default PetAvatar;
