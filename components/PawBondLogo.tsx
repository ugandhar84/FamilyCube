/**
 * PawBondLogo — Aurora gradient square + animated paw toes + EKG draw.
 *
 * Animation (loops ~2.8s):
 *   • Each toe: Animated.View scale spring, staggered 180ms
 *   • Main pad: subtle scale pulse on 4th toe beat
 *   • EKG line: strokeDashoffset draws left→right (numeric — no cast issue)
 */
import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import Svg, {
  Ellipse, Circle, Polyline, Rect,
  Defs, LinearGradient, Stop,
} from 'react-native-svg';

interface Props {
  size?: number;
  animated?: boolean;
  isDark?: boolean;
}

const EKG_LEN  = 140;  // approximate polyline length in viewBox units
const CYCLE    = 2800;
const TOE_STAG = 180;
const TOE_VB   = 24;   // viewBox half-size for each toe container

const AnimatedPolyline = Animated.createAnimatedComponent(Polyline);

// ── Animated toe — bounces UP then returns, no scale so no overlap ───────────
function AnimToe({
  size, vcx, vcy, rx, ry, rot, fill, delay,
}: {
  size: number; vcx: number; vcy: number;
  rx: number; ry: number; rot: number;
  fill: string; delay: number;
}) {
  const sc   = size / 100;
  const pw   = TOE_VB * sc;
  const bump = size * 0.06; // bounce height — 6% of icon size

  const ty = useSharedValue(0);
  useEffect(() => {
    ty.value = withDelay(delay, withRepeat(
      withSequence(
        withSpring(-bump, { damping: 6, stiffness: 380, mass: 0.4 }),
        withSpring(0,     { damping: 8, stiffness: 300 }),
        withDelay(CYCLE - delay - 400, withTiming(0, { duration: 1 })),
      ),
      -1, false,
    ));
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: ty.value }],
  }));

  return (
    <Animated.View style={[{
      position: 'absolute',
      left:   (vcx - TOE_VB / 2) * sc,
      top:    (vcy - TOE_VB / 2) * sc,
      width:  pw,
      height: pw,
    }, style]}>
      <Svg width={pw} height={pw}
        viewBox={`${-TOE_VB / 2} ${-TOE_VB / 2} ${TOE_VB} ${TOE_VB}`}>
        <Ellipse cx={0} cy={0} rx={rx} ry={ry}
          transform={`rotate(${rot})`} fill={fill} />
      </Svg>
    </Animated.View>
  );
}

// ── Animated main pad ─────────────────────────────────────────────────────────
function AnimPad({ size, fill }: { size: number; fill: string }) {
  const sc  = size / 100;
  const PAD = 40; // viewBox container size for pad (needs room for scale)

  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withDelay(TOE_STAG * 4, withRepeat(
      withSequence(
        withSpring(1.1,  { damping: 8, stiffness: 320 }),
        withTiming(1,    { duration: 200, easing: Easing.out(Easing.quad) }),
        withDelay(CYCLE - TOE_STAG * 4 - 400, withTiming(1, { duration: 1 })),
      ),
      -1, false,
    ));
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const pw = PAD * sc;
  return (
    <Animated.View style={[{
      position: 'absolute',
      left:   (50 - PAD / 2) * sc,
      top:    (64 - PAD / 2) * sc,
      width:  pw,
      height: pw,
    }, style]}>
      <Svg width={pw} height={pw}
        viewBox={`${-PAD / 2} ${-PAD / 2} ${PAD} ${PAD}`}>
        <Circle cx={0} cy={0} r={18} fill={fill} />
      </Svg>
    </Animated.View>
  );
}

// ── EKG draw animation — strokeDashoffset is numeric, no cast issue ───────────
function AnimEKG({ size }: { size: number }) {
  const offset = useSharedValue(EKG_LEN);

  useEffect(() => {
    offset.value = withDelay(TOE_STAG * 4 + 80, withRepeat(
      withSequence(
        withTiming(0, { duration: 620, easing: Easing.out(Easing.cubic) }),
        withDelay(480, withTiming(EKG_LEN, { duration: 0 })),
        withDelay(CYCLE - TOE_STAG * 4 - 80 - 620 - 480, withTiming(EKG_LEN, { duration: 1 })),
      ),
      -1, false,
    ));
  }, []);

  const ekgProps = useAnimatedProps(() => ({
    strokeDashoffset: offset.value,
  }));

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100"
      style={{ position: 'absolute', top: 0, left: 0 }}>
      <AnimatedPolyline
        animatedProps={ekgProps}
        points="6,64 26,64 32,50 38,77 43,57 49,64 94,64"
        fill="none"
        stroke="#FFB347"
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={[EKG_LEN, EKG_LEN]}
      />
    </Svg>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function PawBondLogo({ size = 88, animated = false, isDark = false }: Props) {
  const cornerR  = 22.5;
  const fill     = 'white';
  // Dark mode: deepen the gradient so the icon pops on dark surfaces
  const gradStop0 = isDark ? '#4A1FA8' : '#6B2FD4';
  const gradStop1 = isDark ? '#0FA8A2' : '#1DC8BC';

  return (
    <View style={{ width: size, height: size, alignSelf: 'center' }}>
      {/* Static base: gradient bg + static toes + main pad + static EKG */}
      <Svg width={size} height={size} viewBox="0 0 100 100"
        style={{ position: 'absolute', top: 0, left: 0 }}>
        <Defs>
          <LinearGradient id="pawbg" x1="0" y1="0" x2="100" y2="100"
            gradientUnits="userSpaceOnUse">
            <Stop offset="0%" stopColor={gradStop0} />
            <Stop offset="100%" stopColor={gradStop1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" rx={cornerR} fill="url(#pawbg)" />

        {/* Static toes (hidden when animated — the Animated.Views take over) */}
        {!animated && (
          <>
            <Ellipse cx={0} cy={0} rx={7}   ry={5.5} transform="translate(22, 34) rotate(-22)" fill={fill} />
            <Ellipse cx={0} cy={0} rx={6.5} ry={5}   transform="translate(36, 26) rotate(-8)"  fill={fill} />
            <Ellipse cx={0} cy={0} rx={6.5} ry={5}   transform="translate(64, 26) rotate(8)"   fill={fill} />
            <Ellipse cx={0} cy={0} rx={7}   ry={5.5} transform="translate(78, 34) rotate(22)"  fill={fill} />
            <Circle cx={50} cy={64} r={18} fill={fill} />
            <Polyline
              points="6,64 26,64 32,50 38,77 43,57 49,64 94,64"
              fill="none" stroke="#FFB347" strokeWidth={3.5}
              strokeLinecap="round" strokeLinejoin="round"
            />
          </>
        )}
      </Svg>

      {/* Animated layers (only rendered when animated=true) */}
      {animated && (
        <>
          <AnimToe size={size} vcx={22} vcy={34} rx={7}   ry={5.5} rot={-22} fill={fill} delay={0} />
          <AnimToe size={size} vcx={36} vcy={26} rx={6.5} ry={5}   rot={-8}  fill={fill} delay={TOE_STAG} />
          <AnimToe size={size} vcx={64} vcy={26} rx={6.5} ry={5}   rot={8}   fill={fill} delay={TOE_STAG * 2} />
          <AnimToe size={size} vcx={78} vcy={34} rx={7}   ry={5.5} rot={22}  fill={fill} delay={TOE_STAG * 3} />
          <AnimPad size={size} fill={fill} />
          <AnimEKG size={size} />
        </>
      )}
    </View>
  );
}
