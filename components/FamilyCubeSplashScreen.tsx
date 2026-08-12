/**
 * FamilyCubeSplashScreen — v6
 * - Big glossy circle IS the container: cube + wordmark both live inside it
 * - Tagline + wave dots sit below the circle
 * - 5 dots swing in a continuous sine wave
 * - Dark-amber ♥ above the "i" in "Family"
 * - Dark + light theme
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, useColorScheme } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue, useAnimatedStyle, useDerivedValue,
  withTiming, withSpring, withDelay, withRepeat,
  Easing,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Tagline, IconCubeMark } from './FamilyCubeLogo';

// ── Brand palette ─────────────────────────────────────────────────────────────
const TEAL      = '#00BBA4';
const AMBER     = '#F5A623';
const DARK_AMBER= '#D4870A';
const PINK      = '#F04E98';
const PURPLE    = '#9261C7';
const NAVY      = '#1E2D6B';

const CUBE_SIZE  = 130;
const CIRCLE_SZ  = Dimensions.get('window').width * 0.88;

// ── Cube (shared IconCubeMark) ────────────────────────────────────────────────
// SplashCubeMark is now IconCubeMark from FamilyCubeLogo (shared component)

// ── Wordmark: "Family" unchanged; heart drops onto the "i" dot ───────────────
//
// dotless-i (ı U+0131) removes the competing dot.
// Heart is absolutely positioned AT the dot level (positive top) — the "i"
// character never moves, only the dot is replaced.
function SplashWordmark({ textColor }: { textColor: string }) {
  const FONT     = 44;
  const HEART_SZ = 13;
  // At 44px bold: "Fam" ≈ 90px; "i" center ≈ 97px from left of "Famıly "
  // dot sits ~8px from top of the text's line box
  const HEART_LEFT = 80;
  const HEART_TOP  = 4;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
      <View style={{ position: 'relative' }}>
        {/* Heart lands on the dot — "i" stays at normal baseline */}
        <Svg
          width={HEART_SZ} height={HEART_SZ} viewBox="0 0 20 18"
          style={{ position: 'absolute', left: HEART_LEFT, top: HEART_TOP, zIndex: 1 }}
        >
          <Path
            d="M10,16 C7,13 0,9 0,5 C0,0 5,-1 10,6 C15,-1 20,0 20,5 C20,9 13,13 10,16 Z"
            fill={DARK_AMBER}
          />
        </Svg>
        {/* ı = dotless i (U+0131) hides the dot under the heart */}
        <Text style={{ fontSize: FONT, fontWeight: '800', color: textColor, letterSpacing: -1.2 }}>
          Famıly{' '}
        </Text>
      </View>

      <Text style={{ fontSize: FONT, fontWeight: '800', letterSpacing: -1.2 }}>
        <Text style={{ color: TEAL   }}>C</Text>
        <Text style={{ color: AMBER  }}>u</Text>
        <Text style={{ color: PINK   }}>b</Text>
        <Text style={{ color: PURPLE }}>e</Text>
      </Text>
    </View>
  );
}

// ── Sine-wave dots ────────────────────────────────────────────────────────────
const DOT_COLORS = [TEAL, AMBER, PINK, PURPLE, TEAL];
const DOT_SIZES  = [11, 11, 11, 11, 9];
const WAVE_AMP   = 13;
const WAVE_MS    = 1400;

function WaveDot({ phase, index, total, color, size }: {
  phase: Animated.SharedValue<number>;
  index: number;
  total: number;
  color: string;
  size: number;
}) {
  const ty = useDerivedValue(() => {
    'worklet';
    const p = (phase.value + index / total) % 1;
    return -Math.sin(p * 2 * Math.PI) * WAVE_AMP;
  });
  const aStyle = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }));
  return (
    <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: 0.88 }, aStyle]} />
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function FamilyCubeSplashScreen() {
  const scheme = useColorScheme();
  const isDark = scheme !== 'light';

  const circleScale = useSharedValue(0.75);
  const circleOp   = useSharedValue(0);
  const cubeScale  = useSharedValue(0.5);
  const cubeOp     = useSharedValue(0);
  const wordOp     = useSharedValue(0);
  const wordTY     = useSharedValue(18);
  const tagOp      = useSharedValue(0);
  const dotsOp     = useSharedValue(0);
  const wavePhase  = useSharedValue(0);

  useEffect(() => {
    circleScale.value = withSpring(1,  { damping: 18, stiffness: 120 });
    circleOp.value    = withTiming(1,  { duration: 480 });
    cubeOp.value      = withDelay(120, withTiming(1,  { duration: 420 }));
    cubeScale.value   = withDelay(120, withSpring(1,  { damping: 12, stiffness: 140 }));
    wordOp.value      = withDelay(400, withTiming(1,  { duration: 380 }));
    wordTY.value      = withDelay(400, withSpring(0,  { damping: 20, stiffness: 200 }));
    tagOp.value       = withDelay(620, withTiming(1,  { duration: 340 }));
    dotsOp.value      = withDelay(820, withTiming(1,  { duration: 280 }));
    wavePhase.value   = withRepeat(withTiming(1, { duration: WAVE_MS, easing: Easing.linear }), -1, false);
  }, []);

  const circleAStyle = useAnimatedStyle(() => ({
    transform: [{ scale: circleScale.value }],
    opacity: circleOp.value,
  }));
  const cubeAStyle  = useAnimatedStyle(() => ({
    transform: [{ scale: cubeScale.value }],
    opacity: cubeOp.value,
  }));
  const wordAStyle  = useAnimatedStyle(() => ({
    opacity: wordOp.value,
    transform: [{ translateY: wordTY.value }],
  }));
  const tagAStyle   = useAnimatedStyle(() => ({ opacity: tagOp.value }));
  const dotsAStyle  = useAnimatedStyle(() => ({ opacity: dotsOp.value }));

  const bgColors   = isDark
    ? (['#100A2E', '#0D1A52', '#07101E'] as const)
    : (['#F0EEFF', '#EAF8F5', '#EEF2FF'] as const);
  const glassColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)';

  return (
    <LinearGradient colors={bgColors} locations={[0, 0.5, 1]} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }} style={s.root}>

      {/* ── Big glossy circle — cube + wordmark live inside it ── */}
      <Animated.View style={[s.circle, { backgroundColor: glassColor }, circleAStyle]}>

        {/* Cube — centered in upper portion of circle */}
        <Animated.View style={[s.cubeWrap, cubeAStyle]}>
          <IconCubeMark size={CUBE_SIZE} />
        </Animated.View>

        {/* Wordmark */}
        <Animated.View style={wordAStyle}>
          <SplashWordmark textColor={isDark ? '#FFFFFF' : NAVY} />
        </Animated.View>

      </Animated.View>

      {/* ── Tagline below circle ── */}
      <Animated.View style={[s.tagWrap, tagAStyle]}>
        <Tagline fontSize={11} opacity={0.85} dark={isDark} />
      </Animated.View>

      {/* ── Wave dots ── */}
      <Animated.View style={[s.dotsRow, dotsAStyle]}>
        {DOT_COLORS.map((color, i) => (
          <WaveDot key={i} phase={wavePhase} index={i} total={DOT_COLORS.length}
            color={color} size={DOT_SIZES[i]} />
        ))}
      </Animated.View>

    </LinearGradient>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: CIRCLE_SZ,
    height: CIRCLE_SZ,
    borderRadius: CIRCLE_SZ / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    // subtle inner shadow / ring on light theme via shadow
    shadowColor: '#9261C7',
    shadowOpacity: 0.10,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 4 },
  },
  cubeWrap: {
    marginBottom: 18,
    shadowColor: '#9261C7',
    shadowOpacity: 0.40,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 8 },
  },
  tagWrap: {
    marginBottom: 32,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    height: WAVE_AMP * 2 + 12,
  },
});
