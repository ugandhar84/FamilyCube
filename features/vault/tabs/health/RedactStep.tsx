/**
 * RedactStep — the real drag-to-black-box redaction UI, ported verbatim
 * from ScanReviewSheet.tsx's own inline redact-mode block so kiosk's
 * KioskScanReviewForm.tsx can reuse the exact same real gesture/ViewShot
 * logic [live-reported: "we can use same core logic of the mobile just
 * the shell we should use for the kiosk style component"].
 *
 * Deliberately NOT wired back into ScanReviewSheet.tsx itself this time —
 * an earlier attempt did that (had ScanReviewSheet.tsx import and mount
 * this instead of its own inline copy) and it broke the real phone/kiosk
 * scan flow on device [live-reported: "i think you built a shit.. ive
 * uploaded it it started shoinw diffrent component"], so ScanReviewSheet.tsx
 * was reverted back to its original, fully self-contained, working state
 * and stays untouched. This file is purely a second, independent copy for
 * kiosk to use — accepted tradeoff: two copies of the same real logic
 * instead of one shared one, in exchange for zero risk to the already-
 * working phone file.
 *
 * All internal state (redactBoxesByImage, activeRedactIdx, currentBox, the
 * gesture ref plumbing) is fully self-contained here — only the inputs a
 * caller needs to supply are props: the scanner hook's own
 * pendingImages/maxPhotos/pickImage/clearPending/scan/scanError, plus
 * onScan (called with the final, possibly-redacted image list).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import ViewShot from 'react-native-view-shot';
import { AlertCircle, X } from 'lucide-react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import type { PendingImage } from '../../usePrescriptionScanner';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function RedactStep({
  pendingImages, maxPhotos, pickImage, clearPending, scanError,
  accent, onScan,
}: {
  pendingImages: PendingImage[];
  maxPhotos: number;
  pickImage: (source: 'camera' | 'library') => void;
  clearPending: () => void;
  scanError: string | null;
  accent: string;
  onScan: (finalImages: PendingImage[]) => void;
}) {
  const insets = useSafeAreaInsets();

  type RedactBox = { x: number; y: number; w: number; h: number };
  const [redactBoxesByImage, setRedactBoxesByImage] = useState<RedactBox[][]>([]);
  const [activeRedactIdx, setActiveRedactIdx] = useState(0);
  const [currentBox, setCurrentBox] = useState<RedactBox | null>(null);
  const currentBoxRef = useRef<RedactBox | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const viewShotRef = useRef<ViewShot>(null);

  const activeBoxes = redactBoxesByImage[activeRedactIdx] ?? [];
  const activeRedactIdxRef = useRef(activeRedactIdx);
  useEffect(() => { activeRedactIdxRef.current = activeRedactIdx; }, [activeRedactIdx]);

  // Stable gesture — never recreated so RNGH doesn't leave stale native
  // state. Verbatim from ScanReviewSheet.tsx's own redactGesture.
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
          setRedactBoxesByImage(prev => {
            const idx = activeRedactIdxRef.current;
            const copy = [...prev];
            copy[idx] = [...(copy[idx] ?? []), box];
            return copy;
          });
        }
        currentBoxRef.current = null;
        dragStart.current = null;
        setCurrentBox(null);
      }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  []);

  // Reset redact boxes when image count changes (new image added) —
  // verbatim from ScanReviewSheet.tsx.
  useEffect(() => {
    setRedactBoxesByImage(prev => {
      if (pendingImages.length === prev.length) return prev;
      const copy = pendingImages.map((_, i) => prev[i] ?? []);
      return copy;
    });
    if (pendingImages.length > 0) setActiveRedactIdx(pendingImages.length - 1);
  }, [pendingImages.length]);

  if (pendingImages.length === 0) return null;
  const img = pendingImages[activeRedactIdx];

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
        {scanError && (
          <View style={{ backgroundColor: '#dc262622', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#dc262655', gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
              <AlertCircle size={16} color="#dc2626" style={{ marginTop: 1 }} />
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
                style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: '#dc262633', borderWidth: 1, borderColor: '#dc262666' }}
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
                onScan(finalImages);
              } catch {
                onScan(pendingImages);
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
}
