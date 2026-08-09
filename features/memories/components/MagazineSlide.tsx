import React from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { format, parseISO } from 'date-fns';
import { KenBurnsImage } from '@/features/memories/components/KenBurnsImage';
import { GalleryPhoto, SLIDE_MS, FILL, MOOD_EMOJI, width, height } from '@/features/memories/videoShared';

interface Props { photos: GalleryPhoto[]; }

export const MagazineSlide = React.memo(function MagazineSlide({ photos }: Props) {
  const heroW = width * 0.62;
  const sideW = width - heroW;
  const sideH = height / 4;
  const hero = photos[0];
  const side = photos.slice(1, 5);
  return (
    <View style={[FILL, { flexDirection: 'row', backgroundColor: '#0a0a0a' }]}>
      {/* Hero */}
      <View style={{ width: heroW, overflow: 'hidden' }}>
        {hero && <KenBurnsImage uri={hero.url} style={FILL} duration={SLIDE_MS} configIdx={0} />}
        <LinearGradient colors={['rgba(0,0,0,0.35)', 'transparent', 'transparent', 'rgba(0,0,0,0.75)']} style={FILL} />
        <View style={{ position: 'absolute', bottom: 28, left: 16, right: 8 }}>
          {hero?.mood_label && <Text style={{ fontSize: TYPO.title, marginBottom: 4 }}>{MOOD_EMOJI[hero.mood_label] ?? '🐾'}</Text>}
          <Text style={{ color: '#fff', fontSize: TYPO.body, fontWeight: '800', letterSpacing: 0.3 }}>
            {hero ? format(parseISO(hero.taken_at), 'MMMM d, yyyy') : ''}
          </Text>
        </View>
      </View>
      {/* Sidebar strip */}
      <View style={{ width: sideW, flexDirection: 'column' }}>
        {Array.from({ length: 4 }).map((_, i) => {
          const p = side[i];
          return (
            <View key={i} style={{ height: sideH, overflow: 'hidden', borderBottomWidth: 2, borderColor: '#0a0a0a' }}>
              {p
                ? <>
                    <KenBurnsImage uri={p.url} style={FILL} duration={SLIDE_MS} configIdx={i + 1} delay={i * 150} />
                    <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={[FILL, { justifyContent: 'flex-end', padding: 6 }]}>
                      <Text style={{ color: '#fff', fontSize: TYPO.body, fontWeight: '700' }}>{format(parseISO(p.taken_at), 'MMM d')}</Text>
                    </LinearGradient>
                  </>
                : <View style={[FILL, { backgroundColor: '#161616' }]} />
              }
            </View>
          );
        })}
      </View>
    </View>
  );
});

export default MagazineSlide;
