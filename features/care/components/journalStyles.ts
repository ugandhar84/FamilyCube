import { StyleSheet, Platform } from 'react-native';
import { SPACING, RADIUS } from '@/constants/theme';

export function makeStyles(colors: any, isDark: boolean) {
  return StyleSheet.create({
    safe:   { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingTop: 6, paddingBottom: 10 },
    screenTitle: { fontSize: 22, fontWeight: '800' },
    subtitle: { fontSize: 13, marginTop: 2 },
    petMeta:     { fontSize: 14, marginTop: 1 },
    addBtn:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: RADIUS.full, shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4, shadowColor: colors.primary },
    addBtnText:  { fontSize: 15, fontWeight: '700', color: '#fff' },
    todayBtn:    { paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.full, borderWidth: 1.5 },
    todayBtnText:{ fontSize: 14, fontWeight: '700' },
    backTodayStrip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginHorizontal: 16, marginTop: 6, marginBottom: 2, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
    backTodayText:  { fontSize: 14, fontWeight: '700' },
    weekCard:        { marginHorizontal: 16, marginTop: 10, marginBottom: 4, borderRadius: 16, ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6 }, android: { elevation: 2 } }) },
    weekNavRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 },
    weekNavArrow:    { padding: 4 },
    weekNavCenter:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    weekNavLabel:    { fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
    weekStripRow:    { flexDirection: 'row', paddingHorizontal: 4, paddingBottom: 10 },
    weekStripCell:   { flex: 1, alignItems: 'center', paddingVertical: 4, gap: 3 },
    weekStripDow:    { fontSize: 14, fontWeight: '600', letterSpacing: 0.2 },
    weekStripCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    weekStripNum:    { fontSize: 14 },
    weekStripDotRow: { flexDirection: 'row', gap: 2, height: 5, alignItems: 'center' },
    weekStripDot:    { width: 4, height: 4, borderRadius: 2 },

    dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: SPACING.lg, paddingBottom: 6 },
    dayLabel:  { fontSize: 16, fontWeight: '800' },
    countBadge:{ borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 3 },
    countText: { fontSize: 14, fontWeight: '700' },

    filterRow:     { paddingHorizontal: SPACING.lg, paddingBottom: 10, gap: 8 },
    filterChip:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
    filterChipText:{ fontSize: 14, fontWeight: '600' },

    emptyState: { alignItems: 'center', paddingVertical: 48, gap: 12, paddingHorizontal: 32 },
    emptyIcon:  { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
    emptyTitle: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
    emptySub:   { fontSize: 15, textAlign: 'center', lineHeight: 19 },
    emptyAddBtn:{ flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: RADIUS.full, paddingHorizontal: 20, paddingVertical: 10, marginTop: 4 },
    emptyAddBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    center:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },

    sheetSub:   { fontSize: 14, marginBottom: 16 },

    // 3 columns × 2 rows for the 6 ADD_TYPES. Percentage-based flexBasis (not a
    // pixel width derived from SW) so it can't misjudge the sheet's actual
    // content width and wrap to a 3rd row.
    typeGrid:     { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
    typeCell:     { flexBasis: '31%', borderRadius: RADIUS.lg, borderWidth: 1.5, paddingVertical: 14, paddingHorizontal: 6, gap: 5, alignItems: 'center' },
    typeCellIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    typeCellLabel:{ fontSize: 14, fontWeight: '700', textAlign: 'center' },
    typeCellSub:  { fontSize: 14, textAlign: 'center' },

    formHeaderIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    fieldLabel: { fontSize: 14, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 7, marginTop: 12 },
    input:      { height: 50, borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: 14, fontSize: 15 },
    multiInput: { height: 110, paddingTop: 12, paddingBottom: 12 },
    seg:        { paddingVertical: 10, borderRadius: RADIUS.md, alignItems: 'center' },
    groomGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    groomCell:  { borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1 },
    privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: RADIUS.md, padding: 12, marginTop: 10 },
    privateToggle: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    privacyLabel:  { fontSize: 15, fontWeight: '500', flex: 1 },
    formBtns:   { flexDirection: 'row', gap: 10, marginTop: 20 },
    formFooter: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
    deleteFormBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 14, borderRadius: RADIUS.md },
    deleteFormBtnText: { fontSize: 15, fontWeight: '600' },
    cancelBtn: { alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.md },
    saveFormBtn:    { alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.md, shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4, shadowColor: colors.primary },
    saveFormBtnText:{ color: '#fff', fontSize: 14, fontWeight: '700' },

    fab: {
      position: 'absolute', right: 20, zIndex: 99,
    },
    fabBtn: {
      width: 58, height: 58, borderRadius: 29,
      alignItems: 'center', justifyContent: 'center',
      shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 }, elevation: 8,
    },

    // Entry form sheet styles
    entryDivider:    { height: StyleSheet.hairlineWidth },
    entryInput:      { height: 52, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 16, fontSize: 15 },
    entryMulti:      { height: 100, paddingTop: 14, paddingBottom: 14, textAlignVertical: 'top' as const },
    entryFooter:     { flexDirection: 'row', gap: 10, paddingTop: 12 },
    entryCancel:     { flex: 1, height: 50, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    entrySave:       { flex: 2, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    privacyToggleRow:{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 14, padding: 12, marginTop: 10 },
    privacyCheck:    { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    mealChip:        { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1 },
  });
}
