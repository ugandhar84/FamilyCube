/**
 * FamilyCubeSplashScreen
 * Dark & light theme support. Lucide-style icons on each cube face.
 *
 * Animation timeline:
 *   0ms   — frosted circle scales + fades in
 *   80ms  — cube mark springs in
 *   380ms — wordmark slides up + fades in
 *   600ms — tagline fades in
 *   760ms — pulse strip fades in (looping scroll)
 *   900ms — wave dots fade in (looping bounce)
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, useColorScheme } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withTiming, withSpring, withRepeat, withSequence, withDelay,
  Easing,
} from 'react-native-reanimated';
import Svg, { Path, G, Circle, Polyline, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { Tagline } from './FamilyCubeLogo';

// ── Brand palette ─────────────────────────────────────────────────────────────
const TEAL   = '#00BBA4';
const AMBER  = '#F5A623';
const PINK   = '#F04E98';
const PURPLE = '#9261C7';
const TEAL2  = '#2DD4BF';
const AMBER2 = '#FFB830';
const PURPLE2= '#B98EDB';
const NAVY   = '#1E2D6B';

const CUBE_SIZE = 130;
const { width: SW } = Dimensions.get('window');

// ── Isometric cube face paths (viewBox 0 0 200 236) ───────────────────────────
const TOP_FACE   = 'M112,25 L173,61 Q185,68 173,75 L112,111 Q100,118 88,111 L27,75 Q15,68 27,61 L88,25 Q100,18 112,25 Z';
const LEFT_FACE  = 'M27,75 L88,111 Q100,118 100,132 L100,204 Q100,218 88,211 L27,175 Q15,168 15,154 L15,82 Q15,68 27,75 Z';
const RIGHT_FACE = 'M185,82 L185,154 Q185,168 173,175 L112,211 Q100,218 100,204 L100,132 Q100,118 112,111 L173,75 Q185,68 185,82 Z';

// ── Lucide icon paths (24×24 viewBox, stroke-based) ──────────────────────────
const HOME_PATHS  = ["M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", "M9 22V12h6v10"];
const USERS_PATHS = [
  "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2",
  "M23 21v-2a4 4 0 0 0-3-3.87",
  "M16 3.13a4 4 0 0 1 0 7.75",
];
const HEART_PATH  = "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z";

/**
 * Isometric matrix transforms — maps 24×24 Lucide icon onto each cube face
 * at ~40% scale. SVG matrix(a,b,c,d,e,f): x'=ax+cy+e, y'=bx+dy+f
 *
 * Top face (amber): orthographic rhombus, center (100,68), axes ≈ (170,0) / (0,100)
 * Left face (teal): parallelogram, right-dir=(85,50), down-dir=(0,100), center (57,143)
 * Right face (purple): parallelogram, right-dir=(-85,50), down-dir=(0,100), center (143,143)
 */
const TOP_MATRIX   = 'matrix(2.83,0,0,1.67,66,48)';
const LEFT_MATRIX  = 'matrix(1.42,0.83,0,1.67,40,113)';
const RIGHT_MATRIX = 'matrix(-1.42,0.83,0,1.67,160,113)';

// ── Isometric cube with Lucide icons ─────────────────────────────────────────
function SplashCubeMark({ size = 130 }: { size?: number }) {
  const h = size * 1.18;
  return (
    <Svg width={size} height={h} viewBox="0 0 200 236">
      <Defs>
        <SvgGradient id="sp_top" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor={AMBER2} />
          <Stop offset="100%" stopColor={AMBER} />
        </SvgGradient>
        <SvgGradient id="sp_left" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor={TEAL2} />
          <Stop offset="100%" stopColor={TEAL} />
        </SvgGradient>
        <SvgGradient id="sp_right" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor={PURPLE2} />
          <Stop offset="100%" stopColor={PURPLE} />
        </SvgGradient>
      </Defs>

      {/* ── TOP face — Amber — Home icon ── */}
      <Path d={TOP_FACE} fill="url(#sp_top)" />
      <G transform={TOP_MATRIX}>
        <G stroke="rgba(255,255,255,0.92)" strokeWidth="2.2" fill="none"
          strokeLinecap="round" strokeLinejoin="round">
          {HOME_PATHS.map((d, i) => <Path key={i} d={d} />)}
        </G>
      </G>

      {/* ── LEFT face — Teal — Users icon ── */}
      <Path d={LEFT_FACE} fill="url(#sp_left)" />
      <G transform={LEFT_MATRIX}>
        <G stroke="rgba(255,255,255,0.92)" strokeWidth="2.2" fill="none"
          strokeLinecap="round" strokeLinejoin="round">
          {USERS_PATHS.map((d, i) => <Path key={i} d={d} />)}
          <Circle cx={9} cy={7} r={4} />
        </G>
      </G>

      {/* ── RIGHT face — Purple — Heart icon ── */}
      <Path d={RIGHT_FACE} fill="url(#sp_right)" />
      <G transform={RIGHT_MATRIX}>
        <G stroke="rgba(255,255,255,0.92)" strokeWidth="2.2" fill="none"
          strokeLinecap="round" strokeLinejoin="round">
          <Path d={HEART_PATH} />
        </G>
      </G>

      {/* Edge highlights for 3D depth */}
      <Path
        d="M100,18 L15,68 M100,18 L185,68 M100,118 L15,68 M100,118 L185,68 M100,118 L100,218 M15,68 L15,168 L100,218 M185,68 L185,168 L100,218"
        fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={1.5}
      />
    </Svg>
  );
}

// ── Scrolling pulse strip ─────────────────────────────────────────────────────
const PULSE_W = SW * 0.8;
const PULSE_H = 32;

function PulseStrip({ color }: { color: string }) {
  const tx = useSharedValue(0);
  useEffect(() => {
    tx.value = withRepeat(
      withTiming(-PULSE_W, { duration: 2200, easing: Easing.linear }),
      -1, false,
    );
  }, []);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));

  const b   = PULSE_H / 2;
  const w   = PULSE_W;
  const pts = [
    `0,${b}`, `${w*0.15},${b}`, `${w*0.24},${b-9}`, `${w*0.30},${b+12}`,
    `${w*0.35},${b-12}`, `${w*0.40},${b+8}`, `${w*0.46},${b}`, `${w*0.56},${b}`,
    `${w*0.63},${b-7}`, `${w*0.67},${b+10}`, `${w*0.71},${b-10}`,
    `${w*0.75},${b+6}`, `${w*0.82},${b}`, `${w},${b}`,
  ].join(' ');

  return (
    <View style={{ width: PULSE_W, height: PULSE_H, overflow: 'hidden' }}>
      <Animated.View style={[{ flexDirection: 'row', width: PULSE_W * 2 }, aStyle]}>
        {[0, 1].map(i => (
          <Svg key={i} width={PULSE_W} height={PULSE_H} viewBox={`0 0 ${PULSE_W} ${PULSE_H}`}>
            <Polyline points={pts} fill="none" stroke={color}
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        ))}
      </Animated.View>
    </View>
  );
}

// ── Single bouncing dot ───────────────────────────────────────────────────────
function Dot({ delay, color, size = 11 }: { delay: number; color: string; size?: number }) {
  const ty    = useSharedValue(0);
  const scale = useSharedValue(0.5);
  const op    = useSharedValue(0.35);

  useEffect(() => {
    ty.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(-10, { duration: 280, easing: Easing.out(Easing.quad) }),
        withTiming(0,   { duration: 280, easing: Easing.in(Easing.quad) }),
        withDelay(400, withTiming(0, { duration: 1 })),
      ), -1, false,
    ));
    scale.value = withDelay(delay, withRepeat(
      withSequence(
        withSpring(1,   { damping: 7, stiffness: 320 }),
        withTiming(0.7, { duration: 280 }),
        withDelay(400, withTiming(0.7, { duration: 1 })),
      ), -1, false,
    ));
    op.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(1,    { duration: 180 }),
        withTiming(0.35, { duration: 420 }),
        withDelay(400, withTiming(0.35, { duration: 1 })),
      ), -1, false,
    ));
  }, []);

  const aStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: ty.value }, { scale: scale.value }],
    opacity: op.value,
  }));

  return (
    <Animated.View style={[{ width: size, height: size, borderRadius: size/2, backgroundColor: color }, aStyle]} />
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
  const pulseOp    = useSharedValue(0);
  const dotsOp     = useSharedValue(0);

  useEffect(() => {
    circleScale.value = withSpring(1,  { damping: 18, stiffness: 140 });
    circleOp.value    = withTiming(1,  { duration: 500 });
    cubeOp.value      = withDelay(80,  withTiming(1,  { duration: 440 }));
    cubeScale.value   = withDelay(80,  withSpring(1,  { damping: 12, stiffness: 140 }));
    wordOp.value      = withDelay(380, withTiming(1,  { duration: 400 }));
    wordTY.value      = withDelay(380, withSpring(0,  { damping: 20, stiffness: 200 }));
    tagOp.value       = withDelay(600, withTiming(1,  { duration: 360 }));
    pulseOp.value     = withDelay(760, withTiming(1,  { duration: 320 }));
    dotsOp.value      = withDelay(900, withTiming(1,  { duration: 280 }));
  }, []);

  const circleAStyle = useAnimatedStyle(() => ({ transform: [{ scale: circleScale.value }], opacity: circleOp.value }));
  const cubeAStyle   = useAnimatedStyle(() => ({ transform: [{ scale: cubeScale.value }], opacity: cubeOp.value }));
  const wordAStyle   = useAnimatedStyle(() => ({ opacity: wordOp.value, transform: [{ translateY: wordTY.value }] }));
  const tagAStyle    = useAnimatedStyle(() => ({ opacity: tagOp.value }));
  const pulseAStyle  = useAnimatedStyle(() => ({ opacity: pulseOp.value }));
  const dotsAStyle   = useAnimatedStyle(() => ({ opacity: dotsOp.value }));

  const bgColors    = isDark
    ? (['#100A2E', '#0D1A52', '#07101E'] as const)
    : (['#F5F0FF', '#EBF8F6', '#F0F4FF'] as const);
  const glassColor  = isDark ? 'rgba(255,255,255,0.038)' : 'rgba(255,255,255,0.60)';
  const glowColor   = isDark ? 'rgba(146,97,199,0.18)' : 'rgba(146,97,199,0.12)';
  const pulseStroke = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(100,60,180,0.3)';

  return (
    <LinearGradient
      colors={bgColors}
      locations={[0, 0.5, 1]}
      start={{ x: 0.3, y: 0 }}
      end={{ x: 0.7, y: 1 }}
      style={s.root}
    >
      <Animated.View style={[s.glassCircle, { backgroundColor: glassColor }, circleAStyle]} />
      <View style={[s.glowBlob, { backgroundColor: glowColor }]} />

      <Animated.View style={[s.cubeWrap, cubeAStyle]}>
        <SplashCubeMark size={CUBE_SIZE} />
      </Animated.View>

      <Animated.View style={[s.wordRow, wordAStyle]}>
        <Text style={[s.wordFamily, { color: isDark ? '#FFFFFF' : NAVY }]}>Family </Text>
        <Text style={s.wordCube}>
          <Text style={{ color: TEAL   }}>C</Text>
          <Text style={{ color: AMBER  }}>u</Text>
          <Text style={{ color: PINK   }}>b</Text>
          <Text style={{ color: PURPLE }}>e</Text>
        </Text>
      </Animated.View>

      <Animated.View style={[s.tagWrap, tagAStyle]}>
        <Tagline fontSize={11} opacity={0.85} dark={isDark} />
      </Animated.View>

      <Animated.View style={[s.pulseWrap, pulseAStyle]}>
        <PulseStrip color={pulseStroke} />
      </Animated.View>

      <Animated.View style={[s.dotsRow, dotsAStyle]}>
        <Dot delay={0}   color={TEAL}   />
        <Dot delay={160} color={AMBER}  />
        <Dot delay={320} color={PINK}   />
        <Dot delay={480} color={PURPLE} />
        <Dot delay={640} color={TEAL}   size={9} />
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
    width: 300,
    height: 300,
    borderRadius: 150,
    top: '20%',
    alignSelf: 'center',
  },
  glowBlob: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    top: '24%',
    alignSelf: 'center',
  },
  cubeWrap: {
    alignSelf: 'center',
    marginBottom: 28,
    shadowColor: '#9261C7',
    shadowOpacity: 0.5,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 10 },
  },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  wordFamily: {
    fontSize: 46,
    fontWeight: '800',
    letterSpacing: -1.2,
  },
  wordCube: {
    fontSize: 46,
    fontWeight: '800',
    letterSpacing: -1.2,
  },
  tagWrap: {
    marginBottom: 44,
  },
  pulseWrap: {
    marginBottom: 32,
    alignItems: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
