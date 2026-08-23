import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withTiming, withSpring, withRepeat, withSequence, withDelay,
  Easing,
} from 'react-native-reanimated';
import Svg, { Polyline, Path } from 'react-native-svg';
import { AnimatedCubeMark } from './FamilyCubeLogo';

const AMBER = '#FFB347';

// Fixed sizes — same on every device/ratio
const MARK = 100;
const EKG_W = 320;
const EKG_H = 34;

// ── EKG pulse strip — fixed 320 pt period, clipped to 260 pt window ──────────
function PulseStrip() {
  const tx = useSharedValue(0);
  useEffect(() => {
    tx.value = withRepeat(
      withTiming(-EKG_W, { duration: 1800, easing: Easing.linear }),
      -1, false,
    );
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));

  const b = EKG_H / 2;
  const w = EKG_W;
  const pts = [
    `0,${b}`,
    `${w * 0.22},${b}`,
    `${w * 0.34},${b - 11}`,
    `${w * 0.42},${b + 13}`,
    `${w * 0.48},${b - 15}`,
    `${w * 0.54},${b + 9}`,
    `${w * 0.60},${b - 4}`,
    `${w * 0.66},${b}`,
    `${w},${b}`,
  ].join(' ');

  return (
    <View style={s.pulseClip}>
      <Animated.View style={[{ flexDirection: 'row', width: EKG_W * 2 }, style]}>
        {[0, 1].map(i => (
          <Svg key={i} width={EKG_W} height={EKG_H} viewBox={`0 0 ${EKG_W} ${EKG_H}`}>
            <Polyline
              points={pts}
              fill="none"
              stroke={AMBER}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeOpacity={0.65}
            />
          </Svg>
        ))}
      </Animated.View>
    </View>
  );
}

// ── Animated loading icons — house / checklist / heart, one per brand
// pillar (Connect · Organize · Care) instead of three generic dots ─────────
const LOADING_ICON_PATHS: Record<'home' | 'tasks' | 'heart', string[]> = {
  // House — Connect
  home:  ['M3 10.5L12 3l9 7.5', 'M5 9.5V20a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V9.5'],
  // Checklist — Organize
  tasks: ['M4 6h2M4 12h2M4 18h2', 'M9 6h11M9 12h11M9 18h11'],
  // Heart — Care
  heart: ['M12 20s-7-4.5-9.5-9A5 5 0 0112 5a5 5 0 019.5 6c-2.5 4.5-9.5 9-9.5 9z'],
};

function LoadingIcon({ kind, delay }: { kind: 'home' | 'tasks' | 'heart'; delay: number }) {
  const scale = useSharedValue(0.5);
  const op    = useSharedValue(0.35);
  useEffect(() => {
    scale.value = withDelay(delay, withRepeat(
      withSequence(
        withSpring(1, { damping: 7, stiffness: 260 }),
        withTiming(0.5, { duration: 420, easing: Easing.in(Easing.quad) }),
        withDelay(160, withTiming(0.5, { duration: 1 })),
      ), -1, false,
    ));
    op.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(1, { duration: 220 }),
        withTiming(0.35, { duration: 420 }),
        withDelay(160, withTiming(0.35, { duration: 1 })),
      ), -1, false,
    ));
  }, []);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: op.value,
  }));
  return (
    <Animated.View style={style}>
      <Svg width={18} height={18} viewBox="0 0 24 24">
        {LOADING_ICON_PATHS[kind].map((d, i) => (
          <Path key={i} d={d}
            fill={kind === 'heart' ? 'rgba(255,255,255,0.85)' : 'none'}
            stroke="rgba(255,255,255,0.85)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </Svg>
    </Animated.View>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function PawBondSplashScreen() {
  // Always use the dark gradient — splash is 2s, no theme-flashing risk,
  // and dark looks premium on both light and dark devices.
  const gradientColors: [string, string, string] = ['#2A0A5E', '#150D50', '#051C1A'];

  const markScale = useSharedValue(0.6);
  const markOp    = useSharedValue(0);
  const nameOp    = useSharedValue(0);
  const nameTY    = useSharedValue(18);
  const tagOp     = useSharedValue(0);
  const pulseOp   = useSharedValue(0);
  const dotsOp    = useSharedValue(0);

  useEffect(() => {
    markScale.value = withSpring(1,  { damping: 14, stiffness: 140 });
    markOp.value    = withTiming(1,  { duration: 500 });
    nameOp.value    = withDelay(340, withTiming(1,  { duration: 420 }));
    nameTY.value    = withDelay(340, withSpring(0,  { damping: 18, stiffness: 200 }));
    tagOp.value     = withDelay(580, withTiming(1,  { duration: 380 }));
    pulseOp.value   = withDelay(680, withTiming(1,  { duration: 340 }));
    dotsOp.value    = withDelay(820, withTiming(1,  { duration: 280 }));
  }, []);

  const markStyle  = useAnimatedStyle(() => ({
    transform: [{ scale: markScale.value }],
    opacity: markOp.value,
  }));
  const nameStyle  = useAnimatedStyle(() => ({
    opacity: nameOp.value,
    transform: [{ translateY: nameTY.value }],
  }));
  const tagStyle   = useAnimatedStyle(() => ({ opacity: tagOp.value }));
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseOp.value }));
  const dotsStyle  = useAnimatedStyle(() => ({ opacity: dotsOp.value }));

  return (
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={s.root}
    >
      {/* Cube mark — fixed container, no stretch. No glow/spotlight behind
          it (removed per explicit request) — the cube's own gradient faces
          already read clearly against the dark backdrop. */}
      <Animated.View style={[s.markWrap, markStyle]}>
        <AnimatedCubeMark size={MARK} />
      </Animated.View>

      {/* Wordmark */}
      <Animated.View style={[s.nameRow, nameStyle]}>
        <Text style={s.nameFamily}>Family</Text>
        <Text style={s.nameCube}>Cube</Text>
      </Animated.View>

      {/* Tagline */}
      <Animated.Text style={[s.tagline, tagStyle]}>
        Connect · Organize · Care · Grow
      </Animated.Text>

      {/* EKG pulse */}
      <Animated.View style={[s.pulseWrap, pulseStyle]}>
        <PulseStrip />
      </Animated.View>

      {/* Loading dots */}
      <Animated.View style={[s.dots, dotsStyle]}>
        <LoadingIcon kind="home"  delay={0}   />
        <LoadingIcon kind="tasks" delay={180} />
        <LoadingIcon kind="heart" delay={360} />
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
  markWrap: {
    width: MARK,
    height: MARK * 1.18,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  nameFamily: {
    fontSize: 40,
    fontWeight: '800',
    color: 'white',
    letterSpacing: -1,
  },
  nameCube: {
    fontSize: 40,
    fontWeight: '200',
    color: 'rgba(255,255,255,0.88)',
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 12,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 34,
  },
  pulseWrap: {
    marginBottom: 30,
  },
  pulseClip: {
    width: 260,
    height: EKG_H,
    overflow: 'hidden',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
});
