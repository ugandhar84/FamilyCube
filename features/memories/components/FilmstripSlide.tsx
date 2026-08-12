import React from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { format, parseISO } from 'date-fns';
import { KenBurnsImage } from '@/features/memories/components/KenBurnsImage';
import { GalleryPhoto, SLIDE_MS, FILL, MOOD_EMOJI, width, height, YEAR } from '@/features/memories/videoShared';

interface Props { photos: GalleryPhoto[]; }

export const FilmstripSlide = React.memo(function FilmstripSlide({ photos }: Props) {
  const FRAME_W = width * 0.56;
  const FRAME_H = height * 0.46;
  const HOLE = 10;
  const holeCount = 8;
  return (
    <View style={[FILL, { backgroundColor: '#0d0d0d', justifyContent: 'center' }]}>
      {/* Sprocket holes top */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 12, marginBottom: 6 }}>
        {Array.from({ length: holeCount }).map((_, i) => (
          <View key={i} style={{ width: HOLE, height: HOLE, borderRadius: HOLE / 2, backgroundColor: '#2a2a2a' }} />
        ))}
      </View>
      {/* Film frames scroll row */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 10, gap: 6 }}>
        {Array.from({ length: 5 }).map((_, i) => {
          const p = photos[i];
          return (
            <View key={i} style={{ width: FRAME_W, height: FRAME_H, overflow: 'hidden', borderRadius: 4, borderWidth: 3, borderColor: '#1f1f1f', backgroundColor: '#111' }}>
              {p
                ? <>
                    <KenBurnsImage uri={p.url} style={FILL} duration={SLIDE_MS} configIdx={i} delay={i * 100} />
                    <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={[FILL, { justifyContent: 'flex-end', padding: 8 }]}>
                      {p.mood_label && <Text style={{ fontSize: TYPO.body }}>{MOOD_EMOJI[p.mood_label] ?? '🐾'}</Text>}
                      <Text style={{ color: '#fff', fontSize: TYPO.body, fontWeight: '700', marginTop: 2 }}>
                        {format(parseISO(p.taken_at), 'MMM d')}
                      </Text>
                    </LinearGradient>
                  </>
                : null
              }
            </View>
          );
        })}
      </View>
      {/* Sprocket holes bottom */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 12, marginTop: 6 }}>
        {Array.from({ length: holeCount }).map((_, i) => (
          <View key={i} style={{ width: HOLE, height: HOLE, borderRadius: HOLE / 2, backgroundColor: '#2a2a2a' }} />
        ))}
      </View>
      <Text style={{ color: '#555', fontSize: TYPO.body, fontWeight: '700', textAlign: 'center', letterSpacing: 3, marginTop: 18 }}>
        {YEAR} ◆ FAMILY CUBE
      </Text>
    </View>
  );
});

export default FilmstripSlide;
