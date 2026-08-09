import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { initials } from '@/features/social/utils';

interface EmojiAvatarProps {
  emoji?: string;
  name: string;
  size: number;
  color: string;
  style?: any;
  avatarUrl?: string | null;
}

function EmojiAvatarBase({ emoji, name, size, color, style, avatarUrl }: EmojiAvatarProps) {
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2,
      backgroundColor: `${color}18`, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, style]}>
      {avatarUrl
        ? <Image source={{ uri: avatarUrl }} cachePolicy="memory-disk" style={{ width: size, height: size, borderRadius: size / 2 }} />
        : emoji
          ? <Text style={{ fontSize: size * 0.52 }}>{emoji}</Text>
          : <Text style={{ fontSize: size * 0.34, fontWeight: '700', color }}>{initials(name)}</Text>
      }
    </View>
  );
}

export const EmojiAvatar = React.memo(EmojiAvatarBase);
