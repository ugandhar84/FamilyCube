/**
 * CubeSpinner — small rotating brand-cube loading indicator, for in-progress
 * actions (uploads, saves) where a plain ActivityIndicator feels generic.
 * Uses the same IconCubeMark SVG as the app's splash screen/branding.
 */
import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { IconCubeMark } from './FamilyCubeLogo';

export default function CubeSpinner({ size = 20 }: { size?: number }) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <IconCubeMark size={size} />
    </Animated.View>
  );
}
