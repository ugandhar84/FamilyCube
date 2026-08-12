import React from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { format, parseISO } from 'date-fns';
import { toTitle } from '@/lib/format';
import type { YIRTemplate } from '@/lib/yirTemplates';
import { FILL, SLIDE_MS, MONTHLY_CELL, YEAR, type YIRData, type Slide } from '../videoShared';
import { ss } from './videoStyles';
import { KenBurnsImage } from './KenBurnsImage';
import { CoverSlide } from './CoverSlide';
import { StatsSlide } from './StatsSlide';
import { MomentSlide } from './MomentSlide';
import { MagazineSlide } from './MagazineSlide';
import { TriptychSlide } from './TriptychSlide';
import { FilmstripSlide } from './FilmstripSlide';

export const MoodsSlide = React.memo(function MoodsSlide({ data, pet, t }: { data: YIRData; pet: any; t: YIRTemplate }) {
  return (
    <LinearGradient colors={[...t.bg]} style={[FILL, ss.slidePad]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      <Text style={ss.slideTitle}>How {pet?.name ?? 'they'} felt</Text>
      <Text style={[ss.slideSub, { color: t.subText }]}>in {YEAR}</Text>
      <View style={{ gap: 20, marginTop: 32 }}>
        {data.topMoods.map((m, i) => (
          <View key={i} style={ss.moodRow}>
            <Text style={ss.moodEmoji}>{m.emoji}</Text>
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={ss.moodLabel}>{toTitle(m.label)}</Text>
              <View style={[ss.moodTrack, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
                <View style={[ss.moodFill, { width: `${m.pct}%` as any, backgroundColor: m.color }]} />
              </View>
            </View>
            <Text style={[ss.moodPct, { color: m.color }]}>{m.pct}%</Text>
          </View>
        ))}
      </View>
    </LinearGradient>
  );
});

export const MilestonesSlide = React.memo(function MilestonesSlide({ data, t }: { data: YIRData; t: YIRTemplate }) {
  return (
    <LinearGradient colors={[...t.bg]} style={[FILL, ss.slidePad]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      <Text style={ss.slideTitle}>Big moments</Text>
      <Text style={[ss.slideSub, { color: t.subText }]}>milestones of {YEAR}</Text>
      <View style={{ gap: 18, marginTop: 32 }}>
        {data.milestonesThisYear.slice(0, 4).map((m, i) => (
          <View key={i} style={ss.msRow}>
            <View style={[ss.msEmojiBox, { backgroundColor: `${t.accent}25` }]}>
              <Text style={{ fontSize: TYPO.title }}>{m.emoji ?? '🏆'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={ss.msTitle}>{m.title}</Text>
              <Text style={[ss.msMeta, { color: t.subText }]}>{format(parseISO(m.achieved_at), 'MMMM d')}</Text>
            </View>
          </View>
        ))}
      </View>
    </LinearGradient>
  );
});

export const MonthlySlide = React.memo(function MonthlySlide({ data, t }: { data: YIRData; t: YIRTemplate }) {
  return (
    <View style={[FILL, { backgroundColor: '#000' }]}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', flex: 1 }}>
        {data.monthlyHighlights.slice(0, 9).map((m, i) => (
          <View key={i} style={{ width: MONTHLY_CELL, height: MONTHLY_CELL, overflow: 'hidden' }}>
            <KenBurnsImage uri={m.photo.url} style={FILL} duration={SLIDE_MS * 1.5} configIdx={i} delay={i * 80} />
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} style={[FILL, { justifyContent: 'flex-end', padding: 8 }]}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#fff' }}>{m.month}</Text>
            </LinearGradient>
          </View>
        ))}
      </View>
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.7)']} style={[FILL, { justifyContent: 'flex-end', padding: 36 }]} pointerEvents="none">
        <Text style={ss.slideTitle}>{YEAR} in photos</Text>
      </LinearGradient>
    </View>
  );
});

export const ClosingSlide = React.memo(function ClosingSlide({ pet, t }: { pet: any; t: YIRTemplate }) {
  return (
    <LinearGradient colors={[...t.bg]} style={[FILL, { justifyContent: 'center', alignItems: 'center', padding: 40 }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      <Text style={{ fontSize: 72, marginBottom: 24 }}>🐾</Text>
      <Text style={[ss.coverPet, { textAlign: 'center' }]}>{pet?.name ?? 'Your Pet'}</Text>
      <Text style={[ss.closingSub, { color: t.subText, textAlign: 'center', marginTop: 14 }]}>
        Here's to {YEAR + 1} and all the memories still to come.
      </Text>
      <View style={[ss.closingBadge, { borderColor: `${t.accent}60` }]}>
        <Text style={[ss.closingBadgeText, { color: t.accent }]}>FAMILY CUBE  ✦  {t.name.toUpperCase()}</Text>
      </View>
    </LinearGradient>
  );
});

interface SlideContentProps { slide: Slide; data: YIRData; pet: any; t: YIRTemplate; }

export const SlideContent = React.memo(function SlideContent({ slide, data, pet, t }: SlideContentProps) {
  switch (slide.type) {
    case 'cover':      return <CoverSlide photos={slide.photos ?? []} pet={pet} t={t} />;
    case 'stats':      return <StatsSlide data={data} pet={pet} t={t} />;
    case 'moment':     return <MomentSlide photos={slide.photos ?? []} />;
    case 'magazine':   return <MagazineSlide photos={slide.photos ?? []} />;
    case 'triptych':   return <TriptychSlide photos={slide.photos ?? []} />;
    case 'filmstrip':  return <FilmstripSlide photos={slide.photos ?? []} />;
    case 'moods':      return <MoodsSlide data={data} pet={pet} t={t} />;
    case 'milestones': return <MilestonesSlide data={data} t={t} />;
    case 'monthly':    return <MonthlySlide data={data} t={t} />;
    case 'closing':    return <ClosingSlide pet={pet} t={t} />;
    default:           return null;
  }
});
