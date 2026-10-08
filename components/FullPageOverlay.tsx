import { useEffect } from 'react';
import { View, StyleSheet, BackHandler, Platform } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS } from 'react-native-reanimated';

// Full-page overlay that slides up over the current screen.
// Supports back-swipe (left-edge pan) and Android back button to dismiss.

export default function FullPageOverlay({
  visible, onDismiss, zIndex = 40, children,
}: {
  visible: boolean;
  onDismiss: () => void;
  zIndex?: number;
  children: React.ReactNode;
}) {
  const translateX = useSharedValue(visible ? 0 : 400);

  useEffect(() => {
    translateX.value = withSpring(visible ? 0 : 400, { damping: 26, stiffness: 220 });
  }, [visible]);

  // Android hardware back button
  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onDismiss();
      return true;
    });
    return () => sub.remove();
  }, [visible, onDismiss]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Left-edge swipe-back gesture
  const swipe = Gesture.Pan()
    .activeOffsetX(10)
    .failOffsetY([-10, 10])
    .onUpdate(e => {
      if (e.translationX > 0) translateX.value = e.translationX;
    })
    .onEnd(e => {
      if (e.translationX > 100 || e.velocityX > 600) {
        translateX.value = withTiming(400, { duration: 220 });
        runOnJS(onDismiss)();
      } else {
        translateX.value = withSpring(0, { damping: 26, stiffness: 220 });
      }
    });

  if (!visible && translateX.value >= 400) return null;

  return (
    <GestureDetector gesture={swipe}>
      <Animated.View style={[StyleSheet.absoluteFillObject, { zIndex }, animStyle]}>
        <View style={StyleSheet.absoluteFillObject}>
          {children}
        </View>
      </Animated.View>
    </GestureDetector>
  );
}
