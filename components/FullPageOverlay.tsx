/**
 * FullPageOverlay — wraps a screen that isn't a real RN <Modal> so it gets
 * the same full-page treatment as one: slide-in-from-right entrance
 * (matching iOS's native push), edge-swipe-to-dismiss (SwipeBackWrapper,
 * which already slides OUT to the right on dismiss — this entrance now
 * mirrors that direction instead of the previous vertical slide-up
 * [live-requested: "page form opening close slide in slide out right"]),
 * and absolute-positioned stacking above whatever's mounted underneath it.
 *
 * A programmatic close (an in-screen "✕"/close-icon button calling its own
 * onClose prop, as opposed to the user's edge-swipe gesture) used to skip
 * the slide-out animation entirely — onDismiss only animated when
 * SwipeBackWrapper's own gesture drove it; calling onDismiss directly just
 * flipped the parent's `visible` state to false and the screen vanished
 * with no animation at all [live-requested: "When I say overlay icon to
 * close the map it should close with animation where page is closing
 * down"]. requestAnimatedClose() (passed to children as a render-prop)
 * now plays the same slide-out-to-the-right animation before calling
 * onDismiss, so every close path — swipe or tap — looks identical.
 *
 * Extracted from the pattern JustDescribeItScreen/JustDescribeItEventScreen
 * each hand-rolled (slideAnim/fadeAnim + SwipeBackWrapper + Animated.View)
 * so a growing stack of full-page screens (Review inbox → chore detail →
 * …) doesn't re-duplicate that boilerplate per screen. Each layer gets its
 * own zIndex (pass a higher one for screens stacked on top of another
 * full-page screen) so React Native's paint order stacks them correctly —
 * siblings in a plain View have no other stacking guarantee.
 */
import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, Dimensions } from 'react-native';
import SwipeBackWrapper from './SwipeBackWrapper';

const { width: SCREEN_W } = Dimensions.get('window');

export default function FullPageOverlay({
  visible, onDismiss, zIndex = 50, children,
}: {
  visible: boolean;
  onDismiss: () => void;
  zIndex?: number;
  /** Plain ReactNode (as before), OR a render-prop
   *  `(requestAnimatedClose: () => void) => ReactNode` — pass a function
   *  when the screen has its own close/back icon button and wants it to
   *  play the same slide-out animation the edge-swipe gesture already
   *  does, instead of calling onDismiss (prop) directly and vanishing
   *  instantly. */
  children: React.ReactNode | ((requestAnimatedClose: () => void) => React.ReactNode);
}) {
  const slideAnim = useRef(new Animated.Value(visible ? 0 : SCREEN_W)).current;
  const fadeAnim  = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const closing   = useRef(false);

  useEffect(() => {
    if (visible) {
      closing.current = false;
      slideAnim.setValue(SCREEN_W);
      fadeAnim.setValue(0);
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(fadeAnim,  { toValue: 1, duration: 220, easing: Easing.out(Easing.quad),  useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const requestAnimatedClose = () => {
    if (closing.current) return;
    closing.current = true;
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: SCREEN_W, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 0,         duration: 200, easing: Easing.in(Easing.quad),  useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) onDismiss(); });
  };

  if (!visible) return null;

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex }}>
      <SwipeBackWrapper onDismiss={onDismiss}>
        <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateX: slideAnim }] }}>
          {typeof children === 'function' ? children(requestAnimatedClose) : children}
        </Animated.View>
      </SwipeBackWrapper>
    </View>
  );
}
