/**
 * FullPageOverlay — wraps a screen that isn't a real RN <Modal> so it gets
 * the same full-page treatment as one: slide-in-from-right entrance
 * (matching iOS's native push), edge-swipe-to-dismiss (SwipeBackWrapper,
 * which already slides OUT to the right on dismiss — this entrance now
 * mirrors that direction instead of the previous vertical slide-up
 * [live-requested: "page form opening close slide in slide out right"]),
 * and absolute-positioned stacking above whatever's mounted underneath it.
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
  children: React.ReactNode;
}) {
  const slideAnim = useRef(new Animated.Value(visible ? 0 : SCREEN_W)).current;
  const fadeAnim  = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(SCREEN_W);
      fadeAnim.setValue(0);
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(fadeAnim,  { toValue: 1, duration: 220, easing: Easing.out(Easing.quad),  useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex }}>
      <SwipeBackWrapper onDismiss={onDismiss}>
        <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateX: slideAnim }] }}>
          {children}
        </Animated.View>
      </SwipeBackWrapper>
    </View>
  );
}
