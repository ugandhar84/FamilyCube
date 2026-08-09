import React from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { format, parseISO } from 'date-fns';
import { toTitle } from '@/lib/format';
import { KenBurnsImage } from '@/features/memories/components/KenBurnsImage';
import { GalleryPhoto, SLIDE_MS, FILL, MOOD_EMOJI } from '@/features/memories/videoShared';

interface Props { photos: GalleryPhoto[]; }

export const MomentSlide = React.memo(function MomentSlide({ photos }: Props) {
  const photo = photos[0];
  if (!photo) return null;
  return (
    <View style={[FILL, { backgroundColor: '#000' }]}>
      <KenBurnsImage uri={photo.url} style={FILL} duration={SLIDE_MS} configIdx={1} />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} style={[FILL, { justifyContent: 'flex-end', padding: 36 }]}>
        <Text style={s.momentDate}>{format(parseISO(photo.taken_at), 'MMMM d, yyyy')}</Text>
        {photo.mood_label
          ? <Text style={s.momentMood}>{MOOD_EMOJI[photo.mood_label] ?? '🐾'}  {toTitle(photo.mood_label)}</Text>
          : null}
      </LinearGradient>
    </View>
  );
});

export default MomentSlide;

const s = StyleSheet.create({
  momentDate: { fontSize: TYPO.body, fontWeight: '700', color: '#fff' },
  momentMood: { fontSize: TYPO.heading, color: 'rgba(255,255,255,0.8)', marginTop: 8 },
});
