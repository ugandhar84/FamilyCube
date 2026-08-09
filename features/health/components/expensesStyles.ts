import { StyleSheet, Platform } from 'react-native';

export const s = StyleSheet.create({
  navBtn:        { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.2)', alignItems: 'center', justifyContent: 'center' },
  avatarCircle:  { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  heroChip:      { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center' },
  heroChipLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  heroChipVal:   { fontSize: 18, fontWeight: '800', color: '#fff', marginTop: 2 },
  insightCard:   { borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center', gap: 3, minWidth: 100 },
  sectionLabel:  { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 },
  card:          { borderRadius: 16, overflow: 'hidden' },
  fab:           { position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 8 },
  sheet:         { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 20, maxHeight: '92%' },
  fieldLabel:    { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input:         { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15 },
  petChip:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  cancelBtn:     { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  saveBtn:       { flex: 2, borderRadius: 14, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
});
