import { useCallback, useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useNavigation } from 'expo-router';

/**
 * Staggered entrance animation hook — plays on first mount and on tab-switch,
 * but NOT when returning from a pushed subpage (avoids the glitch where cards
 * flash back to opacity 0 mid-animation on back-navigation).
 *
 * Returns an array of { opacity, translateY } Animated.Values, one per item.
 * Each is already started; wire them into your card's style.
 */
export function useStaggeredEntrance(count: number, options?: {
  delay?: number;       // base delay before first card (default 40ms)
  stagger?: number;     // per-card stagger offset (default 55ms)
  duration?: number;    // animation duration per card (default 280ms)
  slideFrom?: number;   // initial translateY (default 20)
}) {
  const {
    delay = 40,
    stagger = 55,
    duration = 280,
    slideFrom = 20,
  } = options ?? {};

  const opacities = useRef(
    Array.from({ length: count }, () => new Animated.Value(0))
  ).current;
  const translateYs = useRef(
    Array.from({ length: count }, () => new Animated.Value(slideFrom))
  ).current;

  const navigation = useNavigation();
  const isSubpageActive = useRef(false);

  const play = useCallback(() => {
    opacities.forEach(v => v.setValue(0));
    translateYs.forEach(v => v.setValue(slideFrom));

    const animations = opacities.map((op, i) =>
      Animated.parallel([
        Animated.timing(op, {
          toValue: 1, duration, delay: delay + i * stagger,
          easing: Easing.out(Easing.quad), useNativeDriver: true,
        }),
        Animated.timing(translateYs[i], {
          toValue: 0, duration: duration + 20, delay: delay + i * stagger,
          easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }),
      ])
    );
    Animated.parallel(animations).start();
  }, [count, delay, stagger, duration, slideFrom]);

  const showImmediate = useCallback(() => {
    opacities.forEach(v => v.setValue(1));
    translateYs.forEach(v => v.setValue(0));
  }, []);

  // Track subpage pushes so we skip re-animation on pop
  useEffect(() => {
    const unsub = (navigation as any).addListener?.('blur', () => {
      const state = (navigation as any).getState?.();
      if (state && state.index > 0) {
        isSubpageActive.current = true;
      }
    });
    // First mount — play immediately
    play();
    return () => unsub?.();
  }, []);

  useFocusEffect(useCallback(() => {
    if (isSubpageActive.current) {
      isSubpageActive.current = false;
      showImmediate();
      return;
    }
    play();
  }, [play, showImmediate]));

  return opacities.map((opacity, i) => ({
    opacity,
    translateY: translateYs[i],
  }));
}
