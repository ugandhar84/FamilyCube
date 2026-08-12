/**
 * FamilyCubeSplashScreen
 * Matches brand identity from screenshots exactly.
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
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withTiming, withSpring, withRepeat, withSequence, withDelay,
  Easing,
} from 'react-native-reanimated';
import Svg, { Polyline } from 'react-native-svg';
import { CubeMark, Tagline } from './FamilyCubeLogo';

// ── Brand palette ─────────────────────────────────────────────────────────────
const TEAL   = '#00BBA4';
const AMBER  = '#F5A623';
const PINK   = '#F04E98';
const PURPLE = '#9261C7';
const WHITE  = '#FFFFFF';

const CUBE_SIZE = 130;
const { width: SW } = Dimensions.get('window');

// ── Scrolling pulse strip ─────────────────────────────────────────────────────
const PULSE_W = SW * 0.8;
const PULSE_H = 32;

function PulseStrip() {
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
    `0,${b}`,
    `${w * 0.15},${b}`,
    `${w * 0.24},${b - 9}`,
    `${w * 0.30},${b + 12}`,
    `${w * 0.35},${b - 12}`,
    `${w * 0.40},${b + 8}`,
    `${w * 0.46},${b}`,
    `${w * 0.56},${b}`,
    `${w * 0.63},${b - 7}`,
    `${w * 0.67},${b + 10}`,
    `${w * 0.71},${b - 10}`,
    `${w * 0.75},${b + 6}`,
    `${w * 0.82},${b}`,
    `${w},${b}`,
  ].join(' ');

  return (
    <View style={{ width: PULSE_W, height: PULSE_H, overflow: 'hidden' }}>
      <Animated.View style={[{ flexDirection: 'row', width: PULSE_W * 2 }, aStyle]}>
        {[0, 1].map(i => (
          <Svg key={i} width={PULSE_W} height={PULSE_H}
            viewBox={`0 0 ${PULSE_W} ${PULSE_H}`}>
            <Polyline
              points={pts}
              fill="none"
              stroke="rgba(255,255,255,0.45)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
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
    // bounce up
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
    <Animated.View style={[{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color,
    }, aStyle]} />
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function FamilyCubeSplashScreen() {
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
    // Frosted circle
    circleScale.value = withSpring(1,  { damping: 18, stiffness: 140 });
    circleOp.value    = withTiming(1,  { duration: 500 });
    // Cube
    cubeOp.value      = withDelay(80,  withTiming(1,  { duration: 440 }));
    cubeScale.value   = withDelay(80,  withSpring(1,  { damping: 12, stiffness: 140 }));
    // Wordmark
    wordOp.value      = withDelay(380, withTiming(1,  { duration: 400 }));
    wordTY.value      = withDelay(380, withSpring(0,  { damping: 20, stiffness: 200 }));
    // Tagline
    tagOp.value       = withDelay(600, withTiming(1,  { duration: 360 }));
    // Pulse
    pulseOp.value     = withDelay(760, withTiming(1,  { duration: 320 }));
    // Dots
    dotsOp.value      = withDelay(900, withTiming(1,  { duration: 280 }));
  }, []);

  const circleAStyle = useAnimatedStyle(() => ({
    transform: [{ scale: circleScale.value }],
    opacity: circleOp.value,
  }));
  const cubeAStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cubeScale.value }],
    opacity: cubeOp.value,
  }));
  const wordAStyle = useAnimatedStyle(() => ({
    opacity: wordOp.value,
    transform: [{ translateY: wordTY.value }],
  }));
  const tagAStyle   = useAnimatedStyle(() => ({ opacity: tagOp.value }));
  const pulseAStyle = useAnimatedStyle(() => ({ opacity: pulseOp.value }));
  const dotsAStyle  = useAnimatedStyle(() => ({ opacity: dotsOp.value }));

  return (
    <LinearGradient
      colors={['#100A2E', '#0D1A52', '#07101E']}
      locations={[0, 0.5, 1]}
      start={{ x: 0.3, y: 0 }}
      end={{ x: 0.7, y: 1 }}
      style={s.root}
    >
      {/* Frosted glass circle behind the cube */}
      <Animated.View style={[s.glassCircle, circleAStyle]} />

      {/* Purple glow blob behind glass */}
      <View style={s.glowBlob} />

      {/* Cube mark */}
      <Animated.View style={[s.cubeWrap, cubeAStyle]}>
        <CubeMark size={CUBE_SIZE} uid="splash" />
      </Animated.View>

      {/* Wordmark — "Family Cube" */}
      <Animated.View style={[s.wordRow, wordAStyle]}>
        <Text style={s.wordFamily}>Family </Text>
        <Text style={s.wordCube}>
          <Text style={{ color: TEAL   }}>C</Text>
          <Text style={{ color: AMBER  }}>u</Text>
          <Text style={{ color: PINK   }}>b</Text>
          <Text style={{ color: PURPLE }}>e</Text>
        </Text>
      </Animated.View>

      {/* Tagline */}
      <Animated.View style={[s.tagWrap, tagAStyle]}>
        <Tagline fontSize={11} opacity={0.85} dark />
      </Animated.View>

      {/* Pulse strip */}
      <Animated.View style={[s.pulseWrap, pulseAStyle]}>
        <PulseStrip />
      </Animated.View>

      {/* Wave dots — 5 in brand colors */}
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
    backgroundColor: '#0D0A2A',
  },
  // Spotlight ring — no border, just a soft radial halo around the cube
  glassCircle: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(255,255,255,0.038)',
    top: '20%',
    alignSelf: 'center',
  },
  glowBlob: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(146,97,199,0.18)',
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
    color: '#FFFFFF',
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
