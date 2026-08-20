import { StyleSheet } from 'react-native';

export const em = StyleSheet.create({
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6, marginTop: 4, color: '#94A3B8' },
});

export const dc = StyleSheet.create({
  row:    { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 10, marginTop: 6 },
  iconBtn:{ borderRadius: 8, borderWidth: 1, borderColor: 'transparent', padding: 6 },
});

export const rm = StyleSheet.create({
  modal:  { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  fab:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 20, paddingVertical: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  fabTxt: { fontSize: 14, fontWeight: '900', color: '#fff' },
});
