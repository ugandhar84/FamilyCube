import { StyleSheet } from 'react-native';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';

// ─── Styles ───────────────────────────────────────────────────────────────────
export const f = StyleSheet.create({
  backdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet:       { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12, maxHeight: '75%', flexShrink: 1, overflow: 'hidden' },
  handle:      { width: 44, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  title:       { fontSize: TYPO.heading, fontWeight: '900' },
  // Figma: 13px/500, label sits above the field with 6px gap
  label:       { fontSize: 13, fontWeight: '500', lineHeight: 18, marginBottom: 6, marginTop: 10 },
  sectionLabel:{ fontSize: TYPO.body, fontWeight: '700', letterSpacing: 0.2, marginBottom: 10, marginTop: 4 },
  // Figma "Labeled field": white bg, 1px #DFE5EF border, 14px radius, 14px padding, 14px font 170% lh
  // Active state (focused/filled) gets 2px catColor border — callers apply that override inline.
  input:       { borderWidth: 1, borderRadius: 14, padding: 14, fontSize: 14, lineHeight: 24, minHeight: 88, marginBottom: 10 },
  multiInput:  { minHeight: 96, textAlignVertical: 'top' },
  dateBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, minHeight: 88 },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  pickerCard:    { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 32 },
  suggPill:    { flexDirection: 'row', alignItems: 'center', borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, flexShrink: 0 },
  kidNote:     { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12 },
  // Figma "Primary action": catColor bg, 14px radius, 48px height, 15px/600 white label
  submitBtn:   { flex: 1, borderRadius: 14, height: 48, alignItems: 'center', justifyContent: 'center',
                 flexDirection: 'row', gap: 8 },
  // Figma "Secondary action": white bg, 1px #DFE5EF border, 14px radius, 48px height
  secondaryBtn:{ flex: 1, borderRadius: 14, height: 48, alignItems: 'center', justifyContent: 'center',
                 borderWidth: 1, flexDirection: 'row', gap: 8 },
  summaryCard: { borderRadius: 22, borderWidth: 1, padding: 16, marginBottom: 10 },
  // Figma "Content group": #EEE7FC bg, 22px radius, 16px padding — tip/info cards
  tipCard:     { borderRadius: 22, padding: 16, marginBottom: 10 },
});
