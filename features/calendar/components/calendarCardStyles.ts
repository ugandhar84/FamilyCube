import { StyleSheet } from 'react-native';
import { TYPO } from '@/constants/theme';

// Shared stylesheet for the calendar/schedule screen's event cards, title
// row, and toolbar chrome. Mirrors features/quests/components/questCardStyles.ts
// so both tabs read as one design system — frosted-glass card shell,
// pill filters, badge/status chips.
export const s = StyleSheet.create({
  titleRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12 },
  title:       { fontSize: TYPO.heading, fontWeight: '900', letterSpacing: -0.3 },
  headerBtn:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 },
  headerBtnOutline: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5 },

  // ── Event card — frosted glass shell (mirrors questCard) ──────────────────
  eventCard:   {
    borderRadius: 28, borderWidth: 1, overflow: 'hidden',
    shadowOpacity: 0.10, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  // Lighter-weight card for dense contexts (month cells, hour-slot rows) —
  // same palette rules, smaller radius/padding, no blur (too small to read).
  eventCardCompact: {
    borderRadius: 14, borderWidth: 1,
  },

  badge:       { borderRadius: 20, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 3 },
  badgeText:   { fontSize: TYPO.micro, fontWeight: '800', letterSpacing: 0.3 },
  catBadge:    { borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  catText:     { fontSize: TYPO.micro, fontWeight: '900', letterSpacing: 0.5 },

  eventTitle:  { fontSize: TYPO.body, fontWeight: '800', lineHeight: 19, letterSpacing: -0.2 },

  pill:        { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 22, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 7 },
  pillText:    { fontSize: TYPO.caption, fontWeight: '700' },

  metaRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingTop: 12, marginTop: 6 },
  assignRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, paddingTop: 8, flexWrap: 'wrap' },
  assignChip:  { borderRadius: 12, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },

  approvalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: 8 },
  approveBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7 },

  driverSection:{ borderTopWidth: 1, paddingTop: 8, gap: 6 },
  statusBadge: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  statusText:  { fontSize: TYPO.label, fontWeight: '800' },
  rejectedBox: { borderRadius: 14, borderWidth: 1, padding: 10 },
  reassignBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7, alignSelf: 'flex-end' },

  actionBtn:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 18 },
  actionBtnText: { fontSize: TYPO.label, fontWeight: '800' },

  notesText:   { fontSize: 11, fontWeight: '600', fontStyle: 'italic', borderRadius: 12, borderWidth: 1, padding: 8, lineHeight: 16 },

  emptyBox:    { borderRadius: 24, borderWidth: 1, padding: 48, alignItems: 'center', marginHorizontal: 14 },
});
