import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing } from 'react-native';

/**
 * StepTransition — wraps a multi-step form's current step content so
 * switching steps crossfades + slides instead of an instant swap. Direction
 * (forward = slide in from the right, back = slide in from the left) is
 * inferred by comparing stepKey against the previously rendered one, so
 * callers don't need to track/pass direction explicitly.
 *
 * Live-reported: a TextInput's placeholder inside a freshly-mounted step
 * (e.g. HelperAssignmentSection's "Or type name…" field) intermittently
 * rendered with letters spread across the full input width — self-
 * correcting a moment later. Root cause: the new step's children mounted
 * in the SAME tick the native-driven transform animation below started,
 * so iOS briefly laid out the TextInput's placeholder while its ancestor
 * view was mid-transform (a known RN+iOS class of bug — text layout can
 * momentarily measure against a stale/intermediate transform state under
 * useNativeDriver). Deferring the mount one frame (via
 * requestAnimationFrame) so new content's first real layout pass happens
 * BEFORE the transform starts, rather than during it, avoids the race
 * without giving up the native-driven animation's performance.
 */
export default function StepTransition({ stepKey, children }: { stepKey: string | number; children: ReactNode }) {
  const [displayed, setDisplayed] = useState(children);
  const [slideFrom, setSlideFrom] = useState(14);
  const prevKey = useRef(stepKey);
  const anim = useRef(new Animated.Value(1)).current; // 1 = fully settled

  useEffect(() => {
    if (prevKey.current === stepKey) {
      // Same step re-rendering with new children (e.g. form field edits) —
      // just keep showing the latest content, no re-animation.
      setDisplayed(children);
      return;
    }
    const forward = String(stepKey) > String(prevKey.current);
    prevKey.current = stepKey;
    setSlideFrom(forward ? 14 : -14);
    setDisplayed(children);
    anim.setValue(0);
    // Mount the new content this tick (so it appears immediately, no blank
    // flash), but wait one frame — letting it lay out once at rest — before
    // starting the transform that would otherwise race with that layout.
    const raf = requestAnimationFrame(() => {
      Animated.timing(anim, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey, children]);

  return (
    <Animated.View style={{
      opacity: anim,
      transform: [{
        translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [slideFrom, 0] }),
      }],
    }}>
      {displayed}
    </Animated.View>
  );
}
