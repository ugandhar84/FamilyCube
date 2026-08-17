import { useEffect } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

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
    if (Platform.OS === 'web') return;
    if (deviceClass === 'phone') {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    } else {
      ScreenOrientation.unlockAsync().catch(() => {});
    }
  }, [deviceClass]);

  return { deviceClass, width, height, isWide: width >= height };
}
