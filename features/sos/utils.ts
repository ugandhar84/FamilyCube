/**
 * features/sos/utils — pure helpers and custom hooks for the SOS screen.
 *
 * Kept separate so the screen file stays focused on orchestration and
 * the makeStyles function can be tested or reused without importing React.
 */

import { useRef, useEffect } from 'react';
import { Animated, StyleSheet } from 'react-native';

// ─── Pulse hook ───────────────────────────────────────────────────────────────

/**
 * usePulse — returns an Animated.Value that pulses between 1.0 and 1.04
 * while `active` is true; snaps back to 1.0 when false.
 *
 * Used on the SOS button so it breathes gently when no alert is active,
 * drawing attention without being alarming.
 *
 * @param active  whether the pulse animation should be running
 */
export function usePulse(active: boolean): Animated.Value {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) { anim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1.04, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active]);
  return anim;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

/**
 * makeStyles — returns a StyleSheet keyed to the current theme.
 *
 * Called inside a useMemo in SosScreen so it only recomputes when the
 * theme colours actually change.
 *
 * @param colors   flat colour map from useTheme()
 * @param isDark   true when the device is in dark mode
 */
export function makeStyles(colors: any, isDark: boolean) {
  return StyleSheet.create({
    safe:   { flex: 1, backgroundColor: colors.background },
    scroll: { paddingBottom: 40 },

    // ── Header (matches Health / Memories) ──
    header:    { flexDirection: 'row', alignItems: 'center', gap: 12,
                 paddingHorizontal: 20, paddingVertical: 14 },
    title:     { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
    sub:       { fontSize: 14, marginTop: 1 },
    headerBtn: { width: 38, height: 38, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
                 alignItems: 'center', justifyContent: 'center' },

    // ── Hero card (matches Health hero pattern) ──
    heroWrap:  { marginHorizontal: 16, marginBottom: 6 },
    hero:      { borderRadius: 24, padding: 18, overflow: 'hidden',
                 shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
    heroBlob:  { position: 'absolute', width: 160, height: 160, borderRadius: 80,
                 backgroundColor: 'rgba(255,255,255,0.08)', top: -40, right: -40 },

    heroPetRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    heroAvatar:    { width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)',
                     alignItems: 'center', justifyContent: 'center' },
    heroName:      { fontSize: 18, fontWeight: '800', color: '#fff' },
    heroSub:       { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
    passportBtn:   { flexDirection: 'row', alignItems: 'center', gap: 4,
                     backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 5,
                     borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
    passportBtnTxt:{ fontSize: 14, fontWeight: '600', color: '#fff' },

    heroTiles:     { flexDirection: 'row', gap: 8 },
    heroTile:      { flex: 1, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 14, padding: 12,
                     borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center' },
    heroTileMid:   {},
    heroTileNum:   { fontSize: 20, fontWeight: '800', color: '#fff' },
    heroTileLabel: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.7)', marginTop: 2, letterSpacing: 0.5 },

    alertBanner:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12,
                      backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
    alertBannerTxt: { fontSize: 14, fontWeight: '600', color: '#fff' },

    // ── SOS button ──
    section:    { marginHorizontal: 16, marginTop: 12 },
    sosBtn:     { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 18, padding: 18,
                  shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
    sosBtnEmoji: { fontSize: 30 },
    sosBtnLabel: { fontSize: 17, fontWeight: '800', color: '#fff' },
    sosBtnSub:   { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 2 },

    // ── Quick actions ──
    quickRow:  { flexDirection: 'row', gap: 8 },
    quickBtn:  { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 16,
                 borderWidth: StyleSheet.hairlineWidth,
                 shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
    quickLabel:{ fontSize: 14, fontWeight: '600', marginTop: 5 },

    // ── Shared section ──
    sectionRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
    card:         { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden',
                    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
    emptyCard:    { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 24, alignItems: 'center', marginBottom: 2 },

    // ── Shared row ──
    row:      { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
    rowIcon:  { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    rowTitle: { fontSize: 14, fontWeight: '600' },
    rowSub:   { fontSize: 14, marginTop: 2 },

    callChip:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
    callChipTxt: { fontSize: 14, fontWeight: '700' },
    iconBtn:     { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    badge24:     { backgroundColor: isDark ? '#3D1515' : '#FEE2E2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    badge24Txt:  { fontSize: 14, fontWeight: '700', color: '#EF4444' },

    rewardBadge: { alignItems: 'center', backgroundColor: isDark ? '#3D2000' : '#FFF7ED', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5, marginRight: 4 },
    rewardAmt:   { fontSize: 14, fontWeight: '800', color: '#D97706' },
    rewardLbl:   { fontSize: 14, fontWeight: '500', color: '#D97706' },

    // ── Modal ──
    sheetSub:        { fontSize: 14, lineHeight: 19, marginBottom: 12 },
    locationChip:    { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12 },
    locationChipTxt: { fontSize: 14, fontWeight: '600', flex: 1 },
    inputLabel:  { fontSize: 14, fontWeight: '500', marginBottom: 6, marginTop: 12 },
    input:       { borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14 },
    textarea:    { height: 88, paddingTop: 12 },
    sheetBtns:   { flexDirection: 'row', gap: 10, marginTop: 16 },
    cancelBtn:   { flex: 1, height: 50, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    cancelTxt:   { fontSize: 14 },
    alertBtn:    { flex: 2, height: 50, backgroundColor: '#E74C3C', borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                   shadowColor: '#E74C3C', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
    alertBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },

    // ── Finder search dropdown ──
    finderDropdown:   { borderWidth: 1, borderRadius: 12, marginTop: 6, overflow: 'hidden', maxHeight: 180 },
    finderDropdownUp: {
      position: 'absolute', left: 0, right: 0, bottom: '100%', marginTop: 0, marginBottom: 6,
      shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: -3 }, elevation: 12,
    },
    finderRow:          { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
    finderRowText:      { fontSize: 14, flex: 1 },
    finderAvatar:       { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    finderVerifiedBadge:{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
    finderVerifiedText: { fontSize: 14, fontWeight: '600', color: '#1D9E75' },

    // ── Radius selector ──
    radiusSelector:  { flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 12 },
    radiusButton:    { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    radiusButtonText:{ fontSize: 14, fontWeight: '600' },
  });
}
