import { useEffect } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

// Loaded lazily (not as a static import) because expo-screen-orientation is a
// native module — if the JS dependency was installed but the app hasn't been
// rebuilt (pod install + Xcode build) to link it yet, a static import throws
// at bundle-load time and crashes the whole app before any try/catch can run.
// require() here defers that failure to first use, where it's actually caught.
let ScreenOrientation: typeof import('expo-screen-orientation') | null = null;
try {
  ScreenOrientation = require('expo-screen-orientation');
} catch {
  // Native module not linked yet — orientation lock/unlock becomes a no-op
  // below instead of crashing the app.
}

// Layout breakpoints for phone vs. any iPad/tablet-class device, which all
// get the same KioskScreen dashboard (nav rail, bigger type) rather than the
// phone Hub stretched. There is no separate mid-size 'tablet' layout — an
// earlier three-tier version (phone/tablet/kitchenHub at 1000dp) left iPads
// under 1000dp shortest side silently falling through to the plain phone
// layout, since HubScreen only ever branched on 'kitchenHub'. Collapsed back
// to two tiers so every iPad-class device actually gets the tablet UI.
// Live-reported: "on the bigger screen it is not optimized layout... I see
// similar to the mobile layout" on a standard iPad (shortest side ~810dp).
export type DeviceClass = 'phone' | 'kitchenHub';

const HUB_MIN = 700; // shortest side, dp — iPad mini and up

export function deviceClassFor(width: number, height: number): DeviceClass {
  const shortSide = Math.min(width, height);
  return shortSide >= HUB_MIN ? 'kitchenHub' : 'phone';
}

/**
 * Live device-class + orientation-unlock hook. Phones stay in whatever the
 * static app config locks them to (portrait); tablet-class devices get
 * landscape unlocked at runtime here, since Android has no static per-idiom
 * orientation split the way iOS's ~ipad Info.plist keys give us.
 */
export function useDeviceClass(): { deviceClass: DeviceClass; width: number; height: number; isWide: boolean } {
  const { width, height } = useWindowDimensions();
  const deviceClass = deviceClassFor(width, height);

  useEffect(() => {
    if (Platform.OS === 'web' || !ScreenOrientation) return;
    if (deviceClass === 'phone') {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    } else {
      ScreenOrientation.unlockAsync().catch(() => {});
    }
  }, [deviceClass]);

  return { deviceClass, width, height, isWide: width >= height };
}
