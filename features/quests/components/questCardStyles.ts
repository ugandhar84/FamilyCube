import { StyleSheet } from 'react-native';
import { TYPO } from '@/constants/theme';

// Shared stylesheet used by QuestsScreen (tab headers, quest list, cheer cards)
// and by CollapsibleQuestCard (questCard / accentBar).
export const s = StyleSheet.create({
  titleRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
  title:       { fontSize: TYPO.heading, fontWeight: '900', letterSpacing: -0.3 },
  headerBtn:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },


  seniorBanner:     { borderRadius: 20, borderWidth: 1, borderColor: '#92400E60', backgroundColor: '#1C1000', padding: 12 },
  seniorBannerText: { fontSize: TYPO.label, color: '#FCD34D', fontWeight: '600', lineHeight: 16 },

  aiLoadingBox:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0F172A', borderRadius: 20, borderWidth: 1, borderColor: '#6D28D940', padding: 14 },
  aiLoadingText: { fontSize: TYPO.label, fontWeight: '700', color: '#A78BFA', flex: 1 },


  statusTabs:  { flexDirection: 'row', borderBottomWidth: 1, gap: 4 },
  tabItem:     { paddingBottom: 8, paddingHorizontal: 4, position: 'relative' },
  tabText:     { fontSize: TYPO.caption, fontWeight: '700' },
  tabLine:     { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, borderRadius: 1 },

  card:        { borderRadius: 24, borderWidth: 1, padding: 14 },
  cardTitle:   { fontSize: TYPO.caption, fontWeight: '700' },
  cardSub:     { fontSize: TYPO.label, lineHeight: 16 },
  cheerRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 16, borderWidth: 1, padding: 10, marginBottom: 8 },
  cheerName:   { fontSize: TYPO.caption, fontWeight: '700', flex: 1 },
  highFiveBtn: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7 },

  // ── Chore card — frosted glass shell ──────────────────────────────────────
  questCard:   {
    borderRadius: 28, borderWidth: 1, overflow: 'hidden',
    marginBottom: 0,
    // Soft colored glow instead of a flat black shadow — shadowColor is set
    // per-card to the accent color at the call site, giving each state a
    // faint tinted lift rather than a generic dark drop shadow.
    shadowOpacity: 0.10, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  accentBar:   { width: 4, borderRadius: 0 }, // kept for any lingering call sites; new cards use the inset glow line instead
  coinPill:    {
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 8,
    minWidth: 56,
  },
  coinPillSm:  {
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 8, paddingVertical: 5,
  },
  badge:       { borderRadius: 20, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 3 },
  badgeText:   { fontSize: TYPO.micro, fontWeight: '800', letterSpacing: 0.3 },
  questTitle:  { fontSize: TYPO.body, fontWeight: '800', lineHeight: 19, letterSpacing: -0.2 },
  metaRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingTop: 12, marginTop: 6 },
  metaAvatar:  { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  declineBox:  { flexDirection: 'row', gap: 6, alignItems: 'flex-start', borderRadius: 14, borderWidth: 1, padding: 10, marginTop: 8 },
  declineText: { fontSize: TYPO.label, fontWeight: '600', lineHeight: 18 },
  actionStrip: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8, borderTopWidth: 1, paddingTop: 10, marginTop: 8 },
  actionBtn:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 18 },
  actionBtnText: { fontSize: TYPO.label, fontWeight: '800', color: '#fff' },
  paidBadge:   { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 18, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  paidText:    { fontSize: TYPO.label, fontWeight: '700' },
  emptyBox:    { borderRadius: 20, borderWidth: 1, padding: 26, alignItems: 'center' },
  emptyText:   { fontSize: TYPO.caption, textAlign: 'center' },
  // ── Cheer card ──────────────────────────────────────────────────────────────
  catBadge:    { borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  catText:     { fontSize: TYPO.micro, fontWeight: '700' },
  coinAmt:     { fontSize: TYPO.label, fontWeight: '900', textAlign: 'right' },
  metaText:    { fontSize: TYPO.micro + 1 },
  metaVal:     { fontWeight: '700' },
});
