/**
 * AnimatedPressable — a Pressable that scales down + fades slightly on
 * press, springing back on release. Gives buttons real tactile feedback
 * instead of a plain color-swap or nothing at all — user feedback: "Confirm
 * button is not like elevated or show available for click before I click,
 * confusing."
 *
 * Drop-in replacement for Pressable — same props, same onPress timing (the
 * animation is purely visual, it doesn't delay or gate the actual action).
 */
import { type ReactNode } from 'react';
import { type StyleProp, type ViewStyle, type PressableProps } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Pressable } from 'react-native';

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

const PRESS_SCALE = 0.95;
const SPRING_CONFIG = { damping: 15, stiffness: 300 };

export function AnimatedPressable({ style, children, onPressIn, onPressOut, ...rest }: PressableProps & {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <AnimatedPressableBase
      style={[style, animatedStyle]}
      onPressIn={(e) => {
        scale.value = withSpring(PRESS_SCALE, SPRING_CONFIG);
        opacity.value = withSpring(0.7, SPRING_CONFIG);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, SPRING_CONFIG);
        opacity.value = withSpring(1, SPRING_CONFIG);
        onPressOut?.(e);
      }}
      {...rest}>
      {children}
    </AnimatedPressableBase>
  );
}
