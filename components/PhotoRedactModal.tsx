/**
 * PhotoRedactModal — shared "draw black boxes over sensitive info" step
 * before a photo is sent to an AI vision endpoint. Extracted from
 * ScanReviewSheet.tsx (features/vault/tabs/health/) where it was originally
 * built for the prescription scanner — medical record uploads had no
 * equivalent step at all even though the underlying analyze-medical-record
 * edge function sends the raw image to Gemini unredacted (only text
 * metadata is anonymized server-side, never the image content). This
 * component lets any photo-to-AI flow in the app reuse the same tool
 * instead of re-implementing box-drawing/flattening each time.
 */
import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, Modal, Image } from 'react-native';
import ViewShot from 'react-native-view-shot';
import { X } from 'lucide-react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface RedactableImage { base64: string; mimeType: string }
type RedactBox = { x: number; y: number; w: number; h: number };

export default function PhotoRedactModal({
  visible, images, accentColor, title, subtitle, onDiscard, onConfirm, confirmLabel,
}: {
  visible: boolean;
  images: RedactableImage[];
  accentColor: string;
  title?: string;
  subtitle?: string;
  onDiscard: () => void;
  /** Called with the SAME images array, but the active page swapped for its
   * flattened (redacted) version when a capture succeeds — falls back to
   * the original unredacted image for that page if capture fails, same
   * fallback behavior as the original ScanReviewSheet implementation. */
  onConfirm: (finalImages: RedactableImage[]) => void;
  confirmLabel?: string;
}) {
  const insets = useSafeAreaInsets();
  const [redactBoxesByImage, setRedactBoxesByImage] = useState<RedactBox[][]>([]);
  const [activeIdx, setActiveIdx]                   = useState(0);
  const [currentBox, setCurrentBox]                 = useState<RedactBox | null>(null);
  const currentBoxRef                               = useRef<RedactBox | null>(null);
  const dragStart                                   = useRef<{ x: number; y: number } | null>(null);
  const viewShotRef                                 = useRef<ViewShot>(null);
  const activeIdxRef = useRef(activeIdx);
  useEffect(() => { activeIdxRef.current = activeIdx; }, [activeIdx]);

  // Reset when the sheet closes, and clamp the active index whenever the
  // image count shrinks (e.g. caller removes a page while this is open).
  useEffect(() => {
    if (!visible) {
      setRedactBoxesByImage([]);
      setCurrentBox(null);
      setActiveIdx(0);
    }
  }, [visible]);
  useEffect(() => {
    setRedactBoxesByImage(prev => {
      if (images.length === prev.length) return prev;
      return images.map((_, i) => prev[i] ?? []);
    });
    if (activeIdx >= images.length && images.length > 0) setActiveIdx(images.length - 1);
  }, [images.length]);

  const activeBoxes = redactBoxesByImage[activeIdx] ?? [];

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
          setRedactBoxesByImage(prev => {
            const idx  = activeIdxRef.current;
            const copy = [...prev];
            copy[idx]  = [...(copy[idx] ?? []), box];
            return copy;
          });
        }
        currentBoxRef.current = null;
        dragStart.current     = null;
        setCurrentBox(null);
      }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  []);

  const toBase64 = async (uri: string) => {
    const r = await fetch(uri); const b = await r.arrayBuffer(); const u = new Uint8Array(b);
    let s = ''; for (let i = 0; i < u.byteLength; i++) s += String.fromCharCode(u[i]); return btoa(s);
  };

  const handleConfirm = useCallback(async () => {
    try {
      const capturedUri = await viewShotRef.current?.capture?.();
      const capturedB64 = capturedUri ? await toBase64(capturedUri) : null;
      const finalImages = images.map((im, idx) =>
        (idx === activeIdx && capturedB64) ? { base64: capturedB64, mimeType: 'image/jpeg' } : im
      );
      onConfirm(finalImages);
    } catch {
      onConfirm(images);
    }
  }, [images, activeIdx, onConfirm]);

  if (images.length === 0) return null;
  const img = images[activeIdx];

  return (
    /* Deliberate fixed near-black/near-white neutral chrome, matching a
       standard native photo-capture-review look — not the app's warm
       Kinfolk palette, same reasoning as the original ScanReviewSheet
       implementation this was extracted from. */
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onDiscard}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <View style={{ paddingTop: insets.top + 12, paddingBottom: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#111' }}>
          <TouchableOpacity onPress={onDiscard} style={{ padding: 6 }}>
            <X size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '900', color: '#fff' }}>
              {`${title ?? 'Cover Sensitive Info'}${images.length > 1 ? `  ·  Page ${activeIdx + 1}/${images.length}` : ''}`}
            </Text>
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
              {subtitle ?? 'Drag to black out names, DOB or any detail'}
            </Text>
          </View>
          {activeBoxes.length > 0 && (
            <TouchableOpacity
              onPress={() => setRedactBoxesByImage(prev => {
                const idx = activeIdxRef.current;
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

        {images.length > 1 && (
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#111' }}>
            {images.map((im, idx) => (
              <TouchableOpacity key={idx} onPress={() => setActiveIdx(idx)}
                style={{ width: 52, height: 52, borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: idx === activeIdx ? accentColor : 'rgba(255,255,255,0.2)' }}>
                <Image source={{ uri: `data:${im.mimeType};base64,${im.base64}` }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              </TouchableOpacity>
            ))}
          </View>
        )}

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

        <View style={{ paddingTop: 12, paddingBottom: insets.bottom + 14, paddingHorizontal: 16, gap: 10, backgroundColor: '#111' }}>
          <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>
            {activeBoxes.length === 0 ? 'Drag on image to cover sensitive text' : `${activeBoxes.length} area${activeBoxes.length > 1 ? 's' : ''} covered`}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity onPress={onDiscard}
              style={{ flex: 1, paddingVertical: 14, borderRadius: 16, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>Discard</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ flex: 2, paddingVertical: 14, borderRadius: 16, alignItems: 'center', backgroundColor: accentColor }}
              onPress={handleConfirm}
            >
              <Text style={{ fontSize: 15, fontWeight: '900', color: '#fff' }}>
                {confirmLabel ?? 'Continue →'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
