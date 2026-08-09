import React, { useMemo } from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Post } from '@/features/social/types';

interface StoriesStripProps {
  posts: Post[];
  myPet: any;
  profile: any;
  ac: string;
  colors: any;
  onCompose: () => void;
}

function StoriesStripBase({ posts, myPet, profile, ac, colors, onCompose }: StoriesStripProps) {
  const stories = useMemo(() => {
    const seen = new Set<string>();
    const items: { id: string; name: string; emoji?: string; avatarUrl?: string | null; color: string; isOwn: boolean }[] = [];
    if (myPet) {
      items.push({ id: myPet.id, name: 'Your story', emoji: myPet.emoji, avatarUrl: myPet.avatar_url, color: ac, isOwn: true });
      seen.add(myPet.id);
    }
    for (const p of posts) {
      if (p.pet_id && !seen.has(p.pet_id) && !p.id.startsWith('m') && items.length < 9) {
        seen.add(p.pet_id);
        items.push({ id: p.pet_id, name: p.pet?.name ?? 'Pet', emoji: p.pet?.emoji, avatarUrl: p.pet?.avatar_url ?? null, color: p.pet?.accent_color ?? colors.primary, isOwn: false });
      }
    }
    return items;
  }, [posts, myPet, ac]);

  return (
    <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: 32 }}>
        {stories.map(s => (
          <TouchableOpacity key={s.id} onPress={s.isOwn ? onCompose : undefined}
            style={{ alignItems: 'center', gap: 6 }} activeOpacity={0.8}>
            <View style={{
              width: 66, height: 66, borderRadius: 33, padding: 2.5,
              backgroundColor: s.isOwn ? colors.border : s.color,
            }}>
              <View style={{ flex: 1, borderRadius: 30, backgroundColor: colors.card, padding: 2.5, overflow: 'hidden',
                alignItems: 'center', justifyContent: 'center' }}>
                {s.avatarUrl
                  ? <Image source={{ uri: s.avatarUrl }} cachePolicy="memory-disk" style={{ width: '100%', height: '100%', borderRadius: 26 }} />
                  : <Text style={{ fontSize: TYPO.hero }}>{s.emoji ?? '🐾'}</Text>
                }
              </View>
            </View>
            {s.isOwn && (
              <View style={{ position: 'absolute', bottom: 22, right: 0,
                width: 20, height: 20, borderRadius: 10, borderWidth: 2.5,
                borderColor: colors.card, backgroundColor: ac,
                alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="add" size={12} color="#fff" />
              </View>
            )}
            <Text style={{ fontSize: TYPO.body, color: s.isOwn ? ac : colors.textSecondary,
              fontWeight: s.isOwn ? '700' : '500', maxWidth: 64, textAlign: 'center' }} numberOfLines={1}>
              {s.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

export const StoriesStrip = React.memo(StoriesStripBase);
