import { StyleSheet, Dimensions } from 'react-native';

const { width: SW } = Dimensions.get('window');
export const PHOTO_SIZE = SW - 48;

export function makeStyles(_colors: any, _isDark: boolean) {
  return StyleSheet.create({
    header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 20, paddingVertical: 10 },
    backBtn:   { width: 38, height: 38, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
    title:     { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },

    photoWrap:  { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 },
    photoFrame: { width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: 28, borderWidth: 2, overflow: 'hidden', alignSelf: 'center' },
    photo:      { width: '100%', height: '100%' },
    retakeOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
    emptyCircle:{ width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
    emptyTitle: { fontSize: 17, fontWeight: '800', textAlign: 'center', letterSpacing: -0.3 },
    emptySub:   { fontSize: 14, textAlign: 'center', lineHeight: 20 },

    srcRow:    { flexDirection: 'row', gap: 10, paddingHorizontal: 24, marginBottom: 14 },
    srcBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13, borderRadius: 16 },
    srcBtnTxt: { fontSize: 14, fontWeight: '700' },

    ctaBanner:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 24, marginBottom: 14, padding: 14, borderRadius: 14 },
    ctaBannerTxt: { fontSize: 14, fontWeight: '500' },

    analyzeBtn:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 24, marginBottom: 20, paddingVertical: 16, paddingHorizontal: 20, borderRadius: 18 },
    analyzeTxt:  { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: -0.2 },
    analyzeSub:  { fontSize: 14, color: 'rgba(255,255,255,0.72)', marginTop: 1 },

    resultCard:  { marginHorizontal: 16, borderRadius: 24, borderWidth: 1.5, overflow: 'hidden', marginBottom: 20 },

    moodHeader:  { padding: 20, gap: 12 },
    moodMainRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    moodEmoji:   { fontSize: 44 },
    moodLabel:   { fontSize: 26, fontWeight: '900', color: '#fff', letterSpacing: -0.5, marginTop: 4 },
    moodSub:     { fontSize: 14, color: 'rgba(255,255,255,0.72)', fontWeight: '500' },

    section:       { paddingHorizontal: 16, paddingTop: 16, gap: 10 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
    sectionTitle:  { fontSize: 14, fontWeight: '800', letterSpacing: 0.8 },

    notesBox:   { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginHorizontal: 16, marginTop: 14, padding: 12, borderRadius: 14, borderWidth: 1 },
    notesText:  { flex: 1, fontSize: 14, lineHeight: 19, fontStyle: 'italic' },

    situationBox: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1 },
    situationTxt: { flex: 1, fontSize: 14, lineHeight: 19, fontWeight: '500' },

    adviceRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 10, borderRadius: 12, borderWidth: 1 },
    priorityDot:  { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    priorityLabel:{ fontSize: 14, fontWeight: '900', color: '#fff' },
    adviceAction: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
    adviceDetail: { fontSize: 14, lineHeight: 17 },

    moodPills:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    moodPill:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
    moodPillTxt: { fontSize: 14, fontWeight: '700' },

    quotaRow:    { alignItems: 'center', paddingHorizontal: 24, marginBottom: 10, marginTop: -2 },
    quotaPill:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
    quotaTxt:    { fontSize: 14, fontWeight: '600' },
    tierChip:    { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, marginLeft: 2 },
    tierChipTxt: { fontSize: 14, fontWeight: '800', textTransform: 'capitalize', letterSpacing: 0.4 },

    retakeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, margin: 16, marginRight: 6, paddingVertical: 13, borderRadius: 16, borderWidth: 1 },
    retakeTxt: { fontSize: 14, fontWeight: '600' },
    saveBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, margin: 16, paddingVertical: 14, borderRadius: 16 },
    saveBtnTxt:{ fontSize: 14, fontWeight: '700', color: '#fff' },
  });
}
