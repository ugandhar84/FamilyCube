import { StyleSheet } from 'react-native';
import { TYPO, RADIUS } from '@/constants/theme';

export const s = StyleSheet.create({
  root:          { flex: 1 },
  header:        { flexDirection: 'column', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle:   { fontSize: TYPO.heading, fontWeight: '700' },
  countBadge:    { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  countText:     { fontSize: 12, fontWeight: '700' },
  headerBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1.5, borderRadius: RADIUS.md ?? 10, paddingVertical: 6, paddingHorizontal: 10 },
  headerBtnText: { fontSize: 13, fontWeight: '600' },
  activeBanner:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1.5 },
  activeDot:     { width: 8, height: 8, borderRadius: 4 },
  activeBannerText: { fontSize: 13 },
  tabRow:        { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn:        { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabLabel:      { fontSize: 14, fontWeight: '600' },
  sectionHeader: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8, marginTop: 4 },
  empty:         { alignItems: 'center', paddingVertical: 60 },
  emptyEmoji:    { fontSize: 48, marginBottom: 12 },
  emptyTitle:    { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  emptyDesc:     { fontSize: 14, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
  fab:           { position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 },
});

export const sh = StyleSheet.create({
  sheet:    { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: StyleSheet.hairlineWidth, padding: 20, paddingBottom: 32 },
  handle:   { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  title:    { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  input:    { borderWidth: 1.5, borderRadius: RADIUS.md ?? 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12 },
  catChip:  { borderWidth: 1.5, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12 },
  btn:      { borderRadius: RADIUS.md ?? 10, paddingVertical: 14, alignItems: 'center' },
  btnText:  { fontSize: 16, fontWeight: '700' },
});

export const rc = StyleSheet.create({
  name:        { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  badge:       { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText:   { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  store:       { fontSize: 13, marginBottom: 2 },
  ago:         { fontSize: 11, marginTop: 4 },
});

export const rd = StyleSheet.create({
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusText:  { fontSize: 12, fontWeight: '600' },
  closeBtn:    { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  progressBar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill:{ height: '100%', borderRadius: 3 },
  tabRow:      { flexDirection: 'row', borderRadius: 10, overflow: 'hidden', borderWidth: 1, marginBottom: 4 },
  tabBtn:      { flex: 1, paddingVertical: 8, alignItems: 'center' },
  tabText:     { fontSize: 13, fontWeight: '600' },
  itemRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  checkbox:    { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  itemName:    { fontSize: 14, fontWeight: '500' },
  addBtn:      { borderWidth: 1.5, borderRadius: 16, paddingVertical: 4, paddingHorizontal: 10 },
});
