/**
 * KioskMemorySlideshow — the ambient photo surface for kiosk mode, used
 * both as the Memories tab's hero and (in its compact form) as the
 * Overview tab's "Kept" photo-frame widget.
 *
 * ── Why a slideshow rather than a grid ──────────────────────────────────
 * The Memories tab already carries a full scrolling feed (the real
 * MemoriesTab component, with hearts, captions and posting). That feed is
 * for someone standing at the device. This is for the other 99% of the
 * time: a countertop display glanced at from across the room, where a grid
 * of thumbnails resolves to nothing and one large photo resolves to a face.
 * So the two coexist — slideshow on top, feed below — rather than one
 * replacing the other.
 *
 * ── Real data only ──────────────────────────────────────────────────────
 * Every frame is a real `family_memories` row via useKioskPhotos. There is
 * deliberately no stock/placeholder image anywhere in this file: a photo
 * frame showing a stranger's stock family is worse than an empty one, and
 * an empty household gets a clean, quiet empty state that says how to add
 * the first photo instead.
 *
 * ── Motion, and when not to have any ────────────────────────────────────
 * Advancing is a cross-fade on the native driver, so it costs no JS frames
 * on a device that may be left running for weeks. Three things stop it:
 *   · a single photo (nothing to advance to),
 *   · the OS "Reduce Motion" setting, which is honored by swapping without
 *     a fade rather than by freezing the frame — the household still sees
 *     its photos rotate, just without the animation, and
 *   · the component unmounting, which clears the interval; a leaked
 *     interval on an always-on device runs forever.
 *
 * Auto-advance is NOT kiosk activity — it must never call registerActivity.
 * A frame quietly rotating on its own is precisely the idle state the lock
 * exists to detect, and reporting it as touch activity would mean a kiosk
 * showing photos never locks. Tapping a photo IS activity, and is reported.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, Image, Pressable, StyleSheet, Animated, AccessibilityInfo,
  type StyleProp, type ViewStyle,
} from 'react-native';
import { Images, ImageOff } from 'lucide-react-native';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import { useKioskColors } from '../kioskPalette';
import { WidgetCard, WidgetHeader, Chip, EmptyNote } from './KioskOS';
import { useKioskActivity } from '../KioskActivityContext';
import { useKioskPhotos, type KioskPhoto } from '../useKioskPhotos';

/** How long each photo holds before the next one fades in. */
const ADVANCE_MS = 12_000;
const FADE_MS = 900;

export function KioskMemorySlideshow({
  style, height = 320, compact = false,
}: {
  style?: StyleProp<ViewStyle>;
  /** Frame height. The Overview widget uses a shorter one. */
  height?: number;
  /** Overview's widget form: tighter chrome, no counter chip. */
  compact?: boolean;
}) {
  const { k, isDark } = useKioskColors();
  const { photos, loading } = useKioskPhotos();

  return (
    <WidgetCard k={k} isDark={isDark} style={style}>
      <WidgetHeader
        Icon={Images}
        eyebrow="Kept"
        title={compact ? 'Family photos' : 'Recently kept'}
        accent={k.purple}
        k={k}
        isDark={isDark}
        right={!compact && photos.length > 1
          ? <Chip label={`${photos.length} photos`} accent={k.purple} isDark={isDark} k={k} />
          : undefined}
      />
      {loading ? (
        <View style={[s.frame, s.center, { height, backgroundColor: k.well, borderColor: k.cardBorder }]} />
      ) : photos.length === 0 ? (
        <View
          style={[s.frame, s.center, { height, backgroundColor: k.well, borderColor: k.cardBorder, gap: KIOSK_SPACE.sm }]}
        >
          <ImageOff size={30} color={k.textFaint} />
          <EmptyNote
            text="No family photos yet. Add one from the Memories screen and it'll show up here."
            k={k}
            style={{ textAlign: 'center', maxWidth: 340 }}
          />
        </View>
      ) : (
        <Frame photos={photos} height={height} />
      )}
    </WidgetCard>
  );
}

/**
 * The cross-fading frame itself. Two stacked <Image>s — the outgoing one
 * held at full opacity underneath while the incoming one fades in over it,
 * so there is never a flash of empty ground between photos.
 */
function Frame({ photos, height }: { photos: KioskPhoto[]; height: number }) {
  const { k } = useKioskColors();
  const { registerActivity } = useKioskActivity();

  const [index, setIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState<number | null>(null);
  const fade = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => { if (alive) setReduceMotion(v); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { alive = false; sub.remove(); };
  }, []);

  // The photo list can shrink under us (a memory deleted on a phone, live
  // via the hook's realtime subscription). Clamp rather than render a hole.
  const safeIndex = index < photos.length ? index : 0;

  /**
   * Runs the cross-fade. Written against the functional setState form so
   * the interval below never closes over a stale index — an always-on
   * display would otherwise ping-pong between the first two photos forever.
   */
  const step = useCallback((pick: (cur: number) => number) => {
    setIndex(cur => {
      const next = pick(cur);
      if (next === cur) return cur;
      setPrevIndex(cur);
      if (reduceMotion) { fade.setValue(1); setPrevIndex(null); return next; }
      fade.setValue(0);
      Animated.timing(fade, {
        toValue: 1, duration: FADE_MS, useNativeDriver: true,
      }).start(({ finished }) => { if (finished) setPrevIndex(null); });
      return next;
    });
  }, [reduceMotion, fade]);

  useEffect(() => {
    if (photos.length < 2) return;
    const t = setInterval(() => step(cur => (cur + 1) % photos.length), ADVANCE_MS);
    return () => clearInterval(t);
  }, [photos.length, step]);

  const photo = photos[safeIndex];
  const prev = prevIndex !== null && prevIndex < photos.length ? photos[prevIndex] : null;

  return (
    <Pressable
      onPress={() => {
        registerActivity();
        if (photos.length > 1) step(cur => (cur + 1) % photos.length);
      }}
      style={[s.frame, { height, backgroundColor: k.well, borderColor: k.cardBorder }]}
      accessibilityRole="image"
      accessibilityLabel={
        `${photo.title}${photo.date ? `, ${photo.date}` : ''}. Photo ${safeIndex + 1} of ${photos.length}.`
      }
      accessibilityHint={photos.length > 1 ? 'Tap to see the next photo' : undefined}
    >
      {prev && (
        <Image source={{ uri: prev.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      )}
      <Animated.Image
        source={{ uri: photo.url }}
        style={[StyleSheet.absoluteFill, { opacity: fade }]}
        resizeMode="cover"
      />

      {/* Caption plate. A translucent dark plate rather than a palette
          token in either mode: it sits on an arbitrary photograph, so its
          contrast has to come from the plate itself, not from the theme. */}
      <View style={s.caption} pointerEvents="none">
        <Text style={s.captionTitle} numberOfLines={1}>{photo.title}</Text>
        {!!photo.date && (
          <Text style={s.captionDate} numberOfLines={1}>{photo.date}</Text>
        )}
      </View>

      {photos.length > 1 && (
        <View style={s.dots} pointerEvents="none">
          {/* Cap the dot row — 24 rows of photos can be 40+ slides, and a
              dot per slide becomes a grey smear rather than a position. */}
          {photos.slice(0, 12).map((p, i) => (
            <View
              key={p.key}
              style={[s.dot, { opacity: i === safeIndex % 12 ? 1 : 0.35 }]}
            />
          ))}
        </View>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  frame: {
    borderRadius: KIOSK_RADIUS.lg,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  center: { alignItems: 'center', justifyContent: 'center' },
  caption: {
    paddingHorizontal: KIOSK_SPACE.md,
    paddingVertical: KIOSK_SPACE.sm,
    backgroundColor: 'rgba(10,8,7,0.62)',
  },
  captionTitle: { fontSize: KIOSK_TYPO.subheading, fontWeight: '800', color: '#F7F2EE' },
  captionDate: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', color: '#D8CCC4', marginTop: 1 },
  dots: {
    position: 'absolute', top: KIOSK_SPACE.sm, right: KIOSK_SPACE.sm,
    flexDirection: 'row', gap: 5,
    backgroundColor: 'rgba(10,8,7,0.45)',
    paddingHorizontal: KIOSK_SPACE.xs, paddingVertical: 5,
    borderRadius: KIOSK_RADIUS.full,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#F7F2EE' },
});
