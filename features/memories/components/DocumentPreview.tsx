import React from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text, StyleSheet, Image } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { CatIconPath } from '@/features/memories/components/CatIconPath';
import { getTemplateTheme, formatTimelineDate, TimelineTemplate } from '@/features/memories/utils';

interface TimelineEntry {
  id: string;
  title: string;
  description: string;
  event_date: string;
  category: 'milestone' | 'health' | 'achievement' | 'moment';
  is_pinned: boolean;
}

interface DocumentPreviewProps {
  entries: TimelineEntry[];
  petName: string;
  petPhotoUrl?: string | null;
  year: number;
  template: TimelineTemplate;
}

export const DocumentPreview = React.memo(function DocumentPreview({ entries, petName, petPhotoUrl, year, template }: DocumentPreviewProps) {
  const th = getTemplateTheme(template);
  const DATE_W = 44;
  const yearStr = year === new Date().getFullYear() ? `${year} SO FAR` : String(year);

  return (
    <View style={[dp.page, { backgroundColor: th.bg }]}>
      {/* Mini header — matches PDF hero */}
      <View style={[dp.header, { backgroundColor: th.purple }]}>
        {/* Pet avatar or logo mark */}
        {petPhotoUrl ? (
          <Image source={{ uri: petPhotoUrl }} style={dp.petAvatar} />
        ) : (
          <View style={[dp.logoBox, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
            <Text style={dp.logoP}>P</Text>
            <View style={[dp.logoDot, { top: 5, left: 18 }]} />
            <View style={[dp.logoDot, { top: 9, left: 22 }]} />
            <View style={[dp.logoDot, { top: 9, left: 14 }]} />
            <Svg width={11} height={10} viewBox="0 0 11 10" style={{ position: 'absolute', top: 13, left: 15 }}>
              <Path d="M5.5 9 C5.5 9 1 5.5 1 3 C1 1.3 2.1 0 3.5 0 C4.3 0 5 0.5 5.5 1.2 C6 0.5 6.7 0 7.5 0 C8.9 0 10 1.3 10 3 C10 5.5 5.5 9 5.5 9Z" fill="#F4A261"/>
            </Svg>
          </View>
        )}
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={dp.brandName}>PawBond</Text>
          <Text style={dp.brandTag}>PET MEMORIES</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={dp.heroYear}>{yearStr}</Text>
          <Text style={dp.heroPetName} numberOfLines={1}>{petName ? `${petName}'s Story` : "My Pet's Story"}</Text>
          <Text style={dp.heroMilestones}>{entries.length} milestone{entries.length !== 1 ? 's' : ''}</Text>
        </View>
      </View>
      {/* Accent stripe */}
      <View style={[dp.accentStripe, { backgroundColor: th.accent }]} />

      {/* Section label */}
      <View style={dp.sectionRow}>
        <View style={[dp.sectionBar, { backgroundColor: th.accent }]} />
        <Text style={[dp.sectionLabel, { color: th.subColor }]}>TIMELINE OF MEMORIES</Text>
      </View>

      {/* Entries */}
      {entries.slice(0, 4).map((entry, idx) => {
        const color = th.catColors[entry.category as keyof typeof th.catColors] ?? '#7B8FA1';
        const isLast = idx === Math.min(entries.length, 4) - 1;
        return (
          <View key={entry.id} style={dp.row}>
            <View style={dp.dotCol}>
              <View style={[dp.dot, { backgroundColor: th.dotBg }]}>
                <CatIconPath category={entry.category} color={color} size={10} />
              </View>
              {!isLast && <View style={[dp.connector, { backgroundColor: th.lineColor }]} />}
            </View>
            <Text style={[dp.date, { color, width: DATE_W }]}>{formatTimelineDate(entry.event_date)}</Text>
            <View style={dp.content}>
              <Text style={[dp.entryTitle, { color }]} numberOfLines={1}>{entry.title}</Text>
              {entry.description ? (
                <Text style={[dp.entryDesc, { color: th.subColor }]} numberOfLines={2}>{entry.description}</Text>
              ) : null}
            </View>
          </View>
        );
      })}
      {entries.length > 4 && (
        <Text style={[dp.more, { color: th.subColor }]}>+{entries.length - 4} more moments…</Text>
      )}

      {/* Footer */}
      <View style={[dp.footerBar, { borderTopColor: th.lineColor }]}>
        <Text style={[dp.footerBrand]}>Family Cube</Text>
      </View>
    </View>
  );
});

const dp = StyleSheet.create({
  page:         { overflow: 'hidden' },
  // Header
  header:       { flexDirection: 'row', alignItems: 'center', padding: 12 },
  petAvatar:    { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' },
  logoBox:      { width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  logoP:        { fontSize: TYPO.subheading, fontWeight: '900', color: '#fff', lineHeight: 24 },
  logoDot:      { position: 'absolute', width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(255,255,255,0.85)' },
  brandName:    { fontSize: TYPO.body, fontWeight: '900', color: '#fff', letterSpacing: 0.3 },
  brandTag:     { fontSize: TYPO.body, fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: 1.5, marginTop: 1 },
  heroYear:     { fontSize: TYPO.body, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 1, textTransform: 'uppercase' },
  heroPetName:  { fontSize: TYPO.body, fontWeight: '900', color: '#fff', fontStyle: 'italic', lineHeight: 17 },
  heroMilestones:{ fontSize: TYPO.body, color: 'rgba(255,255,255,0.6)', marginTop: 1 },
  accentStripe: { height: 3 },
  // Section
  sectionRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginTop: 10, marginBottom: 6 },
  sectionBar:   { width: 10, height: 2, borderRadius: 1, marginRight: 6 },
  sectionLabel: { fontSize: TYPO.body, fontWeight: '900', letterSpacing: 2 },
  // Entries
  row:          { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 12 },
  dotCol:       { alignItems: 'center', width: 24, flexShrink: 0 },
  dot:          { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  connector:    { width: 1, flex: 1, minHeight: 8, marginVertical: 1 },
  date:         { fontSize: TYPO.body, fontWeight: '700', paddingTop: 4, paddingHorizontal: 4, flexShrink: 0 },
  content:      { flex: 1, paddingTop: 3, paddingBottom: 8 },
  entryTitle:   { fontSize: TYPO.body, fontWeight: '800', lineHeight: 13 },
  entryDesc:    { fontSize: TYPO.body, lineHeight: 11, marginTop: 2 },
  more:         { fontSize: TYPO.body, textAlign: 'center', marginTop: 4, fontStyle: 'italic', paddingHorizontal: 12 },
  // Footer
  footerBar:    { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8, marginHorizontal: 12, paddingTop: 6, paddingBottom: 10 },
  footerBrand:  { fontSize: TYPO.body, fontWeight: '900' },
});
