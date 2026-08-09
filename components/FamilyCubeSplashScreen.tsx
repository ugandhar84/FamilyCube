/**
 * FamilyCubeSplashScreen
 * Animated splash with the Family Cube brand identity.
 * Animation sequence mirrors PawBondSplashScreen for consistency.
 *
 * Timeline:
 *   0ms   — cube mark fades + scales in
 *   340ms — wordmark slides up + fades in
 *   580ms — tagline fades in
 *   700ms — pulse strip fades in (looping)
 *   860ms — loading dots fade in (looping)
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withTiming, withSpring, withRepeat, withSequence, withDelay,
  Easing,
} from 'react-native-reanimated';
import Svg, { Polyline, Path } from 'react-native-svg';
import { CubeMark, Tagline } from './FamilyCubeLogo';

// Brand colors
const TEAL   = '#00BBA4';
const AMBER  = '#F5A623';
const PINK   = '#F04E98';
const PURPLE = '#9261C7';
const WHITE  = '#FFFFFF';
const NAVY   = '#1E2D6B';

const CUBE_SIZE = 120;
const PULSE_W   = 320;
const PULSE_H   = 34;

// ── Looping pulse strip (family-heartbeat shape) ──────────────────────────────
function PulseStrip() {
  const tx = useSharedValue(0);
  useEffect(() => {
    tx.value = withRepeat(
      withTiming(-PULSE_W, { duration: 2000, easing: Easing.linear }),
      -1, false,
    );
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));

  const b = PULSE_H / 2;
  const w = PULSE_W;
  // Family-themed EKG: two bumps (two heartbeats — parents & kids)
  const pts = [
    `0,${b}`,
    `${w * 0.18},${b}`,
    `${w * 0.28},${b - 10}`,
    `${w * 0.34},${b + 12}`,
    `${w * 0.38},${b - 13}`,
    `${w * 0.43},${b + 8}`,
    `${w * 0.48},${b}`,
    `${w * 0.58},${b}`,
    `${w * 0.66},${b - 7}`,
    `${w * 0.70},${b + 10}`,
    `${w * 0.74},${b - 11}`,
    `${w * 0.78},${b + 7}`,
    `${w * 0.84},${b}`,
    `${w},${b}`,
  ].join(' ');

  return (
    <View style={s.pulseClip}>
      <Animated.View style={[{ flexDirection: 'row', width: PULSE_W * 2 }, style]}>
        {[0, 1].map(i => (
          <Svg key={i} width={PULSE_W} height={PULSE_H} viewBox={`0 0 ${PULSE_W} ${PULSE_H}`}>
            <Polyline
              points={pts}
              fill="none"
              stroke="rgba(255,255,255,0.5)"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        ))}
      </Animated.View>
    </View>
  );
}

// ── Animated dot ──────────────────────────────────────────────────────────────
function Dot({ delay, color }: { delay: number; color: string }) {
  const scale = useSharedValue(0.4);
  const op    = useSharedValue(0.3);
  useEffect(() => {
    scale.value = withDelay(delay, withRepeat(
      withSequence(
        withSpring(1, { damping: 6, stiffness: 300 }),
        withTiming(0.4, { duration: 400, easing: Easing.in(Easing.quad) }),
        withDelay(60, withTiming(0.4, { duration: 1 })),
      ), -1, false,
    ));
    op.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(1, { duration: 180 }),
        withTiming(0.3, { duration: 400 }),
        withDelay(60, withTiming(0.3, { duration: 1 })),
      ), -1, false,
    ));
  }, []);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: op.value,
  }));
  return <Animated.View style={[s.dot, { backgroundColor: color }, style]} />;
}

// ── Rotating cube accent (decorative background glow) ─────────────────────────
function GlowRings() {
  const rot = useSharedValue(0);
  useEffect(() => {
    rot.value = withRepeat(
      withTiming(360, { duration: 8000, easing: Easing.linear }),
      -1, false,
    );
  }, []);
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rot.value}deg` }],
  }));
  return (
    <Animated.View style={[s.glowRing, style]}>
      <View style={[s.glowInner, { borderColor: 'rgba(0,187,164,0.15)' }]} />
    </Animated.View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function FamilyCubeSplashScreen() {
  // Shared animation values
  const cubeScale = useSharedValue(0.55);
  const cubeOp    = useSharedValue(0);
  const wordOp    = useSharedValue(0);
  const wordTY    = useSharedValue(20);
  const tagOp     = useSharedValue(0);
  const pulseOp   = useSharedValue(0);
  const dotsOp    = useSharedValue(0);

  useEffect(() => {
    // Cube mark entrance
    cubeScale.value = withSpring(1,   { damping: 13, stiffness: 130 });
    cubeOp.value    = withTiming(1,   { duration: 480 });
    // Wordmark slide up
    wordOp.value    = withDelay(340,  withTiming(1,  { duration: 420 }));
    wordTY.value    = withDelay(340,  withSpring(0,  { damping: 18, stiffness: 200 }));
    // Tagline
    tagOp.value     = withDelay(580,  withTiming(1,  { duration: 380 }));
    // Pulse strip
    pulseOp.value   = withDelay(700,  withTiming(1,  { duration: 340 }));
    // Dots
    dotsOp.value    = withDelay(860,  withTiming(1,  { duration: 280 }));
  }, []);

  const cubeStyle  = useAnimatedStyle(() => ({
    transform: [{ scale: cubeScale.value }],
    opacity: cubeOp.value,
  }));
  const wordStyle  = useAnimatedStyle(() => ({
    opacity: wordOp.value,
    transform: [{ translateY: wordTY.value }],
  }));
  const tagStyle   = useAnimatedStyle(() => ({ opacity: tagOp.value }));
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseOp.value }));
  const dotsStyle  = useAnimatedStyle(() => ({ opacity: dotsOp.value }));

  return (
    <LinearGradient
      colors={['#1A0B3D', '#0D1B50', '#081E1C']}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={s.root}
    >
      {/* Background glow rings */}
      <GlowRings />
      <View style={s.glow} />

      {/* Cube mark */}
      <Animated.View style={[s.cubeWrap, cubeStyle]}>
        <CubeMark size={CUBE_SIZE} />
      </Animated.View>

      {/* Wordmark — "family cube" */}
      <Animated.View style={[s.wordRow, wordStyle]}>
        <Text style={s.wordFamily}>family </Text>
        <Text style={s.wordCube}>
          <Text style={{ color: TEAL }}>c</Text>
          <Text style={{ color: AMBER }}>u</Text>
          <Text style={{ color: PINK }}>b</Text>
          <Text style={{ color: PURPLE }}>e</Text>
        </Text>
      </Animated.View>

      {/* Tagline */}
      <Animated.View style={[s.tagWrap, tagStyle]}>
        <Tagline fontSize={10} opacity={0.72} />
      </Animated.View>

      {/* Pulse strip */}
      <Animated.View style={[s.pulseWrap, pulseStyle]}>
        <PulseStrip />
      </Animated.View>

      {/* Loading dots — brand colors */}
      <Animated.View style={[s.dots, dotsStyle]}>
        <Dot delay={0}   color={TEAL}   />
        <Dot delay={200} color={AMBER}  />
        <Dot delay={400} color={PINK}   />
        <Dot delay={600} color={PURPLE} />
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
  glow: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(146,97,199,0.08)',
    top: '28%',
    alignSelf: 'center',
  },
  glowRing: {
    position: 'absolute',
    width: 340,
    height: 340,
    alignSelf: 'center',
    top: '18%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowInner: {
    width: 320,
    height: 320,
    borderRadius: 160,
    borderWidth: 1,
  },
  cubeWrap: {
    alignSelf: 'center',
    marginBottom: 24,
    shadowColor: '#9261C7',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  wordFamily: {
    fontSize: 46,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -1.5,
  },
  wordCube: {
    fontSize: 46,
    fontWeight: '800',
    letterSpacing: -1.5,
  },
  tagWrap: {
    marginBottom: 36,
  },
  pulseWrap: {
    marginBottom: 28,
  },
  pulseClip: {
    width: 260,
    height: PULSE_H,
    overflow: 'hidden',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
});
