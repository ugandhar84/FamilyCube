import { StyleSheet } from 'react-native';

export const hero = StyleSheet.create({
  card:     { marginHorizontal: 16, marginTop: 14, borderRadius: 26, padding: 20, overflow: 'hidden',
              shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  blob:     { position: 'absolute', borderRadius: 999, backgroundColor: '#fff' },
  topRow:   { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarRing:{ position: 'relative', borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.5)', borderRadius: 26, padding: 2 },
  avatar:   { width: 84, height: 84, borderRadius: 20 },
  overlay:  { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.42)', borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  camBadge: { position: 'absolute', bottom: -2, right: -2, width: 24, height: 24, borderRadius: 12,
              backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
              borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)' },
  name:     { fontSize: 19, fontWeight: '800', color: '#fff' },
  email:    { fontSize: 16, fontWeight: '600', color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  since:    { fontSize: 14, color: 'rgba(255,255,255,0.5)', marginTop: 3, fontWeight: '500' },
  editBtn:  { width: 34, height: 34, alignItems: 'center', justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 17 },
  statsRow: { flexDirection: 'row', gap: 8 },
  statTile: { flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14, paddingVertical: 11, alignItems: 'center' },
  statVal:  { fontSize: 20, fontWeight: '800', color: '#fff' },
  statLbl:  { fontSize: 14, color: 'rgba(255,255,255,0.65)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 },
});

export const safety = StyleSheet.create({
  wrap:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, borderRadius: 18,
              borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 14,
              shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  iconWrap: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  title:    { fontSize: 14.5, fontWeight: '800' },
  sub:      { fontSize: 14, marginTop: 2 },
});

export const petCard = StyleSheet.create({
  wrap:          { width: 130, height: 162, borderRadius: 20, borderWidth: 1.5, overflow: 'hidden', alignItems: 'center',
                   shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  addWrap:       { padding: 14, gap: 4 },
  imageWrap:     { width: '100%', height: 90, alignItems: 'center', justifyContent: 'center' },
  image:         { width: '100%', height: '100%' },
  bigEmoji:      { fontSize: 44 },
  imageGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 36 },
  name:          { fontSize: 15, fontWeight: '700', textAlign: 'center', marginTop: 8, paddingHorizontal: 10 },
  breed:         { fontSize: 14, textAlign: 'center', paddingHorizontal: 8 },
  daysBadge:     { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 10, marginTop: 2 },
  daysText:      { fontSize: 14, fontWeight: '700' },
});

export const thm = StyleSheet.create({
  cell:     { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 14, borderWidth: 1.5, gap: 5, position: 'relative' },
  label:    { fontSize: 14 },
  check:    { position: 'absolute', top: 4, right: 4, width: 16, height: 16, borderRadius: 8,
              backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
});

export const mdl = StyleSheet.create({
  fieldLabel:{ fontSize: 14, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 7, marginTop: 12 },
  input:    { height: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: 15 },
  photoBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 52, paddingHorizontal: 18, borderRadius: 16, marginBottom: 10 },
  photoBtnText:{ fontSize: 15, fontWeight: '700', color: '#fff' },
  cancelBtn:{ height: 50, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  footer:   { flexDirection: 'row', gap: 10, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  secBtn:   { flex: 1, height: 50, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  primBtn:  { flex: 1, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
              shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
});
