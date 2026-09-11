import { useMemo } from 'react';
import { useDeviceClass, type DeviceClass } from '@/lib/useDeviceClass';

export interface AuthScale {
  deviceClass: DeviceClass;
  isTablet: boolean;
  font: number;     // fontSize multiplier
  space: number;    // margin/padding/gap multiplier
  control: number;  // button/input/PIN-key sizing multiplier
  maxWidth: number; // recommended centered-content width, dp
}

const PHONE_SCALE: AuthScale = {
  deviceClass: 'phone', isTablet: false,
  font: 1, space: 1, control: 1, maxWidth: 420,
};

const TABLET_SCALE: AuthScale = {
  deviceClass: 'kitchenHub', isTablet: true,
  font: 1.15, space: 1.3, control: 1.25, maxWidth: 560,
};

/**
 * Scaling multipliers for the auth/onboarding/profile-creation screens on
 * iPad ('kitchenHub' device class) vs. phone. Deliberately three separate
 * multipliers (not one blanket value) so buttons/PIN keys can grow more
 * than body text — that's what makes the tablet layout read as
 * intentionally chunky rather than just a phone screen stretched wide.
 *
 * Reuses useDeviceClass() (not the side-effect-free deviceClassFor) so its
 * orientation-unlock side effect applies here too — iPad is allowed to
 * rotate freely on these screens, same as everywhere else 'kitchenHub'
 * devices are detected.
 *
 * On phone every multiplier is 1 and maxWidth is 420 (already the literal
 * hardcoded in LoginScreen.tsx today) — any style written as
 * `LITERAL * scale.x` evaluates to exactly today's literal on phone.
 */
export function useAuthScale(): AuthScale {
  const { deviceClass } = useDeviceClass();
  return useMemo(() => (deviceClass === 'kitchenHub' ? TABLET_SCALE : PHONE_SCALE), [deviceClass]);
}
