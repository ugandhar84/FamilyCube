import { StyleSheet, Platform } from 'react-native';

export function styles(colors: any, accent: string) {
  return StyleSheet.create({
    safe:       { flex: 1, backgroundColor: colors.background },

    // ── Page header ──
    header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12, backgroundColor: colors.background, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    heading:    { fontSize: 22, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3 },
    subheading: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
    bellBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },

    // ── Hero wrapper ──
    statusStrip:    { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 10 },
    petIdentityRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    petAvatarSm:    { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    petNameSm:      { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
    petSubSm:       { fontSize: 14, marginTop: 1 },
    vetClinicsBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1 },
    vetClinicsBtnLabel: { fontSize: 14, fontWeight: '600' },
    chipRow:    { flexDirection: 'row', gap: 8 },
    chip:       { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 12, borderWidth: 1, minWidth: 0 },
    chipVal:    { fontSize: 14, fontWeight: '700', letterSpacing: -0.1, flexShrink: 1 },
    chipKey:    { fontSize: 14, marginTop: 1, flexShrink: 1 },

    // ── Quick actions ──
    qaStrip: { flexDirection: 'row', gap: 10 },
    qaCard:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 16, backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6 }, android: { elevation: 0 } }) },
    qaLabel: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 15 },

    // ── Section headers ──
    sectionAction: { fontSize: 15, fontWeight: '600' },

    // ── Grouped card ──
    card: { backgroundColor: colors.card, borderRadius: 16, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6 }, android: { elevation: 0 } }) },

    // ── Appointment rows ──
    apptRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, gap: 12 },
    apptDateBlock: { width: 36, alignItems: 'center' },
    apptDay:       { fontSize: 22, fontWeight: '800', lineHeight: 24 },
    apptMon:       { fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
    apptDivider:   { width: 1.5, height: 40, borderRadius: 1 },
    insIconWrap:   { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    apptTitle:     { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
    apptMeta:      { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
    countdownChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, minWidth: 56, alignItems: 'center' },
    countdownText: { fontSize: 11, fontWeight: '700', textAlign: 'center', letterSpacing: 0.3 },

    // ── Medication cards ──
    medCard:         { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14, backgroundColor: colors.card, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6 }, android: { elevation: 0 } }) },
    medIcon:         { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.infoLight, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    medName:         { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
    medMeta:         { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
    activeBadge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: colors.successLight },
    activeBadgeText: { fontSize: 14, fontWeight: '700', color: colors.success },

    // ── Vaccine chips ──
    vaxChip:     { width: 118, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 14, backgroundColor: colors.card, alignItems: 'center', ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6 }, android: { elevation: 0 } }) },
    vaxName:     { fontSize: 15, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', marginBottom: 4 },
    vaxDate:     { fontSize: 14, color: colors.textSecondary, marginBottom: 6 },
    vaxBadge:    { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
    vaxBadgeText:{ fontSize: 14, fontWeight: '700' },

    // ── FurAI banner ──
    furaiBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20, borderWidth: 1, borderRadius: 18, padding: 16, ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6 }, android: { elevation: 0 } }) },
    furaiIcon:   { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    furaiTitle:  { fontSize: 15, fontWeight: '700' },
    furaiSub:    { fontSize: 14, marginTop: 2, lineHeight: 17 },

    // ── Timeline ──
    filterBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
    filterBtnText: { fontSize: 14, fontWeight: '600' },
    tlEmpty:       { alignItems: 'center', paddingVertical: 52, gap: 8, paddingHorizontal: 16 },
    tlEmptyText:   { fontSize: 16, fontWeight: '700', color: colors.textSecondary },
    tlEmptySub:    { fontSize: 15, textAlign: 'center', lineHeight: 18, color: colors.textTertiary },
    tlDot:         { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
    tlLine:        { width: 2, flex: 1, minHeight: 20 },
    tlCard:        { flex: 1, backgroundColor: colors.card, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginLeft: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 1 }, shadowRadius: 4 }, android: { elevation: 0 } }) },
    tlBadge:       { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20 },
    tlBadgeText:   { fontSize: 14, fontWeight: '600' },
    tlDate:        { fontSize: 14 },
    tlTitle:       { fontSize: 15, fontWeight: '700', lineHeight: 21, marginBottom: 3 },
    tlBody:        { fontSize: 15, lineHeight: 19 },
    tlClinicRow:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
    tlClinicText:  { fontSize: 14, flex: 1 },

    // ── Filter sheet ──
    filterRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 4, borderRadius: 12 },
    filterDot:   { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    filterLabel: { fontSize: 14 },

    // ── Modals / sheets ──
    overlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    sheet:         { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 24, maxHeight: '92%' },
    sheetHead:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    sheetTitle:    { fontSize: 20, fontWeight: '800' },
    input:         { height: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 15 },
    dateBtn:       { height: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
    dateBtnText:   { fontSize: 15, flex: 1 },
    freqBtn:       { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
    freqBtnText:   { fontSize: 14, textTransform: 'capitalize' },
    modalBtns:     { flexDirection: 'row', gap: 10, marginTop: 22 },
    cancelBtn:     { flex: 1, height: 50, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    cancelText:    { fontSize: 15 },
    saveBtn:       { flex: 1, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    saveText:      { fontSize: 15, color: '#fff', fontWeight: '700' },
    pickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    pickerSheet:   { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34 },
    pickerHead:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  });
}
