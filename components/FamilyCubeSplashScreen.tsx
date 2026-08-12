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
import Svg, { Path, G, Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { Tagline } from './FamilyCubeLogo';

// ── Brand palette ─────────────────────────────────────────────────────────────
const TEAL      = '#00BBA4';
const AMBER     = '#F5A623';
const DARK_AMBER= '#D4870A';
const PINK      = '#F04E98';
const PURPLE    = '#9261C7';
const TEAL2     = '#2DD4BF';
const AMBER2    = '#FFB830';
const PURPLE2   = '#B98EDB';
const NAVY      = '#1E2D6B';

const CUBE_SIZE  = 130;
const CIRCLE_SZ  = Dimensions.get('window').width * 0.88;

// ── Isometric cube face paths ─────────────────────────────────────────────────
const TOP_FACE   = 'M112,25 L173,61 Q185,68 173,75 L112,111 Q100,118 88,111 L27,75 Q15,68 27,61 L88,25 Q100,18 112,25 Z';
const LEFT_FACE  = 'M27,75 L88,111 Q100,118 100,132 L100,204 Q100,218 88,211 L27,175 Q15,168 15,154 L15,82 Q15,68 27,75 Z';
const RIGHT_FACE = 'M185,82 L185,154 Q185,168 173,175 L112,211 Q100,218 100,204 L100,132 Q100,118 112,111 L173,75 Q185,68 185,82 Z';

// ── Lucide icon paths ─────────────────────────────────────────────────────────
const HOME_PATHS  = ["M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", "M9 22V12h6v10"];
const USERS_PATHS = ["M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2", "M23 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"];
const HEART_PATH  = "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z";

const TOP_MATRIX   = 'matrix(2.83,0,0,1.67,66,48)';
const LEFT_MATRIX  = 'matrix(1.42,0.83,0,1.67,40,113)';
const RIGHT_MATRIX = 'matrix(-1.42,0.83,0,1.67,160,113)';

// ── Cube ──────────────────────────────────────────────────────────────────────
function SplashCubeMark({ size = 130 }: { size?: number }) {
  const h = size * 1.18;
  return (
    <Svg width={size} height={h} viewBox="0 0 200 236">
      <Defs>
        <SvgGradient id="sp_top" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor={AMBER2} /><Stop offset="100%" stopColor={AMBER} />
        </SvgGradient>
        <SvgGradient id="sp_left" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor={TEAL2} /><Stop offset="100%" stopColor={TEAL} />
        </SvgGradient>
        <SvgGradient id="sp_right" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor={PURPLE2} /><Stop offset="100%" stopColor={PURPLE} />
        </SvgGradient>
      </Defs>
      <Path d={TOP_FACE} fill="url(#sp_top)" />
      <G transform={TOP_MATRIX}>
        <G stroke="rgba(255,255,255,0.92)" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          {HOME_PATHS.map((d, i) => <Path key={i} d={d} />)}
        </G>
      </G>
      <Path d={LEFT_FACE} fill="url(#sp_left)" />
      <G transform={LEFT_MATRIX}>
        <G stroke="rgba(255,255,255,0.92)" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          {USERS_PATHS.map((d, i) => <Path key={i} d={d} />)}
          <Circle cx={9} cy={7} r={4} />
        </G>
      </G>
      <Path d={RIGHT_FACE} fill="url(#sp_right)" />
      <G transform={RIGHT_MATRIX}>
        <G stroke="rgba(255,255,255,0.92)" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <Path d={HEART_PATH} />
        </G>
      </G>
      <Path
        d="M100,18 L15,68 M100,18 L185,68 M100,118 L15,68 M100,118 L185,68 M100,118 L100,218 M15,68 L15,168 L100,218 M185,68 L185,168 L100,218"
        fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={1.5}
      />
    </Svg>
  );
}

// ── Wordmark: column layout so ♥ is guaranteed above the "i" ─────────────────
function SplashWordmark({ textColor }: { textColor: string }) {
  const FONT     = 44;
  const LH       = 50;
  const HEART_SZ = 13;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      <Text style={{ fontSize: FONT, fontWeight: '800', color: textColor, letterSpacing: -1.2, lineHeight: LH }}>
        Famil
      </Text>

      {/* ♥ stacked above the "i" */}
      <View style={{ alignItems: 'center', paddingBottom: LH - FONT }}>
        <Svg width={HEART_SZ} height={HEART_SZ} viewBox="0 0 20 18" style={{ marginBottom: 2 }}>
          <Path
            d="M10,16 C7,13 0,9 0,5 C0,0 5,-1 10,6 C15,-1 20,0 20,5 C20,9 13,13 10,16 Z"
            fill={DARK_AMBER}
          />
        </Svg>
        <Text style={{ fontSize: FONT, fontWeight: '800', color: textColor, letterSpacing: -1.2, lineHeight: FONT }}>
          i
        </Text>
      </View>

      <Text style={{ fontSize: FONT, fontWeight: '800', color: textColor, letterSpacing: -1.2, lineHeight: LH }}>
        ly{' '}
      </Text>

      <Text style={{ fontSize: FONT, fontWeight: '800', letterSpacing: -1.2, lineHeight: LH }}>
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
          <SplashCubeMark size={CUBE_SIZE} />
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
