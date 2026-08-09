import { Animated } from 'react-native';

// Shared Animated.Value: 1 = visible, 0 = hidden
export const tabBarAnim = new Animated.Value(1);
let _visible = true;

export function hideTabBar() {
  if (!_visible) return;
  _visible = false;
  Animated.timing(tabBarAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
}

export function showTabBar() {
  if (_visible) return;
  _visible = true;
  Animated.timing(tabBarAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
}
