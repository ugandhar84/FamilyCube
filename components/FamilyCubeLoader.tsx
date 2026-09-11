/**
 * FamilyCubeLoader — animated Family Cube logo + loading bars.
 * Drop-in loading indicator used throughout the app. Name kept for the ~50
 * existing call sites (import path unchanged); the mark itself is the real
 * FamilyCubeLogo cube, not the old PawBond paw icon.
 *
 * Usage:
 *   <FamilyCubeLoader />                   // default 48px, with bars
 *   <FamilyCubeLoader size={72} />
 *   <FamilyCubeLoader size={32} bars={false} />  // logo only
 */
import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { IconCubeMark, BRAND } from './FamilyCubeLogo';

interface Props {
  size?: number;
  bars?: boolean;
  isDark?: boolean;
}

function Bar({ color, delay }: { color: string; delay: number }) {
  const scaleY = useSharedValue(0.35);
  const op     = useSharedValue(0.4);

  useEffect(() => {
    scaleY.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) }),
        withTiming(0.35, { duration: 300, easing: Easing.in(Easing.quad) }),
        withDelay(60, withTiming(0.35, { duration: 1 })),
      ), -1, false,
    ));
    op.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(1, { duration: 280 }),
        withTiming(0.4, { duration: 280 }),
        withDelay(60, withTiming(0.4, { duration: 1 })),
      ), -1, false,
    ));
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scaleY: scaleY.value }],
    opacity: op.value,
  }));

  return (
    <Animated.View style={[{ width: 4, height: 22, borderRadius: 2, backgroundColor: color }, style]} />
  );
}

// IconCubeMark, not CubeMark — CubeMark's top face is pink, which
// diverges from every other cube-mark call site in the app (splash
// screen, paywall, AppHeader, lock/login/signup screens all use
// IconCubeMark's amber-top palette) [live-reported: "Brand name styles
// colors should be identical to the splash screen wherever we refer...
// I see cube letter has many colors"]. Static mark (no built-in
// animation, unlike the old PawBondLogo's `animated` prop) — a gentle
// pulse here keeps this reading as "loading" rather than a frozen icon.
function PulsingCube({ size }: { size: number }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 550, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 550, easing: Easing.inOut(Easing.quad) }),
      ), -1, false,
    );
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={style}>
      <IconCubeMark size={size} />
    </Animated.View>
  );
}

export default function FamilyCubeLoader({ size = 48, bars = true, isDark = false }: Props) {
  return (
    <View style={{ alignItems: 'center', alignSelf: 'center', gap: 10 }}>
      <PulsingCube size={size} />
      {bars && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {/* Was a disconnected third palette (plum/teal/amber hex
              literals matching neither BRAND nor constants/colors.ts) —
              now the same three real brand hues the cube mark itself
              uses, so the loading bars read as part of the same mark
              rather than a mismatched accessory. */}
          <Bar color={BRAND.purple} delay={0}   />
          <Bar color={BRAND.teal}   delay={180} />
          <Bar color={BRAND.amber}  delay={360} />
        </View>
      )}
    </View>
  );
}
