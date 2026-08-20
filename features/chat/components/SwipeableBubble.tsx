import { useRef } from 'react';
import { View, Animated, PanResponder } from 'react-native';
import { SWIPE_REPLY_THRESHOLD, SWIPE_MAX_RIGHT, SWIPE_MAX_LEFT } from './constants';

// ─── Swipeable message bubble ─────────────────────────────────────────────────
// Right swipe → reply (snappy: fires at 56px, snaps back instantly)
// Left swipe  → reveal timestamp (capped at -52px, snaps back on release)

export function SwipeableBubble({ children, onSwipeRight, timeNode }: {
  children: React.ReactNode; onSwipeRight: () => void; timeNode: React.ReactNode;
}) {
  const translateX  = useRef(new Animated.Value(0)).current;
  const firedRef    = useRef(false);
  const activeRef   = useRef(false);

  const snapBack = () =>
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, speed: 40, bounciness: 0 }).start();

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) =>
      Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,

    onPanResponderGrant: () => {
      firedRef.current  = false;
      activeRef.current = true;
      translateX.stopAnimation();
    },

    onPanResponderMove: (_, g) => {
      if (!activeRef.current) return;
      if (g.dx > 0) {
        // Right swipe — apply sqrt damping so it feels resistive past threshold
        const capped = Math.min(g.dx, SWIPE_MAX_RIGHT);
        const damped = capped < SWIPE_REPLY_THRESHOLD
          ? capped
          : SWIPE_REPLY_THRESHOLD + Math.sqrt(capped - SWIPE_REPLY_THRESHOLD) * 3;
        translateX.setValue(Math.min(damped, SWIPE_MAX_RIGHT));

        // Fire reply the instant threshold is crossed (haptic feel)
        if (g.dx >= SWIPE_REPLY_THRESHOLD && !firedRef.current) {
          firedRef.current = true;
          onSwipeRight();
        }
      } else {
        // Left swipe — reveal timestamp, hard cap
        translateX.setValue(Math.max(g.dx, SWIPE_MAX_LEFT));
      }
    },

    onPanResponderRelease: () => {
      activeRef.current = false;
      snapBack();
    },
    onPanResponderTerminate: () => {
      activeRef.current = false;
      snapBack();
    },
  })).current;

  // time pill opacity/slide driven by left-swipe (negative translateX)
  const timeOpacity = translateX.interpolate({ inputRange: [SWIPE_MAX_LEFT, -12, 0], outputRange: [1, 0.4, 0], extrapolate: 'clamp' });
  const timeSlide   = translateX.interpolate({ inputRange: [SWIPE_MAX_LEFT, 0], outputRange: [0, 14], extrapolate: 'clamp' });

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Animated.View style={{ transform: [{ translateX }], flex: 1 }} {...panResponder.panHandlers}>
        {children}
      </Animated.View>
      {/* Timestamp revealed on left-swipe */}
      <Animated.View style={{ position: 'absolute', right: 4, opacity: timeOpacity, transform: [{ translateX: timeSlide }], pointerEvents: 'none' }}>
        {timeNode}
      </Animated.View>
    </View>
  );
}
