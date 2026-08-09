import { StyleSheet } from 'react-native';
import type { PetInsurance } from '@/lib/db';

export type EditState = Partial<PetInsurance> & { fileUri?: string; fileMime?: string; fileName?: string };

export function makeStyles(colors: any, isDark: boolean, accent: string) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    },
    backBtn: { width: 38, height: 38, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3 },
    fab: { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
    sub: { fontSize: 14, color: colors.textSecondary, marginTop: 1 },
    addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
    addBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

    card: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: colors.card, borderRadius: 18,
      padding: 14, marginBottom: 10,
      borderLeftWidth: 3,
      shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 2,
    },
    cardIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    cardName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
    cardDetail: { fontSize: 14, color: colors.textSecondary, marginTop: 1 },
    cardDetailLabel: { color: colors.textTertiary },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    statusText: { fontSize: 14, fontWeight: '700' },
    dueDate: { fontSize: 14 },

    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40, marginTop: 80 },
    emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
    emptySub: { fontSize: 15, color: colors.textSecondary, textAlign: 'center' },
    emptyBtn: { marginTop: 10, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14 },
    emptyBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

    inputLabel: { fontSize: 15, fontWeight: '500', color: colors.textSecondary, marginBottom: 6, marginTop: 16 },
    input: { height: 50, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 14, paddingHorizontal: 16, fontSize: 15, color: colors.textPrimary, backgroundColor: colors.inputBg },
    dateRow: { height: 50, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.inputBg },
    dateText: { fontSize: 15, color: colors.textPrimary, flex: 1 },
    pickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    pickerSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34 },
    pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
    pickerTitle: { fontSize: 15, fontWeight: '600' },
    pickerBtn: { fontSize: 15 },

    fileBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 46, borderWidth: 1, borderRadius: 14 },
    fileBtnText: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
    filePreview: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14 },
    fileText: { flex: 1, fontSize: 15, color: colors.textPrimary },

    viewRow: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    viewLabel: { fontSize: 14, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
    viewValue: { fontSize: 15, color: colors.textPrimary, fontWeight: '500' },
    footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 24, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.card },
    cancelBtn: { flex: 1, height: 50, borderWidth: 1, borderColor: colors.border, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    cancelText: { fontSize: 15, color: colors.textSecondary },
    saveBtn: { flex: 1, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
    saveText: { fontSize: 15, color: '#fff', fontWeight: '700' },
    deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16, paddingVertical: 12 },
    deleteBtnText: { fontSize: 15, fontWeight: '600' },
  });
}
