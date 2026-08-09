import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Appearance } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/lib/ThemeContext';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withTiming, withSpring, withRepeat, withSequence, withDelay,
  Easing,
} from 'react-native-reanimated';
import Svg, { Ellipse, Polyline } from 'react-native-svg';

const AMBER = '#FFB347';
const TEAL  = '#1DC8BC';

// Captured at module load time — always correct before any React render
const INITIAL_IS_DARK = Appearance.getColorScheme() === 'dark';

// Fixed sizes — same on every device/ratio
const MARK = 120;
const EKG_W = 320;
const EKG_H = 34;

// ── Paw mark ─────────────────────────────────────────────────────────────────
function PawMark({ isDark }: { isDark: boolean }) {
  const toe   = 'white';
  const pad   = isDark ? 'rgba(29,200,188,0.28)' : 'rgba(255,255,255,0.92)';
  const padStroke = isDark ? 'rgba(255,255,255,0.82)' : 'none';

  return (
    <Svg width={MARK} height={MARK} viewBox="0 0 100 100">
      {/* Toe beans — ellipses rotated at their own centre */}
      <Ellipse cx={19} cy={34} rx={8} ry={10} fill={toe} transform="rotate(-20,19,34)" />
      <Ellipse cx={36} cy={25} rx={8} ry={10} fill={toe} transform="rotate(-6,36,25)"  />
      <Ellipse cx={64} cy={25} rx={8} ry={10} fill={toe} transform="rotate(6,64,25)"   />
      <Ellipse cx={81} cy={34} rx={8} ry={10} fill={toe} transform="rotate(20,81,34)"  />
      {/* Main pad */}
      <Ellipse cx={50} cy={67} rx={20} ry={18}
        fill={pad}
        stroke={padStroke}
        strokeWidth={isDark ? 2 : 0}
      />
      {/* Amber EKG line through pad */}
      <Polyline
        points="6,67 26,67 32,51 38,82 43,58 49,67 94,67"
        fill="none"
        stroke={AMBER}
        strokeWidth={4.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

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

// ── Animated loading dot ──────────────────────────────────────────────────────
function Dot({ delay }: { delay: number }) {
  const scale = useSharedValue(0.4);
  const op    = useSharedValue(0.3);
  useEffect(() => {
    scale.value = withDelay(delay, withRepeat(
      withSequence(
        withSpring(1, { damping: 6, stiffness: 300 }),
        withTiming(0.4, { duration: 380, easing: Easing.in(Easing.quad) }),
        withDelay(80, withTiming(0.4, { duration: 1 })),
      ), -1, false,
    ));
    op.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(1, { duration: 180 }),
        withTiming(0.3, { duration: 380 }),
        withDelay(80, withTiming(0.3, { duration: 1 })),
      ), -1, false,
    ));
  }, []);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: op.value,
  }));
  return <Animated.View style={[s.dot, style]} />;
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function PawBondSplashScreen() {
  const { isDark } = useTheme();

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
      {/* Soft glow behind mark */}
      <View style={s.glow} />

      {/* Paw mark — fixed container, no stretch */}
      <Animated.View style={[s.markWrap, markStyle]}>
        <PawMark isDark={isDark} />
      </Animated.View>

      {/* Wordmark */}
      <Animated.View style={[s.nameRow, nameStyle]}>
        <Text style={s.namePaw}>Paw</Text>
        <Text style={s.nameBond}>Bond</Text>
      </Animated.View>

      {/* Tagline */}
      <Animated.Text style={[s.tagline, tagStyle]}>
        Your Pet's Best Bond
      </Animated.Text>

      {/* EKG pulse */}
      <Animated.View style={[s.pulseWrap, pulseStyle]}>
        <PulseStrip />
      </Animated.View>

      {/* Loading dots */}
      <Animated.View style={[s.dots, dotsStyle]}>
        <Dot delay={0}   />
        <Dot delay={180} />
        <Dot delay={360} />
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
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.05)',
    top: '32%',
    alignSelf: 'center',
  },
  markWrap: {
    width: MARK,
    height: MARK,
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
  namePaw: {
    fontSize: 48,
    fontWeight: '800',
    color: 'white',
    letterSpacing: -1.5,
  },
  nameBond: {
    fontSize: 48,
    fontWeight: '200',
    color: 'rgba(255,255,255,0.88)',
    letterSpacing: -1.5,
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
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
});
