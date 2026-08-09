import { StyleSheet } from 'react-native';
import { SPACING, RADIUS } from '@/constants/theme';

/** Styles for the main YearInReviewScreen page */
export const s = StyleSheet.create({
  safe:   { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: SPACING.lg, paddingVertical: 12 },
  backBtn:{ width: 38, height: 38, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  title:  { fontSize: 17, fontWeight: '700' },
  scroll: { padding: SPACING.lg, paddingBottom: 80 },

  hero:        { borderRadius: RADIUS.xl, overflow: 'hidden', padding: 24, gap: 8, marginBottom: 20 },
  heroBadge:   { fontSize: 14, fontWeight: '800', letterSpacing: 1.4 },
  heroName:    { fontSize: 30, fontWeight: '800', color: '#fff', marginTop: 2 },
  heroStats:   { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  heroStat:    { flex: 1, alignItems: 'center' },
  heroStatVal: { fontSize: 22, fontWeight: '800', color: '#fff' },
  heroStatLbl: { fontSize: 14, marginTop: 2, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  heroDiv:     { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.2)' },

  empty:      { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptySub:   { fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 260 },

  section:  { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  card:     { borderRadius: RADIUS.lg, padding: 16, shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },

  moodRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  moodLabel: { fontSize: 14, fontWeight: '600' },
  moodPct:   { fontSize: 14, fontWeight: '700' },
  moodTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  moodFill:  { height: 6, borderRadius: 3 },

  msRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  msIcon:  { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  msTitle: { fontSize: 14, fontWeight: '700' },
  msMeta:  { fontSize: 14, marginTop: 2 },

  monthCell:    { width: 80, height: 100, borderRadius: 12, overflow: 'hidden' },
  musicHint:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, marginTop: 20 },
  musicHintText:{ fontSize: 14 },
  playCta:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: RADIUS.lg, marginTop: 14 },
  playCtaText:  { fontSize: 16, fontWeight: '700', color: '#fff' },
});

/** Styles for slide components (SlideshowModal + slide content) */
export const ss = StyleSheet.create({
  slidePad:    { padding: 36, justifyContent: 'center' },
  slideTitle:  { fontSize: 30, fontWeight: '800', color: '#fff', lineHeight: 36 },
  slideSub:    { fontSize: 16, marginTop: 4 },

  coverPet:    { fontSize: 44, fontWeight: '800', color: '#fff', lineHeight: 52 },
  closingSub:  { fontSize: 18, lineHeight: 26 },
  closingBadge:{ borderWidth: 1, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 4, marginTop: 32 },
  closingBadgeText: { fontSize: 14, fontWeight: '800', letterSpacing: 1.8 },

  moodRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  moodEmoji: { fontSize: 26, width: 36 },
  moodLabel: { fontSize: 14, fontWeight: '600', color: '#fff' },
  moodTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  moodFill:  { height: 6, borderRadius: 3 },
  moodPct:   { fontSize: 15, fontWeight: '800', width: 40, textAlign: 'right' },

  msRow:     { flexDirection: 'row', alignItems: 'center', gap: 14 },
  msEmojiBox:{ width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  msTitle:   { fontSize: 15, fontWeight: '700', color: '#fff' },
  msMeta:    { fontSize: 14, marginTop: 3 },

  progressRow: { position: 'absolute', left: 16, right: 90, flexDirection: 'row', gap: 4 },
  progressSeg: { flex: 1, height: 2.5, borderRadius: 2 },
  controls:    { position: 'absolute', right: 12, flexDirection: 'row', gap: 8 },
  controlBtn:  { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
});
