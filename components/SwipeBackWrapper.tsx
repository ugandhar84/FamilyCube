/**
 * SwipeBackWrapper — iOS-native-feeling edge-swipe-to-dismiss for full-page
 * screens that aren't presented through a real RN <Modal> (so they get none
 * of iOS's native interactive pop gesture for free), plus the two that ARE
 * Modal-wrapped but use presentationStyle="fullScreen" — RN's Modal only
 * gives you that gesture for "pageSheet", never for "fullScreen".
 *
 * Drag must start within EDGE_WIDTH of the left screen edge (mirrors iOS's
 * own back-swipe hitbox) so it never fights horizontal scroll content
 * already inside these forms (date chip rows, category pills, etc).
 * Content follows the finger 1:1; release past DISMISS_THRESHOLD commits
 * with a quick slide-out, anything short snaps back.
 */
import React, { useRef } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle, useSharedValue, withSpring, withTiming, runOnJS,
} from 'react-native-reanimated';

const { width: SCREEN_W } = Dimensions.get('window');
const EDGE_WIDTH = 24;
const DISMISS_THRESHOLD = SCREEN_W * 0.3;

export default function SwipeBackWrapper({
  onDismiss, children, disabled,
}: {
  onDismiss: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const translateX = useSharedValue(0);
  // Avoids a double-fire if the gesture's onEnd and a fast re-tap both
  // trigger dismissal in the same frame.
  const dismissed = useRef(false);

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .activeOffsetX([-1000, 10])
    .failOffsetY([-20, 20])
    .onUpdate((e) => {
      'worklet';
      // e.x is the finger's CURRENT position; subtracting how far it's
      // already travelled gives the position where the drag actually
      // started — only follow the finger if that start point was within
      // the edge hitbox, same check iOS's own back-swipe recognizer makes.
      const startX = e.x - e.translationX;
      if (startX > EDGE_WIDTH) return;
      translateX.value = Math.max(0, e.translationX);
    })
    .onEnd((e) => {
      'worklet';
      const shouldDismiss = translateX.value > DISMISS_THRESHOLD || e.velocityX > 800;
      if (shouldDismiss) {
        translateX.value = withTiming(SCREEN_W, { duration: 220 }, (finished) => {
          if (finished && !dismissed.current) {
            dismissed.current = true;
            runOnJS(onDismiss)();
          }
        });
      } else {
        translateX.value = withSpring(0, { damping: 22, stiffness: 260 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
