import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { EmojiPet } from '@/features/playdates/types';

interface Props { pet?: EmojiPet | null; size?: number; }

export const EmojiAvatar = React.memo(function EmojiAvatar({ pet, size = 36 }: Props) {
  const ac = pet?.accent_color ?? '#7C5CBF';
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: `${ac}18`, borderWidth: 1.5, borderColor: `${ac}40`,
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    }}>
      {pet?.avatar_url
        ? <Image source={{ uri: pet.avatar_url }} cachePolicy="memory-disk" style={{ width: size, height: size, borderRadius: size / 2 }} />
        : <Text style={{ fontSize: size * 0.52 }}>{pet?.emoji ?? '🐾'}</Text>}
    </View>
  );
});

export default EmojiAvatar;
