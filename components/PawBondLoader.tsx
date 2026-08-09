/**
 * PawBondLoader — animated PawBond logo + loading bars.
 * Drop-in loading indicator used throughout the app.
 *
 * Usage:
 *   <PawBondLoader />                   // default 48px, with bars
 *   <PawBondLoader size={72} />
 *   <PawBondLoader size={32} bars={false} />  // logo only
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
import PawBondLogo from './PawBondLogo';

const PLUM  = '#6B2FD4';
const TEAL  = '#1DC8BC';
const AMBER = '#FFB347';

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

export default function PawBondLoader({ size = 48, bars = true, isDark = false }: Props) {
  return (
    <View style={{ alignItems: 'center', alignSelf: 'center', gap: 10 }}>
      <PawBondLogo size={size} animated isDark={isDark} />
      {bars && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Bar color={PLUM}  delay={0}   />
          <Bar color={TEAL}  delay={180} />
          <Bar color={AMBER} delay={360} />
        </View>
      )}
    </View>
  );
}
