import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, interpolate, Extrapolation, runOnJS,
} from 'react-native-reanimated';
import { SWIPE_REPLY_THRESHOLD, SWIPE_MAX_RIGHT, SWIPE_MAX_LEFT } from './constants';

// ─── Swipeable message bubble ─────────────────────────────────────────────────
// Right swipe → reply (snappy: fires at 56px, snaps back instantly)
// Left swipe  → reveal timestamp (capped at -52px, snaps back on release)
//
// Rewritten off PanResponder (JS-thread gesture recognition — every touch
// move round-tripped through the bridge before translateX updated, the
// actual source of the swipe feeling laggy/flickery next to WhatsApp's own
// native-thread-driven gesture) onto react-native-gesture-handler +
// Reanimated, both already dependencies elsewhere in the app. The pan
// gesture, its worklet, and the resulting transform now run entirely on
// the UI thread — same mechanism WhatsApp's own swipe-to-reply uses — so
// there's no per-frame JS bridge hop between finger movement and the
// bubble visually following it.

export function SwipeableBubble({ children, onSwipeRight, timeNode }: {
  children: React.ReactNode; onSwipeRight: () => void; timeNode: React.ReactNode;
}) {
  const translateX = useSharedValue(0);
  const fired = useSharedValue(false);

  const fireReply = () => onSwipeRight();

  const pan = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .failOffsetY([-8, 8])
    .onBegin(() => {
      fired.value = false;
    })
    .onUpdate(e => {
      const dx = e.translationX;
      if (dx > 0) {
        const capped = Math.min(dx, SWIPE_MAX_RIGHT);
        const damped = capped < SWIPE_REPLY_THRESHOLD
          ? capped
          : SWIPE_REPLY_THRESHOLD + Math.sqrt(capped - SWIPE_REPLY_THRESHOLD) * 3;
        translateX.value = Math.min(damped, SWIPE_MAX_RIGHT);

        if (dx >= SWIPE_REPLY_THRESHOLD && !fired.value) {
          fired.value = true;
          runOnJS(fireReply)();
        }
      } else {
        translateX.value = Math.max(dx, SWIPE_MAX_LEFT);
      }
    })
    .onFinalize(() => {
      translateX.value = withSpring(0, { damping: 22, stiffness: 420, mass: 0.6 });
    });

  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  const timeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [SWIPE_MAX_LEFT, -12, 0], [1, 0.4, 0], Extrapolation.CLAMP),
    transform: [{
      translateX: interpolate(translateX.value, [SWIPE_MAX_LEFT, 0], [0, 14], Extrapolation.CLAMP),
    }],
  }));

  return (
    <Animated.View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ flex: 1 }, bubbleStyle]}>
          {children}
        </Animated.View>
      </GestureDetector>
      {/* Timestamp revealed on left-swipe */}
      <Animated.View style={[{ position: 'absolute', right: 4 }, timeStyle]} pointerEvents="none">
        {timeNode}
      </Animated.View>
    </Animated.View>
  );
}
