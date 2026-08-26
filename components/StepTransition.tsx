import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing } from 'react-native';

/**
 * StepTransition — wraps a multi-step form's current step content so
 * switching steps crossfades + slides instead of an instant swap. Direction
 * (forward = slide in from the right, back = slide in from the left) is
 * inferred by comparing stepKey against the previously rendered one, so
 * callers don't need to track/pass direction explicitly.
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
    Animated.timing(anim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
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
