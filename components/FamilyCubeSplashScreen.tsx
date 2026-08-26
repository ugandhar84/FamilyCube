/**
 * FamilyCubeSplashScreen — v7
 * Rebuilt to drop the v6 spotlight-circle container and the old cool-tone
 * (teal/amber/pink/purple/navy) palette entirely in favor of the real
 * Kinfolk BRAND tokens (mirrors constants/colors.ts) — the cube mark and
 * tagline already read BRAND.* via FamilyCubeLogo.tsx's shared components,
 * this file's own wordmark/background/motion are what needed rebuilding.
 *
 * Wordmark: only the leading "F" (Family) and "C" (Cube) carry brand color
 * — every other letter is plain white/ink, per explicit direction.
 *
 * Motion: replaces the old 5-dot sine-wave row (disliked — "dot wave") with
 * a soft outward "splash" — a few translucent brand-colored droplets ripple
 * out from the cube and fade, evoking water rings rather than a bobbing
 * wave. No spotlight circle behind the cube; it sits directly on the warm
 * gradient background.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, useColorScheme } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withTiming, withSpring, withDelay, withRepeat,
  Easing,
} from 'react-native-reanimated';
import { Tagline, IconCubeMark, BRAND } from './FamilyCubeLogo';

const CUBE_SIZE = 128;
const { width: SCREEN_W } = Dimensions.get('window');

// ── Wordmark — only F and C carry brand color, everything else is the
// plain ink/white text color ──────────────────────────────────────────────
function SplashWordmark({ textColor }: { textColor: string }) {
  const FONT = 40;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
      <Text style={{ fontSize: FONT, fontWeight: '800', letterSpacing: -1 }}>
        <Text style={{ color: BRAND.purple }}>F</Text>
        <Text style={{ color: textColor }}>amily </Text>
        <Text style={{ color: BRAND.teal }}>C</Text>
        <Text style={{ color: textColor }}>ube</Text>
      </Text>
    </View>
  );
}

// ── Ripple — a single expanding, fading ring, offset by delay ────────────
function Ripple({ color, delay }: { color: string; delay: number }) {
  const scale = useSharedValue(0.4);
  const op = useSharedValue(0.5);

  useEffect(() => {
    scale.value = withDelay(delay, withRepeat(
      withTiming(2.4, { duration: 2200, easing: Easing.out(Easing.quad) }),
      -1, false,
    ));
    op.value = withDelay(delay, withRepeat(
      withTiming(0, { duration: 2200, easing: Easing.out(Easing.quad) }),
      -1, false,
    ));
  }, []);

  const aStyle = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        { alignItems: 'center', justifyContent: 'center' },
        aStyle,
      ]}
    >
      <View style={{
        width: CUBE_SIZE * 1.15, height: CUBE_SIZE * 1.15,
        borderRadius: CUBE_SIZE, borderWidth: 2, borderColor: color,
      }} />
    </Animated.View>
  );
}

export default function FamilyCubeSplashScreen() {
  const scheme = useColorScheme();
  const isDark = scheme !== 'light';

  const cubeScale = useSharedValue(0.5);
  const cubeOp = useSharedValue(0);
  const wordOp = useSharedValue(0);
  const wordTY = useSharedValue(16);
  const tagOp = useSharedValue(0);

  useEffect(() => {
    cubeOp.value = withTiming(1, { duration: 420 });
    cubeScale.value = withSpring(1, { damping: 12, stiffness: 140 });
    wordOp.value = withDelay(280, withTiming(1, { duration: 380 }));
    wordTY.value = withDelay(280, withSpring(0, { damping: 20, stiffness: 200 }));
    tagOp.value = withDelay(520, withTiming(1, { duration: 340 }));
  }, []);

  const cubeAStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cubeScale.value }],
    opacity: cubeOp.value,
  }));
  const wordAStyle = useAnimatedStyle(() => ({
    opacity: wordOp.value,
    transform: [{ translateY: wordTY.value }],
  }));
  const tagAStyle = useAnimatedStyle(() => ({ opacity: tagOp.value }));

  // Exact constants/colors.ts values (not an approximation) — card/surface/
  // background for each theme, so the splash reads as genuinely the same
  // canvas the rest of the app uses, not just a similar warm/dark tone.
  const bgColors = isDark
    ? (['#1B1E28', '#181B24', '#12141C'] as const) // dark: card -> surface -> background
    : (['#FFFFFF', '#F8F3EA', '#FDFBF7'] as const); // light: card -> surface -> background
  // Matches constants/colors.ts's textPrimary exactly for each theme
  // (BRAND.navy === light-mode textPrimary already).
  const textColor = isDark ? '#EDE8E0' : BRAND.navy;

  return (
    <LinearGradient colors={bgColors} locations={[0, 0.55, 1]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={s.root}>

      {/* ── Cube with outward ripple splash — no spotlight circle behind it ── */}
      <View style={s.cubeStage}>
        <Ripple color={BRAND.teal} delay={0} />
        <Ripple color={BRAND.amber} delay={550} />
        <Ripple color={BRAND.purple} delay={1100} />
        <Animated.View style={cubeAStyle}>
          <IconCubeMark size={CUBE_SIZE} />
        </Animated.View>
      </View>

      {/* ── Wordmark ── */}
      <Animated.View style={[s.wordWrap, wordAStyle]}>
        <SplashWordmark textColor={textColor} />
      </Animated.View>

      {/* ── Tagline ── */}
      <Animated.View style={[s.tagWrap, tagAStyle]}>
        <Tagline fontSize={11} opacity={0.85} dark={isDark} />
      </Animated.View>

    </LinearGradient>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cubeStage: {
    width: SCREEN_W,
    height: CUBE_SIZE * 1.7,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  wordWrap: {
    marginBottom: 14,
  },
  tagWrap: {
    marginTop: 4,
  },
});
