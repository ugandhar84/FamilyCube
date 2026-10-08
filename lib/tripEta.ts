/**
 * tripEta — live ETA for an in-progress trip, computed from the driver's
 * actual GPS position (member_locations) instead of the static number the
 * driver typed in at dispatch time.
 *
 * No routing/directions API exists anywhere in this app (no Google
 * Directions/Mapbox integration) — this is straight-line (haversine)
 * distance divided by the driver's own live speed_mph when they're
 * actually moving, falling back to a fixed assumed average when
 * stationary/just started (speed reads ~0 at a red light or right after
 * dispatch, which would otherwise make ETA read as infinite). It will
 * under-estimate real drive time on anything but a straight road — this
 * is explicitly an approximation, not turn-by-turn routing, and is
 * labeled as "~" in the UI for that reason.
 */

const EARTH_RADIUS_MILES = 3958.8;
// Used only when the driver's live speed reads 0 or is missing (stopped
// at a light, just started, GPS fix doesn't include speed) — without a
// floor here, distance/speed would divide by zero and show "∞ min" or
// NaN right as a trip starts, the single most common moment to view it.
const ASSUMED_AVERAGE_MPH_WHEN_STOPPED = 25;
const MIN_SPEED_MPH_TO_TRUST = 3; // below this, treat as "stopped" rather than trusting a noisy low GPS-speed reading

export function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface LiveEtaResult {
  minutes: number;
  distanceMiles: number;
  /** True when this used the driver's real live speed; false when it fell back to the assumed average (driver stopped/no speed reading). */
  fromLiveSpeed: boolean;
}

/**
 * Computes a live ETA from the driver's current (lat, lng, speed_mph) to a
 * destination point. Returns null when the driver's own location isn't
 * known/shared (member_locations has no row, or sharing is off) — callers
 * should fall back to the trip's own static etaMinutes in that case.
 */
export function computeLiveEta(
  driver: { lat?: number | null; lng?: number | null; speedMph?: number | null } | undefined,
  destLat: number, destLng: number,
): LiveEtaResult | null {
  if (!driver || driver.lat == null || driver.lng == null) return null;
  const distanceMiles = haversineMiles(driver.lat, driver.lng, destLat, destLng);
  const speed = driver.speedMph ?? 0;
  const fromLiveSpeed = speed >= MIN_SPEED_MPH_TO_TRUST;
  const effectiveMph = fromLiveSpeed ? speed : ASSUMED_AVERAGE_MPH_WHEN_STOPPED;
  const minutes = Math.max(1, Math.round((distanceMiles / effectiveMph) * 60));
  return { minutes, distanceMiles, fromLiveSpeed };
}
