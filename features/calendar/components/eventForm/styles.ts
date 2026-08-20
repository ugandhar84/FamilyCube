import { StyleSheet } from 'react-native';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';

// ─── Styles ───────────────────────────────────────────────────────────────────
export const f = StyleSheet.create({
  backdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet:       { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12, maxHeight: '75%' },
  handle:      { width: 44, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  title:       { fontSize: TYPO.heading, fontWeight: '900' },
  label:       { fontSize: TYPO.caption, fontWeight: '700', letterSpacing: 0.4, marginBottom: 6, marginTop: 10 },
  sectionLabel:{ fontSize: TYPO.body, fontWeight: '900', letterSpacing: 0.4, marginBottom: 10, marginTop: 4 },
  input:       { borderWidth: 1.5, borderRadius: 14, padding: 13, fontSize: TYPO.body, marginBottom: 10 },
  multiInput:  { minHeight: 72, textAlignVertical: 'top' },
  dateBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  pickerCard:    { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 32 },
  suggPill:    { flexDirection: 'row', alignItems: 'center', borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 8, flexShrink: 0 },
  kidNote:     { borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 12 },
  submitBtn:   { flex: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
                 flexDirection: 'row', gap: 8, backgroundColor: BRAND.purple },
  summaryCard: { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 8 },
});
