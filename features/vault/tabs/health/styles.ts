import { StyleSheet } from 'react-native';

// ─── Styles ────────────────────────────────────────────────────────────────────

export const hf = StyleSheet.create({
  innerTabRow: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, padding: 4, marginTop: 12, gap: 4 },
  innerTab:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                 gap: 6, paddingVertical: 9 },
  tabBadge:    { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  searchRow:   { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1.5,
                 paddingHorizontal: 12, paddingVertical: 9, marginTop: 12, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '600' },
  filterChip:  { borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 5 },
  topAddBtn:   { borderRadius: 12, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },

  // Filter sheet
  sheetOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:        { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1,
                  maxHeight: '88%', overflow: 'hidden' },
  // Drag-handle gray: static StyleSheet (no useTheme() access here) and no
  // constants/colors.ts token is a close match to this neutral slate — left
  // as a documented hardcoded swatch rather than guessing a mismatched token.
  sheetHandle:  { width: 40, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1',
                  alignSelf: 'center', marginTop: 10 },
  sheetHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  sheetHeaderBtn: { borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 7 },

  // Filter sheet sections
  fsSection:      { gap: 10, marginBottom: 20 },
  fsSectionTitle: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  fsPill:         { borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 7 },
  fsMemberChip:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1.5,
                    paddingHorizontal: 10, paddingVertical: 8 },
  fsToggleRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14,
                    borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  toggle:         { width: 40, height: 22, borderRadius: 11, justifyContent: 'center' },
  toggleThumb:    { width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff',
                    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, elevation: 2 },

  // Export button
  exportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
               borderRadius: 14, borderWidth: 1.5, paddingVertical: 11 },

  // Active filter pill summary
  filterIconBtn: { width: 44, height: 44, borderRadius: 14, borderWidth: 1.5,
                   alignItems: 'center', justifyContent: 'center' },
  filterBadge:   { position: 'absolute', top: -4, right: -4, width: 16, height: 16,
                   borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  activePill:    { borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 9, paddingVertical: 4 },
});

export const h = StyleSheet.create({
  medCard:    { borderRadius: 16, borderWidth: 1, padding: 12, marginTop: 10 },
  pillIcon:   { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  detailRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detailText: { fontSize: 12 },
  actionBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, borderWidth: 1,
                paddingHorizontal: 10, paddingVertical: 7 },
  // Static StyleSheet (no useTheme() access) and no theme token closely
  // matches this neutral slate — documented hardcoded swatch.
  auditText:  { fontSize: 10, color: '#94A3B8', fontStyle: 'italic' },
  disclaimer: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderRadius: 10,
                borderWidth: 1, padding: 10, marginTop: 12 },
  qChip:      { borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 7 },
  aiInputRow: { flexDirection: 'row', alignItems: 'flex-end', borderRadius: 16, borderWidth: 1.5,
                paddingHorizontal: 12, paddingVertical: 8, marginTop: 12, gap: 8 },
  aiInput:    { flex: 1, fontSize: 14, maxHeight: 80, lineHeight: 20 },
  aiSendBtn:  { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  aiResult:   { borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 14 },
  sharedBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20,
                paddingHorizontal: 16, paddingVertical: 9 },
});
