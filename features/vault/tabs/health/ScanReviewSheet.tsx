import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  TextInput, Modal, ScrollView, KeyboardAvoidingView, Platform, Alert, Animated, Easing,
  Image,
} from 'react-native';
import ViewShot from 'react-native-view-shot';
import { AlertCircle, X, Syringe, ScanLine } from 'lucide-react-native';
import Svg, { Path, Circle, Rect, Polyline } from 'react-native-svg';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { usePrescriptionScanner, ParsedMedication, ParsedVaccine } from '../../usePrescriptionScanner';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardAwareMaxHeight } from '@/lib/useKeyboardAwareMaxHeight';
import { ScanDateField } from './ScanDateField';

export interface ScanReviewSheetHandle {
  open: (mode: 'rx' | 'vaccine') => void;
}

export default function ScanReviewSheet({
  visible, scanMode, activeMemberId, members, colors, isDark,
  onClose, onSaveMed, onSaveVax, onScanningChange,
}: {
  visible: boolean;
  scanMode: 'rx' | 'vaccine';
  activeMemberId: string;
  members: any[];
  colors: any;
  isDark: boolean;
  onClose: () => void;
  onSaveMed: (med: ParsedMedication, memberId: string) => Promise<void>;
  onSaveVax: (vax: ParsedVaccine, memberId: string) => Promise<void>;
  onScanningChange?: (scanning: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  const keyboardAwareMaxHeight = useKeyboardAwareMaxHeight(92);

  // Prescription scanner
  const {
    scanning, scanResult, scanError,
    pendingImages, maxPhotos,
    pickImage, scan, pickAndScan,
    removeImage, clearPending, clearScan, setScanResult,
  } = usePrescriptionScanner();

  // Report scanning state up so the parent's AI banner can show its spinner
  useEffect(() => { onScanningChange?.(scanning); }, [scanning]);
  // One entry per medication/vaccine the scan found — was a single object
  // each, only ever the first item on a multi-item document (live-
  // requested: "app is trying to add only one vaccine at a time"). `skip`
  // lets the user exclude one entry (e.g. a duplicate, or one they'd
  // rather add manually) from "Save All" without discarding the whole scan.
  const [reviewMeds, setReviewMeds] = useState<(ParsedMedication & { skip?: boolean })[]>([]);
  const [reviewVaxes, setReviewVaxes] = useState<(ParsedVaccine & { skip?: boolean })[]>([]);
  const [reviewDocType, setReviewDocType] = useState<'medication' | 'vaccine'>('medication');
  const [reviewMemberId, setReviewMemberId] = useState('');
  const [rxSaving, setRxSaving] = useState(false);
  // Per-item save outcome, keyed by array index — surfaces which specific
  // item failed instead of one generic alert covering the whole batch, so
  // a mid-batch failure (item 2 of 5) doesn't leave the user guessing
  // which of the 5 actually made it into their health records.
  const [saveErrors, setSaveErrors] = useState<Record<number, string>>({});

  const [scanPage, setScanPage] = useState<1 | 2>(1);

  // Redact step — draw black boxes over sensitive text before sending to AI
  type RedactBox = { x: number; y: number; w: number; h: number };
  // per-image boxes: redactBoxesByImage[i] = boxes for pendingImages[i]
  const [redactBoxesByImage, setRedactBoxesByImage] = useState<RedactBox[][]>([]);
  const [activeRedactIdx, setActiveRedactIdx]       = useState(0);
  const [currentBox, setCurrentBox]                 = useState<RedactBox | null>(null);
  const currentBoxRef                               = useRef<RedactBox | null>(null);
  const dragStart                                   = useRef<{ x: number; y: number } | null>(null);
  const viewShotRef                                 = useRef<ViewShot>(null);

  // boxes for the currently-viewed image
  const activeBoxes = redactBoxesByImage[activeRedactIdx] ?? [];
  // Keep a ref so the stable gesture closure always reads the current index
  const activeRedactIdxRef = useRef(activeRedactIdx);
  useEffect(() => { activeRedactIdxRef.current = activeRedactIdx; }, [activeRedactIdx]);

  // Stable gesture — never recreated so RNGH doesn't leave stale native state
  const redactGesture = useMemo(() =>
    Gesture.Pan()
      .runOnJS(true)
      .minDistance(0)
      .onBegin((e) => {
        dragStart.current = { x: e.x, y: e.y };
        const box: RedactBox = { x: e.x, y: e.y, w: 0, h: 0 };
        currentBoxRef.current = box;
        setCurrentBox(box);
      })
      .onUpdate((e) => {
        if (!dragStart.current) return;
        const dx = e.x - dragStart.current.x;
        const dy = e.y - dragStart.current.y;
        const box: RedactBox = {
          x: dx < 0 ? e.x : dragStart.current.x,
          y: dy < 0 ? e.y : dragStart.current.y,
          w: Math.abs(dx),
          h: Math.abs(dy),
        };
        currentBoxRef.current = box;
        setCurrentBox(box);
      })
      .onEnd(() => {
        const box = currentBoxRef.current;
        if (box && box.w > 8 && box.h > 8) {
          // Read index from ref — avoids stale closure without recreating the gesture
          setRedactBoxesByImage(prev => {
            const idx  = activeRedactIdxRef.current;
            const copy = [...prev];
            copy[idx]  = [...(copy[idx] ?? []), box];
            return copy;
          });
        }
        currentBoxRef.current = null;
        dragStart.current     = null;
        setCurrentBox(null);
      }),
  // empty deps — gesture is created once and never replaced
  // eslint-disable-next-line react-hooks/exhaustive-deps
  []);

  // Animation refs
  const scanBeamY  = useRef(new Animated.Value(0)).current;   // scanning beam
  const pulseScale = useRef(new Animated.Value(1)).current;    // pulsing circle
  const spinAnim   = useRef(new Animated.Value(0)).current;    // spinning ring
  const dotOpacity = [
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.3)).current,
  ];

  // Start scanning beam animation
  const startBeam = useCallback(() => {
    scanBeamY.setValue(0);
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanBeamY, { toValue: 1, duration: 1600, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(scanBeamY, { toValue: 0, duration: 1600, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    ).start();
  }, [scanBeamY]);

  // Start pulse + spin + dots when AI is processing
  const startProcessing = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseScale, { toValue: 1.15, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseScale, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 1800, useNativeDriver: true, easing: Easing.linear })
    ).start();
    dotOpacity.forEach((dot, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 200),
          Animated.timing(dot, { toValue: 1,   duration: 400, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 400, useNativeDriver: true }),
          Animated.delay((dotOpacity.length - i - 1) * 200),
        ])
      ).start();
    });
  }, [pulseScale, spinAnim, dotOpacity]);

  const stopAnimations = useCallback(() => {
    scanBeamY.stopAnimation();
    pulseScale.stopAnimation();
    spinAnim.stopAnimation();
    dotOpacity.forEach(d => d.stopAnimation());
    pulseScale.setValue(1);
  }, []);

  useEffect(() => {
    if (scanning) { startBeam(); startProcessing(); }
    else           { stopAnimations(); }
  }, [scanning]);

  // Advance to page 2 when result arrives
  useEffect(() => {
    if (!scanResult) return;
    const dt = scanResult.doc_type === 'vaccine' ? 'vaccine' : 'medication';
    setReviewDocType(dt);
    setReviewMeds(scanResult.medications.map(m => ({ ...m })));
    setReviewVaxes(scanResult.vaccines.map(v => ({ ...v })));
    setSaveErrors({});
    setReviewMemberId(activeMemberId ?? '');
    setScanPage(2);
  }, [scanResult]);

  // Reset scan page whenever the sheet is (re)opened
  useEffect(() => {
    if (visible) setScanPage(1);
  }, [visible]);

  const closeScanSheet = () => {
    onClose();
    clearScan();
    setScanPage(1);
    setRedactBoxesByImage([]);
    setCurrentBox(null);
    setActiveRedactIdx(0);
    setReviewMeds([]);
    setReviewVaxes([]);
    setSaveErrors({});
  };

  // Reset redact boxes when image count changes (new image added)
  useEffect(() => {
    setRedactBoxesByImage(prev => {
      if (pendingImages.length === prev.length) return prev;
      // pad/trim to match new count
      const copy = pendingImages.map((_, i) => prev[i] ?? []);
      return copy;
    });
    if (pendingImages.length > 0) setActiveRedactIdx(pendingImages.length - 1);
  }, [pendingImages.length]);

  // Saves every non-skipped item for the active doc type, one at a time —
  // onSaveMed/onSaveVax are already single-item inserts (unchanged), so a
  // multi-item scan is just N real inserts instead of one, same as if the
  // user had manually added each one via AddMedModal/AddVaxModal. Keeps
  // going after a single item's failure rather than aborting the whole
  // batch, so e.g. items 1 and 3 of 3 still save even if item 2 fails —
  // the alternative (all-or-nothing) would force a re-scan and re-entry
  // of items that already saved successfully.
  const saveAllScanned = async () => {
    if (!reviewMemberId) return;
    setRxSaving(true);
    setSaveErrors({});
    const items = reviewDocType === 'medication' ? reviewMeds : reviewVaxes;
    const errors: Record<number, string> = {};
    let savedCount = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.skip) continue;
      try {
        if (reviewDocType === 'medication') await onSaveMed(item as ParsedMedication, reviewMemberId);
        else await onSaveVax(item as ParsedVaccine, reviewMemberId);
        savedCount++;
      } catch (e: any) {
        errors[i] = e.message ?? 'Could not save.';
      }
    }
    setRxSaving(false);
    if (Object.keys(errors).length > 0) {
      setSaveErrors(errors);
      // Some items may have saved fine even though others failed — closing
      // the sheet now would lose the failed ones' data with no way back,
      // so stay open showing which entries need attention instead.
      if (savedCount > 0) {
        Alert.alert('Partially saved', `${savedCount} of ${items.length} saved. Please retry or discard the ones marked below.`);
      }
      return false;
    }
    return true;
  };

  return (
    /* ── Scan Rx / Vaccine — 2-page bottom sheet (full-screen during redact) ── */
    /* NOTE on hardcoded hex below (redact screen + scan-source picker sheet):
        this is a deliberate camera/photo-review UI with its own fixed
        near-black/near-white neutral scale ('#000'/'#111'/'#1E1E2E'/'#333'/
        '#ddd'/'#fff' etc.), not the app's warm Kinfolk palette — matching a
        standard native photo-capture-review look rather than the surrounding
        card UI. None of these neutrals match a token in constants/colors.ts
        (closest would be textPrimary/card/border, but swapping in the
        warm-toned app palette here would visibly clash with the intentionally
        neutral-gray photo/redact chrome). Left as documented hardcoded
        swatches rather than guessing a wrong mapping. */
    <Modal visible={visible} animationType="slide" transparent onRequestClose={closeScanSheet}>
      {/* ── REDACT MODE: full-screen layout ── */}
      {pendingImages.length > 0 && !scanning && (() => {
        const img    = pendingImages[activeRedactIdx];
        const accent = scanMode === 'vaccine' ? colors.teal : colors.accent;
        return (
          <View style={{ flex: 1, backgroundColor: '#000' }}>
            {/* Header */}
            <View style={{ paddingTop: insets.top + 12, paddingBottom: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#111' }}>
              <TouchableOpacity onPress={clearPending} style={{ padding: 6 }}>
                <X size={22} color="#fff" />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '900', color: '#fff' }}>
                  {`Cover Sensitive Info${pendingImages.length > 1 ? `  ·  Page ${activeRedactIdx + 1}/${pendingImages.length}` : ''}`}
                </Text>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                  Drag to black out names, DOB or any detail
                </Text>
              </View>
              {activeBoxes.length > 0 && (
                <TouchableOpacity
                  onPress={() => setRedactBoxesByImage(prev => {
                      const idx = activeRedactIdxRef.current;
                      const copy = [...prev];
                      copy[idx] = (copy[idx] ?? []).slice(0, -1);
                      return copy;
                    })}
                  style={{ padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10 }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>{'↩ Undo'}</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Page thumbnails strip */}
            {pendingImages.length > 1 && (
              <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#111' }}>
                {pendingImages.map((im, idx) => (
                  <TouchableOpacity key={idx} onPress={() => setActiveRedactIdx(idx)}
                    style={{ width: 52, height: 52, borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: idx === activeRedactIdx ? accent : 'rgba(255,255,255,0.2)' }}>
                    <Image source={{ uri: `data:${im.mimeType};base64,${im.base64}` }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  </TouchableOpacity>
                ))}
                {pendingImages.length < maxPhotos && (
                  <TouchableOpacity onPress={() => pickImage('camera')}
                    style={{ width: 52, height: 52, borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 20, color: 'rgba(255,255,255,0.6)', lineHeight: 24 }}>+</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Image */}
            <ViewShot ref={viewShotRef} options={{ format: 'jpg', quality: 0.88 }} style={{ flex: 1 }}>
              <Image source={{ uri: `data:${img.mimeType};base64,${img.base64}` }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
              {activeBoxes.map((box, i) => (
                <View key={i} style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, backgroundColor: '#000' }} />
              ))}
              {currentBox && (
                <View style={{ position: 'absolute', left: currentBox.x, top: currentBox.y, width: currentBox.w, height: currentBox.h, backgroundColor: '#000', opacity: 0.7 }} />
              )}
              <GestureDetector gesture={redactGesture}>
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
              </GestureDetector>
            </ViewShot>

            {/* Bottom bar */}
            <View style={{ paddingTop: 12, paddingBottom: insets.bottom + 14, paddingHorizontal: 16, gap: 10, backgroundColor: '#111' }}>
              {/* ── Scan error banner ── */}
              {scanError && (
                <View style={{ backgroundColor: colors.danger + '22', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.danger + '55', gap: 10 }}>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                    <AlertCircle size={16} color={colors.danger} style={{ marginTop: 1 }} />
                    <Text style={{ fontSize: 13, color: '#ffb3b3', fontWeight: '700', flex: 1, lineHeight: 18 }}>{scanError}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => { clearPending(); }}
                      style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>Start Over</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => pickImage('camera')}
                      style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: colors.danger + '33', borderWidth: 1, borderColor: colors.danger + '66' }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#ffb3b3' }}>Replace photo</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {!scanError && pendingImages.length < maxPhotos && pendingImages.length === 1 && (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity onPress={() => pickImage('camera')}
                    style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.7)' }}>+ Add page (camera)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => pickImage('library')}
                    style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.7)' }}>+ Add page (library)</Text>
                  </TouchableOpacity>
                </View>
              )}
              {!scanError && (
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>
                  {activeBoxes.length === 0 ? 'Drag on image to cover sensitive text' : `${activeBoxes.length} area${activeBoxes.length > 1 ? 's' : ''} covered`}
                </Text>
              )}
              {!scanError && (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity onPress={clearPending}
                  style={{ flex: 1, paddingVertical: 14, borderRadius: 16, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>Discard</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 2, paddingVertical: 14, borderRadius: 16, alignItems: 'center', backgroundColor: accent }}
                  onPress={async () => {
                    const toBase64 = async (uri: string) => {
                      const r = await fetch(uri); const b = await r.arrayBuffer(); const u = new Uint8Array(b);
                      let s = ''; for (let i = 0; i < u.byteLength; i++) s += String.fromCharCode(u[i]); return btoa(s);
                    };
                    try {
                      const capturedUri = await viewShotRef.current?.capture?.();
                      const capturedB64 = capturedUri ? await toBase64(capturedUri) : null;
                      const finalImages = pendingImages.map((im, idx) =>
                        (idx === activeRedactIdx && capturedB64) ? { base64: capturedB64, mimeType: 'image/jpeg' } : im
                      );
                      await scan(finalImages);
                    } catch {
                      await scan(pendingImages);
                    }
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: '900', color: '#fff' }}>
                    {`Scan ${pendingImages.length > 1 ? `${pendingImages.length} Pages` : 'Now'} →`}
                  </Text>
                </TouchableOpacity>
              </View>
              )}
            </View>
          </View>
        );
      })()}

      {/* ── NORMAL MODE: bottom sheet ── */}
      {(pendingImages.length === 0 || scanning) && (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeScanSheet} />
          <View style={{
            backgroundColor: isDark ? '#13131F' : '#F8F8FC',
            borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden',
            maxHeight: keyboardAwareMaxHeight ?? '92%',
            paddingBottom: insets.bottom || 16,
          }}>
            {/* ── Progress bar (2 steps) ── */}
            <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 }}>
              {[1, 2].map(s => (
                <View key={s} style={{
                  flex: 1, height: 3, borderRadius: 2,
                  backgroundColor: scanPage >= s
                    ? (scanMode === 'vaccine' ? colors.teal : colors.accent)
                    : (isDark ? '#333' : '#E5E7EB'),
                }} />
              ))}
            </View>

            {/* ── Handle + header ── */}
            <View style={{ alignItems: 'center', paddingTop: 6 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: isDark ? '#444' : '#DDD' }} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {/* Back on page 2 only when not scanning */}
                {scanPage === 2 && !scanning && !rxSaving && (
                  <TouchableOpacity onPress={() => { setScanPage(1); clearScan(); }}
                    style={{ marginRight: 4, padding: 4 }}>
                    <Svg width={20} height={20} viewBox="0 0 24 24">
                      <Path d="M19 12H5M12 19l-7-7 7-7" stroke={isDark ? '#aaa' : '#555'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </Svg>
                  </TouchableOpacity>
                )}
                <View style={{
                  width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: scanMode === 'vaccine' ? colors.teal + '20' : colors.accent + '20',
                }}>
                  {scanMode === 'vaccine'
                    ? <Syringe size={16} color={colors.teal} />
                    : <ScanLine size={16} color={colors.accent} />}
                </View>
                <View>
                  <Text style={{ fontSize: 15, fontWeight: '900', color: isDark ? '#fff' : '#111' }}>
                    {scanMode === 'vaccine' ? 'Scan Vaccine Record' : 'Scan Prescription'}
                  </Text>
                  <Text style={{ fontSize: 11, color: isDark ? '#888' : '#999', marginTop: 1 }}>
                    Step {scanPage} of 2 · {scanPage === 1 ? 'Choose source' : 'Review & assign'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={closeScanSheet} style={{ padding: 4 }}>
                <X size={22} color={isDark ? '#aaa' : '#666'} />
              </TouchableOpacity>
            </View>

            {/* ══════════════════════════════════════════════════════════
                PAGE 1 — Source picker + animated scan area
            ══════════════════════════════════════════════════════════ */}
            {scanPage === 1 && (
              <View style={{ paddingHorizontal: 20, paddingBottom: 24, gap: 20 }}>
                {/* Animated scan preview box */}
                <View style={{
                  height: 160, borderRadius: 20, overflow: 'hidden',
                  backgroundColor: isDark ? '#0D1424' : '#F0F4FF',
                  borderWidth: 1.5, borderColor: scanMode === 'vaccine' ? colors.teal + '40' : colors.accent + '40',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {scanning ? (
                    <>
                      {/* Corner brackets */}
                      {[
                        { top: 10, left: 10, rotate: '0deg' },
                        { top: 10, right: 10, rotate: '90deg' },
                        { bottom: 10, right: 10, rotate: '180deg' },
                        { bottom: 10, left: 10, rotate: '270deg' },
                      ].map((pos, i) => (
                        <View key={i} style={{ position: 'absolute', ...pos as any, width: 24, height: 24 }}>
                          <Svg width={24} height={24} viewBox="0 0 24 24" style={{ transform: [{ rotate: pos.rotate }] }}>
                            <Path d="M2 8V2h6" stroke={scanMode === 'vaccine' ? colors.teal : colors.accent} strokeWidth={2.5} strokeLinecap="round" fill="none" />
                          </Svg>
                        </View>
                      ))}
                      {/* Scanning beam */}
                      <Animated.View style={{
                        position: 'absolute', left: 12, right: 12, height: 2, borderRadius: 1,
                        backgroundColor: scanMode === 'vaccine' ? colors.teal : colors.accent,
                        opacity: 0.85,
                        transform: [{
                          translateY: scanBeamY.interpolate({ inputRange: [0, 1], outputRange: [-68, 68] }),
                        }],
                      }} />
                      {/* Pulsing icon */}
                      <Animated.View style={{ transform: [{ scale: pulseScale }] }}>
                        <View style={{
                          width: 56, height: 56, borderRadius: 28,
                          backgroundColor: (scanMode === 'vaccine' ? colors.teal : colors.accent) + '25',
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          {scanMode === 'vaccine'
                            ? <Syringe size={24} color={colors.teal} />
                            : <ScanLine size={24} color={colors.accent} />}
                        </View>
                      </Animated.View>
                      {/* Dot loader */}
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 14 }}>
                        {dotOpacity.map((op, i) => (
                          <Animated.View key={i} style={{
                            width: 7, height: 7, borderRadius: 4,
                            backgroundColor: scanMode === 'vaccine' ? colors.teal : colors.accent,
                            opacity: op,
                          }} />
                        ))}
                      </View>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: isDark ? '#aaa' : '#666', marginTop: 10 }}>
                        AI is reading your document…
                      </Text>
                    </>
                  ) : (
                    <View style={{ alignItems: 'center', gap: 8 }}>
                      <Svg width={48} height={48} viewBox="0 0 24 24">
                        <Rect x={3} y={2} width={14} height={18} rx={2} stroke={scanMode === 'vaccine' ? colors.teal : colors.accent} strokeWidth={1.5} fill="none" />
                        <Path d="M7 7h6M7 10h6M7 13h4" stroke={scanMode === 'vaccine' ? colors.teal : colors.accent} strokeWidth={1.5} strokeLinecap="round" fill="none" />
                        <Path d="M17 8l4 4-4 4" stroke={isDark ? '#555' : '#ccc'} strokeWidth={1.5} strokeLinecap="round" fill="none" />
                      </Svg>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#666' : '#aaa' }}>
                        Choose how to add your document
                      </Text>
                    </View>
                  )}
                </View>

                {/* Error banner */}
                {scanError && (
                  <View style={{
                    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
                    backgroundColor: colors.danger + '12', borderRadius: 12, padding: 12,
                    borderWidth: 1, borderColor: colors.danger + '40',
                  }}>
                    <AlertCircle size={14} color={colors.danger} style={{ marginTop: 1 }} />
                    <Text style={{ fontSize: 12, color: colors.danger, flex: 1, fontWeight: '600' }}>{scanError}</Text>
                  </View>
                )}

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {/* Camera */}
                  <TouchableOpacity
                    disabled={scanning}
                    onPress={() => pickImage('camera')}
                    style={{
                      flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 18, borderRadius: 18,
                      backgroundColor: isDark ? '#1E1E2E' : '#fff',
                      borderWidth: 1.5, borderColor: isDark ? '#333' : '#E5E7EB',
                      gap: 10, opacity: scanning ? 0.5 : 1,
                      shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
                    }}>
                    <Svg width={36} height={36} viewBox="0 0 24 24">
                      <Path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke={scanMode === 'vaccine' ? colors.teal : colors.accent} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
                      <Circle cx={12} cy={13} r={4} stroke={scanMode === 'vaccine' ? colors.teal : colors.accent} strokeWidth={1.5} fill="none" />
                    </Svg>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: isDark ? '#ddd' : '#333' }}>Camera</Text>
                  </TouchableOpacity>

                  {/* Photo Library */}
                  <TouchableOpacity
                    disabled={scanning}
                    onPress={() => pickImage('library')}
                    style={{
                      flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 18, borderRadius: 18,
                      backgroundColor: isDark ? '#1E1E2E' : '#fff',
                      borderWidth: 1.5, borderColor: isDark ? '#333' : '#E5E7EB',
                      gap: 10, opacity: scanning ? 0.5 : 1,
                      shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
                    }}>
                    <Svg width={36} height={36} viewBox="0 0 24 24">
                      <Rect x={3} y={3} width={18} height={18} rx={2} stroke={scanMode === 'vaccine' ? colors.teal : colors.accent} strokeWidth={1.5} fill="none" />
                      <Circle cx={8.5} cy={8.5} r={1.5} fill={scanMode === 'vaccine' ? colors.teal : colors.accent} />
                      <Path d="M21 15l-5-5L5 21" stroke={scanMode === 'vaccine' ? colors.teal : colors.accent} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </Svg>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: isDark ? '#ddd' : '#333' }}>Photo Library</Text>
                  </TouchableOpacity>

                  {/* PDF */}
                  <TouchableOpacity
                    disabled={scanning}
                    onPress={() => pickAndScan('document')}
                    style={{
                      flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 18, borderRadius: 18,
                      backgroundColor: isDark ? '#1E1E2E' : '#fff',
                      borderWidth: 1.5, borderColor: isDark ? '#333' : '#E5E7EB',
                      gap: 10, opacity: scanning ? 0.5 : 1,
                      shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
                    }}>
                    <Svg width={36} height={36} viewBox="0 0 24 24">
                      <Path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke={scanMode === 'vaccine' ? colors.teal : colors.accent} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
                      <Polyline points="14 2 14 8 20 8" stroke={scanMode === 'vaccine' ? colors.teal : colors.accent} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
                      <Text style={{ fontSize: 7, fontWeight: '900', color: scanMode === 'vaccine' ? colors.teal : colors.accent }}>{/* PDF label below icon */}</Text>
                    </Svg>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: isDark ? '#ddd' : '#333' }}>PDF</Text>
                    <Text style={{ fontSize: 9, fontWeight: '600', color: isDark ? '#666' : '#aaa', marginTop: -6 }}>max 3 pages</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* ══════════════════════════════════════════════════════════
                PAGE 2 — Member assignment + review fields
            ══════════════════════════════════════════════════════════ */}
            {scanPage === 2 && (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: '80%' }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 16 }}>

                {/* ── Low-confidence warning — the AI left a field blank rather
                    than guess (e.g. an unclear dosage number). This is a real
                    health record, so a silently-wrong guess is worse than
                    asking the user to double-check the original document. ── */}
                {scanResult?.confidence === 'low' && (
                  <View style={{ backgroundColor: colors.danger + '12', borderRadius: 12, padding: 12,
                    borderWidth: 1, borderColor: colors.danger + '40',
                    flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                    <AlertCircle size={14} color={colors.danger} style={{ marginTop: 1 }} />
                    <Text style={{ fontSize: 12, color: colors.danger, flex: 1, fontWeight: '600' }}>
                      {scanResult.confidenceNote ?? 'Some details were hard to read clearly — please double-check the fields below against the original document before saving.'}
                    </Text>
                  </View>
                )}
                {scanResult?.additionalItemsFound && (
                  <View style={{ backgroundColor: colors.amber + '12', borderRadius: 12, padding: 12,
                    borderWidth: 1, borderColor: colors.amber + '40',
                    flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                    <AlertCircle size={14} color={colors.amber} style={{ marginTop: 1 }} />
                    <Text style={{ fontSize: 12, color: colors.amber, flex: 1, fontWeight: '600' }}>
                      {scanResult.additionalItemsNote ?? 'This document had more items than could be confidently read — some may be missing below.'}
                    </Text>
                  </View>
                )}

                {/* ── Who is this for? ── */}
                <View>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: isDark ? '#888' : '#888', letterSpacing: 0.5, marginBottom: 10 }}>
                    WHO IS THIS FOR?
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {members.map(m => {
                      const sel = reviewMemberId === m.id;
                      const accent = scanMode === 'vaccine' ? colors.teal : colors.accent;
                      return (
                        <TouchableOpacity key={m.id} onPress={() => setReviewMemberId(m.id)}
                          style={{
                            flexDirection: 'row', alignItems: 'center', gap: 8,
                            paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16,
                            backgroundColor: sel ? accent : (isDark ? '#1E1E2E' : '#F3F4F6'),
                            borderWidth: 2, borderColor: sel ? accent : 'transparent',
                          }}>
                          <View style={{
                            width: 28, height: 28, borderRadius: 14,
                            backgroundColor: sel ? 'rgba(255,255,255,0.25)' : (isDark ? '#333' : '#E5E7EB'),
                            alignItems: 'center', justifyContent: 'center',
                          }}>
                            <Text style={{ fontSize: 13, fontWeight: '900', color: sel ? '#fff' : (isDark ? '#ccc' : '#555') }}>
                              {m.name.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: sel ? '#fff' : (isDark ? '#ccc' : '#333') }}>
                            {m.name}
                          </Text>
                          {sel && (
                            <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' }}>
                              <Svg width={10} height={10} viewBox="0 0 24 24">
                                <Path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                              </Svg>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* ── Doc type toggle (if both) ── */}
                {scanResult?.doc_type === 'both' && (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {(['medication', 'vaccine'] as const).map(t => (
                      <TouchableOpacity key={t} onPress={() => setReviewDocType(t)}
                        style={{
                          flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: 'center',
                          backgroundColor: reviewDocType === t
                            ? (t === 'vaccine' ? colors.teal : colors.accent)
                            : (isDark ? '#1E1E2E' : '#F3F4F6'),
                        }}>
                        <Text style={{ fontWeight: '800', fontSize: 12, textTransform: 'uppercase',
                          color: reviewDocType === t ? '#fff' : (isDark ? '#888' : '#666') }}>
                          {t}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* ── Divider ── */}
                <View style={{ height: 1, backgroundColor: isDark ? '#222' : '#EBEBEB' }} />

                {/* ── Medication cards — one per extracted item, was a
                    single reviewMed object (only the FIRST medication on a
                    multi-item document, e.g. a discharge summary listing
                    several drugs) [live-requested: "app is trying to add
                    only one vaccine at a time" — same underlying schema
                    gap for medications]. Stacked, not tabbed, so every
                    item's fields stay visible while scrolling instead of
                    hiding behind a tab switch. ── */}
                {reviewDocType === 'medication' && reviewMeds.map((med, idx) => (
                  <View key={idx} style={{
                    borderRadius: 16, borderWidth: 1.5, padding: 14, gap: 12,
                    borderColor: med.skip ? (isDark ? '#333' : '#E5E7EB') : colors.accent + '40',
                    backgroundColor: isDark ? '#161622' : '#FAFAFF',
                    opacity: med.skip ? 0.55 : 1,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 12, fontWeight: '900', color: colors.accent }}>
                        MEDICATION {reviewMeds.length > 1 ? `${idx + 1} OF ${reviewMeds.length}` : ''}
                      </Text>
                      {reviewMeds.length > 1 && (
                        <TouchableOpacity
                          onPress={() => setReviewMeds(prev => prev.map((m, i) => i === idx ? { ...m, skip: !m.skip } : m))}
                          style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: isDark ? '#222' : '#EEE' }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: isDark ? '#aaa' : '#666' }}>
                            {med.skip ? 'Skipped — tap to include' : 'Skip this one'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    {saveErrors[idx] && (
                      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.danger }}>{saveErrors[idx]}</Text>
                    )}
                    {!med.skip && ([
                      ['Medication name *', 'name'],
                      ['Dosage', 'dosage'],
                      ['Frequency', 'frequency'],
                      ['Duration', 'duration'],
                      ['Instructions', 'instructions'],
                      ['Prescribing doctor', 'prescriber'],
                      ['Pharmacy', 'pharmacy'],
                      ['Notes', 'notes'],
                    ] as [string, keyof ParsedMedication][]).map(([label, field]) => (
                      field === 'prescribed_date' ? null : (
                      <View key={field}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: isDark ? '#666' : '#999', marginBottom: 4, letterSpacing: 0.4 }}>
                          {label.toUpperCase()}
                        </Text>
                        <TextInput
                          value={String(med[field] ?? '')}
                          onChangeText={v => setReviewMeds(prev => prev.map((m, i) => i === idx ? { ...m, [field]: v } : m))}
                          placeholder={`—`}
                          placeholderTextColor={isDark ? '#444' : '#ccc'}
                          style={{
                            borderWidth: 1.5,
                            borderColor: field === 'name' && !med.name
                              ? colors.danger + '80'
                              : (isDark ? '#2A2A3E' : '#E5E7EB'),
                            borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
                            color: isDark ? '#fff' : '#111',
                            backgroundColor: isDark ? '#1A1A2E' : '#fff',
                            fontSize: 14, fontWeight: '500',
                          }}
                        />
                      </View>
                      )
                    ))}
                    {!med.skip && (
                      <ScanDateField
                        label="Prescribed date" value={med.prescribed_date}
                        onChange={v => setReviewMeds(prev => prev.map((m, i) => i === idx ? { ...m, prescribed_date: v } : m))}
                        colors={colors} isDark={isDark} accent={colors.accent}
                      />
                    )}
                  </View>
                ))}

                {/* ── Vaccine cards — same stacked-per-item pattern as
                    medications above. ── */}
                {reviewDocType === 'vaccine' && reviewVaxes.map((vax, idx) => (
                  <View key={idx} style={{
                    borderRadius: 16, borderWidth: 1.5, padding: 14, gap: 12,
                    borderColor: vax.skip ? (isDark ? '#333' : '#E5E7EB') : colors.teal + '40',
                    backgroundColor: isDark ? '#0F1F1A' : '#F5FBF9',
                    opacity: vax.skip ? 0.55 : 1,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 12, fontWeight: '900', color: colors.teal }}>
                        VACCINE {reviewVaxes.length > 1 ? `${idx + 1} OF ${reviewVaxes.length}` : ''}
                      </Text>
                      {reviewVaxes.length > 1 && (
                        <TouchableOpacity
                          onPress={() => setReviewVaxes(prev => prev.map((v, i) => i === idx ? { ...v, skip: !v.skip } : v))}
                          style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: isDark ? '#222' : '#EEE' }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: isDark ? '#aaa' : '#666' }}>
                            {vax.skip ? 'Skipped — tap to include' : 'Skip this one'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    {saveErrors[idx] && (
                      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.danger }}>{saveErrors[idx]}</Text>
                    )}
                    {!vax.skip && ([
                      ['Vaccine name *', 'vaccine_name'],
                      ['Manufacturer', 'manufacturer'],
                      ['Lot number', 'lot_number'],
                      ['Dose #', 'dose_number'],
                      ['Total doses', 'total_doses'],
                      ['Administered by', 'administered_by'],
                      ['Site (e.g. Left arm)', 'site'],
                    ] as [string, keyof ParsedVaccine][]).map(([label, field]) => (
                      <View key={field}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: isDark ? '#666' : '#999', marginBottom: 4, letterSpacing: 0.4 }}>
                          {label.toUpperCase()}
                        </Text>
                        <TextInput
                          value={vax[field] != null ? String(vax[field]) : ''}
                          onChangeText={v => setReviewVaxes(prev => prev.map((vv, i) => i === idx ? { ...vv, [field]: (v || null) as any } : vv))}
                          placeholder="—"
                          placeholderTextColor={isDark ? '#444' : '#ccc'}
                          keyboardType={['dose_number', 'total_doses'].includes(field as string) ? 'numeric' : 'default'}
                          style={{
                            borderWidth: 1.5,
                            borderColor: field === 'vaccine_name' && !vax.vaccine_name
                              ? colors.danger + '80'
                              : (isDark ? '#2A2A3E' : '#E5E7EB'),
                            borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
                            color: isDark ? '#fff' : '#111',
                            backgroundColor: isDark ? '#1A1A2E' : '#fff',
                            fontSize: 14, fontWeight: '500',
                          }}
                        />
                      </View>
                    ))}
                    {!vax.skip && (
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <View style={{ flex: 1 }}>
                          <ScanDateField
                            label="Date administered" value={vax.administered_date}
                            onChange={v => setReviewVaxes(prev => prev.map((vv, i) => i === idx ? { ...vv, administered_date: v } : vv))}
                            colors={colors} isDark={isDark} accent={colors.teal}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <ScanDateField
                            label="Next due date" value={vax.next_due_date}
                            onChange={v => setReviewVaxes(prev => prev.map((vv, i) => i === idx ? { ...vv, next_due_date: v } : vv))}
                            colors={colors} isDark={isDark} accent={colors.amber}
                          />
                        </View>
                      </View>
                    )}
                  </View>
                ))}

                {/* ── Save / Discard ── */}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                  <TouchableOpacity onPress={closeScanSheet}
                    style={{
                      flex: 1, paddingVertical: 15, borderRadius: 16, alignItems: 'center',
                      backgroundColor: isDark ? '#1E1E2E' : '#F3F4F6',
                      borderWidth: 1, borderColor: isDark ? '#333' : '#E5E7EB',
                    }}>
                    <Text style={{ fontWeight: '800', fontSize: 14, color: isDark ? '#aaa' : '#666' }}>Discard</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={rxSaving || !reviewMemberId}
                    onPress={async () => {
                      const ok = await saveAllScanned();
                      if (ok) closeScanSheet();
                    }}
                    style={{
                      flex: 2, paddingVertical: 15, borderRadius: 16, alignItems: 'center',
                      backgroundColor: !reviewMemberId || rxSaving
                        ? (isDark ? '#333' : '#E5E7EB')
                        : (reviewDocType === 'vaccine' ? colors.teal : colors.accent),
                    }}>
                    {rxSaving
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={{
                          fontWeight: '900', fontSize: 14,
                          color: !reviewMemberId ? (isDark ? '#666' : '#aaa') : '#fff',
                        }}>
                          {(() => {
                            const items = reviewDocType === 'vaccine' ? reviewVaxes : reviewMeds;
                            const count = items.filter(i => !i.skip).length;
                            const kind = reviewDocType === 'vaccine' ? 'Vaccine' : 'Medication';
                            return count > 1 ? `Save All ${kind}s (${count})` : `Save ${kind}`;
                          })()}
                        </Text>}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
      )}

    </Modal>
  );
}
