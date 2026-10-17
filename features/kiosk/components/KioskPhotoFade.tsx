/**
 * KioskPhotoFade — a slow crossfading slideshow of the family's memory photos,
 * used behind the idle (ambient) clock and as a card on the lock screen. Photos
 * come from useKioskPhotos (newest memories, stills only) and are shown in a
 * shuffled order. With no photos it renders nothing, so callers fall back to
 * their plain background.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, View, Text, type StyleProp, type ViewStyle } from 'react-native';
import { useKioskPhotos } from '../useKioskPhotos';

export function KioskPhotoFade({ intervalMs = 150_000, active = true, style, caption = false, fit = 'cover' }: {
  intervalMs?: number; active?: boolean; style?: StyleProp<ViewStyle>; caption?: boolean; fit?: 'cover' | 'contain';
}) {
  const { photos } = useKioskPhotos();
  const order = useMemo(() => {
    const a = [...photos];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }, [photos]);
  const [idx, setIdx] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!active || order.length < 2) return;
    const t = setInterval(() => {
      setIdx(cur => {
        setPrev(cur);
        fade.setValue(0);
        Animated.timing(fade, { toValue: 1, duration: 1600, useNativeDriver: true }).start(() => setPrev(null));
        return (cur + 1) % order.length;
      });
    }, intervalMs);
    return () => clearInterval(t);
  }, [active, order.length, intervalMs, fade]);

  if (order.length === 0) return null;
  const cur = order[idx % order.length];
  const old = prev != null ? order[prev % order.length] : null;
  return (
    <View style={[s.root, style]} pointerEvents="none">
      {old && <Image source={{ uri: old.url }} style={StyleSheet.absoluteFill} resizeMode={fit} />}
      <Animated.Image source={{ uri: cur.url }} style={[StyleSheet.absoluteFill, { opacity: fade }]} resizeMode={fit} />
      {caption && !!cur.title && (
        <View style={s.cap}><Text style={s.capT} numberOfLines={1}>{cur.title}</Text></View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { overflow: 'hidden', backgroundColor: '#0A0910' },
  cap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: 'rgba(10,8,7,0.55)' },
  capT: { color: '#F7F2EE', fontSize: 14, fontWeight: '700' },
});
