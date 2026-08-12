/**
 * FamilyCubeSplashScreen — v4
 * - One large glossy circle behind cube
 * - No ECG strip; 5 dots swing in a continuous sine wave
 * - "Family" wordmark: dark-amber heart above the dot of the "i"
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

const CUBE_SIZE = 130;
const { width: SW } = Dimensions.get('window');

// ── Isometric cube face paths ─────────────────────────────────────────────────
const TOP_FACE   = 'M112,25 L173,61 Q185,68 173,75 L112,111 Q100,118 88,111 L27,75 Q15,68 27,61 L88,25 Q100,18 112,25 Z';
const LEFT_FACE  = 'M27,75 L88,111 Q100,118 100,132 L100,204 Q100,218 88,211 L27,175 Q15,168 15,154 L15,82 Q15,68 27,75 Z';
const RIGHT_FACE = 'M185,82 L185,154 Q185,168 173,175 L112,211 Q100,218 100,204 L100,132 Q100,118 112,111 L173,75 Q185,68 185,82 Z';

// ── Lucide icon paths ─────────────────────────────────────────────────────────
const HOME_PATHS  = ["M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", "M9 22V12h6v10"];
const USERS_PATHS = ["M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2", "M23 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"];
const HEART_PATH  = "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z";

// Isometric matrix transforms (40% scale, 24×24 Lucide icon)
const TOP_MATRIX   = 'matrix(2.83,0,0,1.67,66,48)';
const LEFT_MATRIX  = 'matrix(1.42,0.83,0,1.67,40,113)';
const RIGHT_MATRIX = 'matrix(-1.42,0.83,0,1.67,160,113)';

// ── Cube with Lucide icons ────────────────────────────────────────────────────
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

// ── Sine-wave dots — shared phase drives all 5 dots ──────────────────────────
const DOT_COLORS = [TEAL, AMBER, PINK, PURPLE, TEAL];
const DOT_SIZES  = [11, 11, 11, 11, 9];
const WAVE_AMP   = 10;   // px
const WAVE_MS    = 1400; // period

function WaveDot({ phase, offset, color, size, visible }: {
  phase: Animated.SharedValue<number>;
  offset: number;
  color: string;
  size: number;
  visible: Animated.SharedValue<number>;
}) {
  // Compute per-dot Y from the shared phase: sin(2π*(phase+offset)) * AMP
  const ty = useDerivedValue(() => {
    'worklet';
    const p = (phase.value + offset) % 1;
    return -Math.sin(p * 2 * Math.PI) * WAVE_AMP;
  });

  const aStyle = useAnimatedStyle(() => ({
    opacity: visible.value * 0.88,
    transform: [{ translateY: ty.value }],
  }));

  return (
    <Animated.View
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, aStyle]}
    />
  );
}

// ── Wordmark with dark-amber heart above the "i" ──────────────────────────────
function SplashWordmark({ textColor }: { textColor: string }) {
  const FONT     = 46;
  const HEART_SZ = 16;
  // Empirical: at 46px bold, "Famil" ends around x=112, "i" center ≈ x=108
  const HEART_LEFT = 104;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
      <View style={{ position: 'relative' }}>
        <Svg
          width={HEART_SZ}
          height={HEART_SZ}
          viewBox="0 0 20 18"
          style={{ position: 'absolute', left: HEART_LEFT, top: -(HEART_SZ + 2), zIndex: 1 }}
        >
          <Path
            d="M10,16 C7,13 0,9 0,5 C0,0 5,-1 10,6 C15,-1 20,0 20,5 C20,9 13,13 10,16 Z"
            fill={DARK_AMBER}
          />
        </Svg>
        <Text style={[s.wordFamily, { color: textColor, fontSize: FONT }]}>Family </Text>
      </View>
      <Text style={[s.wordCube, { fontSize: FONT }]}>
        <Text style={{ color: TEAL   }}>C</Text>
        <Text style={{ color: AMBER  }}>u</Text>
        <Text style={{ color: PINK   }}>b</Text>
        <Text style={{ color: PURPLE }}>e</Text>
      </Text>
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function FamilyCubeSplashScreen() {
  const scheme = useColorScheme();
  const isDark = scheme !== 'light';

  const circleScale = useSharedValue(0.7);
  const circleOp   = useSharedValue(0);
  const cubeScale  = useSharedValue(0.5);
  const cubeOp     = useSharedValue(0);
  const wordOp     = useSharedValue(0);
  const wordTY     = useSharedValue(22);
  const tagOp      = useSharedValue(0);
  const dotsVis    = useSharedValue(0);
  // Continuously running wave phase: 0 → 1 looping
  const wavePhase  = useSharedValue(0);

  useEffect(() => {
    circleScale.value = withSpring(1,  { damping: 18, stiffness: 140 });
    circleOp.value    = withTiming(1,  { duration: 500 });
    cubeOp.value      = withDelay(80,  withTiming(1,  { duration: 440 }));
    cubeScale.value   = withDelay(80,  withSpring(1,  { damping: 12, stiffness: 140 }));
    wordOp.value      = withDelay(380, withTiming(1,  { duration: 400 }));
    wordTY.value      = withDelay(380, withSpring(0,  { damping: 20, stiffness: 200 }));
    tagOp.value       = withDelay(600, withTiming(1,  { duration: 360 }));
    dotsVis.value     = withDelay(800, withTiming(1,  { duration: 300 }));
    // Start wave loop immediately; dots fade in via dotsVis
    wavePhase.value   = withRepeat(
      withTiming(1, { duration: WAVE_MS, easing: Easing.linear }),
      -1, false,
    );
  }, []);

  const circleAStyle = useAnimatedStyle(() => ({ transform: [{ scale: circleScale.value }], opacity: circleOp.value }));
  const cubeAStyle   = useAnimatedStyle(() => ({ transform: [{ scale: cubeScale.value }], opacity: cubeOp.value }));
  const wordAStyle   = useAnimatedStyle(() => ({ opacity: wordOp.value, transform: [{ translateY: wordTY.value }] }));
  const tagAStyle    = useAnimatedStyle(() => ({ opacity: tagOp.value }));
  const dotsRowStyle = useAnimatedStyle(() => ({ opacity: dotsVis.value }));

  const bgColors   = isDark
    ? (['#100A2E', '#0D1A52', '#07101E'] as const)
    : (['#F5F0FF', '#EBF8F6', '#F0F4FF'] as const);
  const glassColor = isDark ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.65)';
  const glowColor  = isDark ? 'rgba(146,97,199,0.20)'   : 'rgba(146,97,199,0.13)';

  return (
    <LinearGradient colors={bgColors} locations={[0, 0.5, 1]} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }} style={s.root}>

      {/* Single large glossy circle */}
      <Animated.View style={[s.glassCircle, { backgroundColor: glassColor }, circleAStyle]} />
      <View style={[s.glowBlob, { backgroundColor: glowColor }]} />

      {/* Cube */}
      <Animated.View style={[s.cubeWrap, cubeAStyle]}>
        <SplashCubeMark size={CUBE_SIZE} />
      </Animated.View>

      {/* Wordmark */}
      <Animated.View style={[s.wordRow, wordAStyle]}>
        <SplashWordmark textColor={isDark ? '#FFFFFF' : NAVY} />
      </Animated.View>

      {/* Tagline */}
      <Animated.View style={[s.tagWrap, tagAStyle]}>
        <Tagline fontSize={11} opacity={0.85} dark={isDark} />
      </Animated.View>

      {/* Sine-wave swinging dots */}
      <Animated.View style={[s.dotsRow, dotsRowStyle]}>
        {DOT_COLORS.map((color, i) => (
          <WaveDot
            key={i}
            phase={wavePhase}
            offset={i / DOT_COLORS.length}
            color={color}
            size={DOT_SIZES[i]}
            visible={dotsVis}
          />
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
  glassCircle: {
    position: 'absolute',
    width: SW * 0.82,
    height: SW * 0.82,
    borderRadius: SW * 0.41,
    top: '15%',
    alignSelf: 'center',
  },
  glowBlob: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    top: '22%',
    alignSelf: 'center',
  },
  cubeWrap: {
    alignSelf: 'center',
    marginBottom: 28,
    shadowColor: '#9261C7',
    shadowOpacity: 0.45,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 10 },
  },
  wordRow: {
    marginBottom: 10,
  },
  wordFamily: {
    fontWeight: '800',
    letterSpacing: -1.2,
  },
  wordCube: {
    fontWeight: '800',
    letterSpacing: -1.2,
  },
  tagWrap: {
    marginBottom: 52,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
});
