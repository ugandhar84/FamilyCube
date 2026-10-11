import { Animated } from 'react-native';

// Shared Animated.Value: 1 = visible, 0 = hidden
export const tabBarAnim = new Animated.Value(1);
let _visible = true;
// Reference count, not a plain boolean — a cold-boot race could otherwise
// leave the bar stuck hidden forever: a notification-driven overlay flag
// (grocery/memories/rewards) can call hideTabBar() from HubScreen's very
// first effect pass, interleaved with CustomTabBar's own mount-time
// showTabBar() in app/(tabs)/_layout.tsx, with no guaranteed ordering
// between the two. Whichever fired last "won" under the old plain-boolean
// setters, and nothing else ever re-asserted visibility until the user
// manually switched tabs [live-reported: "bottom nav is not showing" on
// cold app startup, never on normal navigation back from an overlay screen
// — because THAT path always pairs its hide with a guaranteed unmount
// showTabBar()]. Counting hide requests means show only wins once every
// requester has released, and forceShowTabBar() lets a definite "the tab
// bar shell just mounted" signal hard-reset the count instead of racing it.
let _hideCount = 0;

export function hideTabBar() {
  _hideCount++;
  if (!_visible) return;
  _visible = false;
  Animated.timing(tabBarAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start();
}

export function showTabBar() {
  _hideCount = Math.max(0, _hideCount - 1);
  if (_hideCount > 0) return;
  if (_visible) return;
  _visible = true;
  Animated.timing(tabBarAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
}

// Hard reset — used only by CustomTabBar's own mount effect to guarantee
// the bar is visible the instant the tab shell itself has actually
// rendered, regardless of how many hideTabBar() calls raced in before it.
export function forceShowTabBar() {
  _hideCount = 0;
  _visible = true;
  Animated.timing(tabBarAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
}
