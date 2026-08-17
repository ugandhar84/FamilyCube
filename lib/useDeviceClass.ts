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

// Layout breakpoints for phone / tablet / a large wall-mounted "kitchen hub"
// display (an iPad or Android tablet mounted on a fridge, viewed from a few
// feet away — same device class as tablet, but wide enough to want a
// noticeably bigger type scale, not just more columns).
export type DeviceClass = 'phone' | 'tablet' | 'kitchenHub';

const TABLET_MIN = 700;   // shortest side, dp — iPad mini and up
const HUB_MIN     = 1000; // shortest side, dp — full-size iPad landscape and up

export function deviceClassFor(width: number, height: number): DeviceClass {
  const shortSide = Math.min(width, height);
  if (shortSide >= HUB_MIN) return 'kitchenHub';
  if (shortSide >= TABLET_MIN) return 'tablet';
  return 'phone';
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
