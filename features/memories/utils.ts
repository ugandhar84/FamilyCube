import { StyleSheet, Dimensions } from 'react-native';
import { SPACING, RADIUS } from '@/constants/theme';

const { width, height: screenHeight } = Dimensions.get('window');

// Convert #RRGGBB + 0-255 alpha to rgba() — avoids Android 8-digit hex bugs
export function ha(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function makeStyles(colors: any, isDark: boolean) {
  return StyleSheet.create({
    safe:  { flex: 1 },
    header: { paddingHorizontal: SPACING.lg, paddingTop: 8, paddingBottom: 6, gap: 4 },
    headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    identityRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    avatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    petLine: { fontSize: 15, flexShrink: 1 },
    title: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
    sub:   { fontSize: 14, marginTop: 1 },
    captureBtn:     { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: RADIUS.full, paddingHorizontal: 14, paddingVertical: 9 },
    captureBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

    yirBanner:  { marginHorizontal: SPACING.lg, borderRadius: RADIUS.xl, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
    yirIconBox: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    yirLabel:   { fontSize: 14, fontWeight: '800', letterSpacing: 1.4, color: '#fff' },
    yirSub:     { fontSize: 14, color: 'rgba(255,255,255,0.65)', marginTop: 2 },

    tabSegment:     { flexDirection: 'row', borderRadius: 20, padding: 3, gap: 3 },
    tabSegmentItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 17 },
    tabText:        { fontSize: 15 },
    tabBadge:       { borderRadius: RADIUS.full, paddingHorizontal: 6, paddingVertical: 1, minWidth: 20, alignItems: 'center' },
    tabBadgeText:   { fontSize: 14, fontWeight: '700' },

    scroll: { padding: SPACING.lg, paddingTop: 0, paddingBottom: 80 },

    addPhotoRow:  { flexDirection: 'row', gap: 10, marginBottom: 16 },
    addPhotoBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderRadius: RADIUS.lg, paddingVertical: 14, paddingHorizontal: 12 },
    addPhotoText: { fontSize: 15, fontWeight: '600' },

    monthRow:   { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 },
    monthLabel: { fontSize: 14, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
    monthCount: { fontSize: 14 },

    trendCard: { borderRadius: RADIUS.lg, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
    trendText: { fontSize: 15, flex: 1 },

    filterBar:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
    filterBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
    filterBtnText: { fontSize: 15, fontWeight: '600' },
    filterClear:   { padding: 2 },

    fab:          { position: 'absolute', bottom: 24, right: 20, zIndex: 99 },
    fabBtn:       { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
    dpOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    dpCard:       { width: '100%', borderRadius: 20, padding: 20, gap: 14 },
    dpTitle:      { fontSize: 16, fontWeight: '800' },
    dpSub:        { fontSize: 14, marginTop: -8 },
    dpInput:      { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
    dpInputText:  { fontSize: 14, flex: 1 },
    dpChips:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    dpChip:       { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1 },
    dpChipText:   { fontSize: 14, fontWeight: '600' },
    dpActions:    { flexDirection: 'row', gap: 10, marginTop: 4 },
    dpActionBtn:  { flex: 1, paddingVertical: 11, borderRadius: 12, borderWidth: 1, alignItems: 'center' },

    grid:           { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 4 },
    thumb:          { borderRadius: RADIUS.md, overflow: 'hidden' },
    thumbImg:       { width: '100%', height: '100%' },
    thumbGrad:      { position: 'absolute', bottom: 0, left: 0, right: 0, height: 36, justifyContent: 'flex-end', paddingHorizontal: 5, paddingBottom: 4 },
    thumbDate:      { fontSize: 14, color: '#fff', fontWeight: '600' },
    thumbBadge:     { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
    thumbEmoji:     { fontSize: 14 },
    thumbSourceBadge: { position: 'absolute', top: 4, left: 4, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    thumbOverlay:   { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' } as any,
    thumbMoreText:  { fontSize: 20, fontWeight: '800', color: '#fff' },

    moodRow:    { borderRadius: RADIUS.lg, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10, shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
    moodCard:   { borderRadius: RADIUS.lg, marginBottom: 12, overflow: 'hidden', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2, borderWidth: 1, borderColor: 'rgba(0,0,0,0.10)' },
    moodPhoto:  { width: '100%', aspectRatio: 4/3 },
    moodCardBody: { padding: 12, gap: 10 },
    moodHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    moodIconBox:{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    moodEmoji:  { fontSize: 22 },
    moodName:   { fontSize: 14, fontWeight: '700' },
    moodDate:   { fontSize: 14, marginTop: 1 },
    moodNote:   { fontSize: 14, marginTop: 2, fontStyle: 'italic' },
    scorePill:  { borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row', alignItems: 'baseline' },
    scoreText:  { fontSize: 15, fontWeight: '800' },
    scoreSubText: { fontSize: 14, fontWeight: '500' },
    moodThumb:  { width: 44, height: 44, borderRadius: RADIUS.md },
    breakdownWrap:  { gap: 6 },
    breakdownRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
    breakdownLabel: { fontSize: 14, fontWeight: '600', width: 50 },
    breakdownTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
    breakdownFill:  { height: '100%', borderRadius: 3 },
    breakdownPct:   { fontSize: 14, fontWeight: '700', width: 32, textAlign: 'right' },
    situationBox:   { borderWidth: 1, borderRadius: RADIUS.md, padding: 10, gap: 4 },
    situationLabel: { fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },
    situationText:  { fontSize: 15, lineHeight: 18 },
    adviceWrap:     { gap: 6 },
    adviceTitle:    { fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },
    adviceRow:      { flexDirection: 'row', gap: 6 },
    adviceDot:      { fontSize: 14, fontWeight: '800', lineHeight: 20 },
    adviceText:     { fontSize: 15, lineHeight: 19, flex: 1 },

    lightboxBg:          { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
    lightboxTopBar:      { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, zIndex: 10 },
    lightboxBtn:         { padding: 8 },
    lightboxDownloadBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: RADIUS.full, paddingHorizontal: 14, paddingVertical: 9 },
    lightboxDownloadText:{ color: '#fff', fontSize: 15, fontWeight: '600' },
    lightboxCounter:     { color: '#fff', fontSize: 15, fontWeight: '600', backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
    lightboxImg:         { width, height: screenHeight },
    lightboxMeta:        { position: 'absolute', bottom: 0, left: 0, right: 0, paddingVertical: 24, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: isDark ? 'rgba(14,10,24,0.95)' : 'rgba(255, 245, 230, 0.95)', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderTopColor: isDark ? 'rgba(160,125,212,0.2)' : 'rgba(255, 193, 7, 0.2)' },
    lightboxEmoji:       { fontSize: 40 },
    lightboxMoodLabel:   { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
    lightboxDate:        { fontSize: 15, color: colors.textSecondary, marginTop: 3, fontWeight: '600' },
    lightboxNavBtn:      { position: 'absolute', width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 22 },
    lightboxNavPrev:     { left: 16 },
    lightboxNavNext:     { right: 16 },
  });
}

// ── Pet Timeline utils ─────────────────────────────────────────────────────

export type TimelineTemplate = 'pastel' | 'minimal' | 'scrapbook';

export function getTemplateTheme(template: TimelineTemplate) {
  const isScrapbook = template === 'scrapbook';
  const isPastel    = template === 'pastel';
  return {
    bg:        isScrapbook ? '#1E1E2E' : isPastel ? '#EFF8F2' : '#FFF8F2',
    cream:     isScrapbook ? '#1E1E2E' : isPastel ? '#EFF8F2' : '#FFF8F2',
    textColor: isScrapbook ? '#E8E8F0' : '#2C2C3E',
    subColor:  isScrapbook ? '#A0A0B8' : isPastel ? '#4A6B5A' : '#6B7280',
    lineColor: isScrapbook ? '#3C3C50' : isPastel ? '#A8D5BA' : '#E5E7EB',
    dotBg:     isScrapbook ? '#3C3C50' : isPastel ? '#C8EDD6' : '#EBEBF0',
    titleColor:isScrapbook ? '#E8E8F0' : isPastel ? '#2A5C3F' : '#2C2C3E',
    accentLine:isPastel    ? '#7EC8A0' : isScrapbook ? '#3C3C50' : '#E5E7EB',
    purple:    isScrapbook ? '#2D1B69' : isPastel ? '#2E6B4A' : '#4E2A84',
    accent:    isScrapbook ? '#3A7CA5' : isPastel ? '#5AB882' : '#E8834A',
    catColors: {
      milestone:   isScrapbook ? '#9B7FC7' : isPastel ? '#4A9B6F' : '#7B5EA7',
      health:      isScrapbook ? '#7FAACC' : isPastel ? '#3D7A8A' : '#C06B6B',
      achievement: isScrapbook ? '#7FC7A3' : isPastel ? '#5A8A3D' : '#B07840',
      moment:      isScrapbook ? '#C7A37F' : isPastel ? '#8A6B3D' : '#6B7FA3',
    },
  };
}

export function getAvailableYears(): number[] {
  return [new Date().getFullYear()];
}

export function yearSublabel(yr: number, used: number): string {
  const MAX_ATTEMPTS = 4;
  const remaining = MAX_ATTEMPTS - used;
  if (used >= MAX_ATTEMPTS) return 'Generated ✓';
  const now = new Date();
  if (yr === now.getFullYear()) return `${remaining} of ${MAX_ATTEMPTS} left this year`;
  return `${remaining} of ${MAX_ATTEMPTS} left`;
}

export function formatTimelineDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}
