// Safe expo-location wrapper — zero errors/warnings in Expo Go.
//
// Why this exists:
//   expo-location calls requireNativeModule('ExpoLocation') at the top level
//   of ExpoLocation.js. That both THROWS and logs a console.error when the
//   native module is absent (Expo Go, web, simulators without GPS).
//
//   requireOptionalNativeModule is the quiet alternative — it returns null
//   with no throw and no log. We use it as a lazy gate: checked on the first
//   call to getLocationAPI() (well after JS startup, when the Expo module
//   registry is fully initialized), then only require('expo-location') when
//   the native side confirms ExpoLocation is registered.

import { requireOptionalNativeModule } from 'expo-modules-core';

export type LocationAPI = typeof import('expo-location');

let _cache: LocationAPI | null | undefined = undefined; // undefined = unchecked

/**
 * Returns the expo-location module, or null when the native module is absent.
 * Safe to call from any function body — will never throw or log an error.
 * Result is memoized after the first call.
 */
export function getLocationAPI(): LocationAPI | null {
  if (_cache !== undefined) return _cache;

  // requireOptionalNativeModule: returns null silently when 'ExpoLocation' is not
  // registered (Expo Go without location, web). No throw, no console.error.
  const native = requireOptionalNativeModule('ExpoLocation');
  if (!native) {
    _cache = null;
    return null;
  }

  // Native module IS present — safe to evaluate expo-location's module factory.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-location') as LocationAPI;
    _cache = typeof mod?.requestForegroundPermissionsAsync === 'function' ? mod : null;
  } catch {
    _cache = null;
  }
  return _cache;
}

/** Returns true when expo-location's native module is available. */
export function isLocationAvailable(): boolean {
  return getLocationAPI() !== null;
}
