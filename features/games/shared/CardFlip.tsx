/**
 * CardFlip — reusable 3D flip-card wrapper (Memory + Uno both use it).
 * Renders `back` while face-down, `front` while face-up, with a
 * Reanimated rotateY spring between them.
 *
 * Implementation notes (these are load-bearing — an earlier version of
 * this file rendered BOTH faces invisible at rest):
 *
 *  1. We do NOT use `backfaceVisibility: 'hidden'` to hide the away-facing
 *     side. At rest the faces sit at exactly 0/180/360deg, which is the
 *     precise boundary CoreAnimation uses to decide "facing away" — the
 *     back face at rotation=0 renders as rotateY:360deg and iOS culls it,
 *     while the front face is simultaneously hidden by opacity. Result:
 *     a completely blank card. Opacity alone is sufficient and is
 *     deterministic on both platforms.
 *
 *  2. The opacity crossfade CLAMPS. `interpolate` defaults to
 *     Extrapolation.EXTEND, so a [89,90] -> [0,1] mapping evaluated at
 *     rotation=0 yields -89, and the spring's overshoot past 180 pushes it
 *     further still. We rely on explicit clamping rather than on the
 *     renderer silently saturating out-of-range opacity.
 *
 *  3. The swap window is centred on 90deg with a small band rather than a
 *     1-degree knife-edge, so a spring that settles a hair off its target
 *     can never land mid-window with both faces dimmed.
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, interpolate, Extrapolation,
} from 'react-native-reanimated';

// Degrees either side of 90 over which the two faces cross-fade. Wide
// enough that no settling value lands with both faces near zero, narrow
// enough that the swap still reads as "the card turned over".
const SWAP_BAND = 6;

export function CardFlip({
  faceUp, front, back, size, style,
}: {
  faceUp: boolean; front: React.ReactNode; back: React.ReactNode; size: number; style?: any;
}) {
  const rotation = useSharedValue(faceUp ? 180 : 0);
  useEffect(() => {
    rotation.value = withSpring(faceUp ? 180 : 0, { damping: 14, stiffness: 140 });
  }, [faceUp]);

  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1000 }, { rotateY: `${rotation.value}deg` }],
    opacity: interpolate(
      rotation.value,
      [90 - SWAP_BAND, 90 + SWAP_BAND],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));
  // rotation + 180 is what makes the back appear to swing in from behind
  // the front as they cross-fade. rotateY(180deg) and rotateY(-180deg)
  // land on the identical final orientation (they're the same rotation
  // matrix), so there's no sign trick that avoids this: ANY rotateY that
  // reaches the "facing forward" side after a half-turn necessarily
  // mirrors whatever was drawn assuming a 0deg orientation. The fix is on
  // the CONTENT, not the transform — scaleX(-1) on the back's own content
  // pre-mirrors it so the 180deg rotation's mirroring cancels out and it
  // reads correctly once facing the viewer.
  const backStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1000 }, { rotateY: `${rotation.value + 180}deg` }],
    opacity: interpolate(
      rotation.value,
      [90 - SWAP_BAND, 90 + SWAP_BAND],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <Animated.View style={[{ width: size, height: size }, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, cardFace, backStyle]}>
        <View style={mirrorCorrection}>{back}</View>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, cardFace, frontStyle]}>{front}</Animated.View>
    </Animated.View>
  );
}

const cardFace = {
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};

// Pre-mirrors the back face's content so its rotateY(rotation+180deg)
// half-turn — which necessarily mirrors whatever it's rotating, the same
// way flipping a physical card over left-right would print its back
// upside-down relative to a naive "just rotate it" assumption — cancels
// out and any text/glyph on the back reads correctly once facing the
// viewer, instead of backwards.
const mirrorCorrection = {
  flex: 1,
  width: '100%' as const,
  transform: [{ scaleX: -1 }],
};
