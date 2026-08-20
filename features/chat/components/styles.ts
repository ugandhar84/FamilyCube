import { StyleSheet, Platform } from 'react-native';

export const s = StyleSheet.create({
  strip:      { borderRadius: 14, borderWidth: 1, padding: 4 },
  channelBtn: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 10 },
  iconBtn:    { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, height: 42, marginBottom: 6 },
  dayRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 10 },
  dayLine:    { flex: 1, height: StyleSheet.hairlineWidth },
  dayLabel:   { fontSize: 11, fontWeight: '600', paddingHorizontal: 8 },
  mentionBox: { position: 'absolute', bottom: 70, left: 12, right: 12, borderRadius: 14, borderWidth: 1, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, elevation: 50, zIndex: 100 },
  inputBar:   { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 10, paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 22 : 10, gap: 7, borderTopWidth: StyleSheet.hairlineWidth },
  inputBubble:{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', borderRadius: 20, borderWidth: 1,
    paddingHorizontal: 13, paddingVertical: 5 },
  // single line (minHeight ~36) → grows to 5 lines (~21px lineHeight × 5 = 105) then scrolls
  input:      { flex: 1, fontSize: 14.5, lineHeight: 21, minHeight: 36, maxHeight: 111,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4, textAlignVertical: 'top' },
  actionBtn:  { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end' },
  sendBtn:    { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end' },
  bareIconBtn:{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end' },
  attachMenu: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 8, paddingVertical: 12, borderTopWidth: 1 },
  attachItem: { alignItems: 'center', gap: 6, flex: 1 },
  attachIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  attachLabel:{ fontSize: 11, fontWeight: '700' },
});
