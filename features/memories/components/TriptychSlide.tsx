import React from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { format, parseISO } from 'date-fns';
import { KenBurnsImage } from '@/features/memories/components/KenBurnsImage';
import { GalleryPhoto, SLIDE_MS, FILL, MOOD_EMOJI, width, height } from '@/features/memories/videoShared';

interface Props { photos: GalleryPhoto[]; }

export const TriptychSlide = React.memo(function TriptychSlide({ photos }: Props) {
  const col = width / 3;
  const heights = [height * 0.72, height * 0.82, height * 0.72];
  const tops    = [height * 0.09, height * 0.04, height * 0.09];
  return (
    <View style={[FILL, { backgroundColor: '#0a0a0a', flexDirection: 'row', alignItems: 'flex-start' }]}>
      {photos.slice(0, 3).map((p, i) => (
        <View key={i} style={{ width: col, height: heights[i], marginTop: tops[i], overflow: 'hidden', borderRadius: 12, borderWidth: 2, borderColor: '#0a0a0a' }}>
          <KenBurnsImage uri={p.url} style={FILL} duration={SLIDE_MS} configIdx={i} delay={i * 200} />
          <LinearGradient colors={['rgba(0,0,0,0.2)', 'transparent', 'transparent', 'rgba(0,0,0,0.7)']} style={FILL} />
          <View style={{ position: 'absolute', bottom: 12, left: 8, right: 8 }}>
            {p.mood_label && <Text style={{ fontSize: i === 1 ? TYPO.heading : TYPO.body, textAlign: 'center' }}>{MOOD_EMOJI[p.mood_label] ?? '🐾'}</Text>}
            <Text style={{ color: '#fff', fontSize: TYPO.body, fontWeight: '700', textAlign: 'center', marginTop: 3 }}>
              {format(parseISO(p.taken_at), 'MMM d')}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
});

export default TriptychSlide;
