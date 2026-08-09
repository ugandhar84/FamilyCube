import React from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { KenBurnsImage } from '@/features/memories/components/KenBurnsImage';
import { GalleryPhoto, SLIDE_MS, FILL, YEAR } from '@/features/memories/videoShared';
import type { YIRTemplate } from '@/lib/yirTemplates';

interface Props { photos: GalleryPhoto[]; pet: any; t: YIRTemplate; }

export const CoverSlide = React.memo(function CoverSlide({ photos, pet, t }: Props) {
  const photo = photos[0];
  return (
    <View style={[FILL, { backgroundColor: '#000' }]}>
      {photo
        ? <KenBurnsImage uri={photo.url} style={FILL} duration={SLIDE_MS} configIdx={0} />
        : <LinearGradient colors={[...t.bg]} style={FILL} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />}
      <LinearGradient colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.75)']} style={FILL} />
      <View style={s.slideBottom}>
        <Text style={[s.coverBadge, { color: t.accent }]}>✦  {YEAR} IN REVIEW</Text>
        <Text style={s.coverPet}>{pet?.name ?? 'Your Pet'}</Text>
        <Text style={[s.coverSub, { color: t.subText }]}>A year of memories</Text>
      </View>
    </View>
  );
});

export default CoverSlide;

const s = StyleSheet.create({
  slideBottom: { flex: 1, justifyContent: 'flex-end', padding: 36 },
  coverBadge:  { fontSize: TYPO.body, fontWeight: '800', letterSpacing: 2, marginBottom: 8 },
  coverPet:    { fontSize: 44, fontWeight: '800', color: '#fff', lineHeight: 52 },
  coverSub:    { fontSize: TYPO.subheading, marginTop: 6 },
});
