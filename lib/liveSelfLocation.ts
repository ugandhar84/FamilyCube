/**
 * liveSelfLocation — while the Find Family tab is open and sharing is on, stream this person's position at a steady
 * high-accuracy cadence so the family map moves like Life360 instead of waiting for a background wake.
 *
 *  - a high-accuracy fix the moment the tab opens (the map must be right as soon as anyone looks),
 *  - then a foreground watch (every ~4 s or ~8 m), written to member_locations with a speed that falls back to the
 *    distance between fixes when the GPS reports none, so walking and driving show up right away,
 *  - poor fixes (accuracy worse than 120 m) are skipped once a good one exists, so the pin never jumps to a wrong street,
 *  - the street address is re-looked-up only after a real move, never every tick.
 * The background task in locationTracking.ts still covers the phone being in a pocket or the app closed.
 */
import * as Location from 'expo-location';
import { AppState } from 'react-native';
import { supabase } from './supabase';
import { encryptLocationText } from './locationCrypto';

const MIN_WRITE_GAP_MS = 4_000;
const MAX_QUIET_MS = 30_000;       // still write at least this often while the tab is open
const MIN_MOVE_M = 5;
const BAD_ACCURACY_M = 120;
const GEOCODE_MIN_MOVE_M = 60;
const GEOCODE_MIN_GAP_MS = 15_000;

function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000, toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad, dLng = (bLng - aLng) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Starts the live watch. Returns a stop function. Never throws; does nothing without foreground permission. */
export async function startLiveSelfLocation(memberId: string, familyId: string | null): Promise<() => void> {
  let stopped = false;
  let sub: Location.LocationSubscription | null = null;
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') return () => {};

    let last: { lat: number; lng: number; t: number } | null = null;     // last written fix
    let lastGeo: { lat: number; lng: number; t: number } | null = null;  // last reverse-geocoded point
    let prevFix: { lat: number; lng: number; t: number } | null = null;  // previous raw fix, for speed
    let haveGoodFix = false;
    let writing = false;
    let speedMps = 0;

    const handle = async (pos: Location.LocationObject) => {
      if (stopped || writing) return;
      const { latitude: lat, longitude: lng, accuracy, speed } = pos.coords;
      const now = Date.now();
      if (accuracy != null && accuracy > BAD_ACCURACY_M && haveGoodFix) return;
      if (accuracy != null && accuracy <= BAD_ACCURACY_M) haveGoodFix = true;

      // Speed: trust the GPS reading when it has one, otherwise derive it from the last two fixes.
      let inst = speed != null && speed >= 0 ? speed : 0;
      if ((speed == null || speed < 0) && prevFix) {
        const dt = (now - prevFix.t) / 1000;
        if (dt > 0.5) inst = metersBetween(prevFix.lat, prevFix.lng, lat, lng) / dt;
      }
      prevFix = { lat, lng, t: now };
      // Light smoothing so one noisy reading does not flip walking/driving, but a real stop reads as stopped quickly.
      speedMps = inst < 0.5 ? inst : speedMps * 0.4 + inst * 0.6;

      const moved = last ? metersBetween(last.lat, last.lng, lat, lng) : Infinity;
      const gap = last ? now - last.t : Infinity;
      if (last && gap < MIN_WRITE_GAP_MS) return;
      if (last && moved < MIN_MOVE_M && gap < MAX_QUIET_MS) return;

      writing = true;
      try {
        const row: Record<string, any> = {
          member_id: memberId, family_id: familyId, lat, lng,
          speed_mph: Math.round(speedMps * 2.237),
          last_updated: new Date().toISOString(),
        };
        const geoMoved = lastGeo ? metersBetween(lastGeo.lat, lastGeo.lng, lat, lng) : Infinity;
        if (geoMoved >= GEOCODE_MIN_MOVE_M && (!lastGeo || now - lastGeo.t >= GEOCODE_MIN_GAP_MS)) {
          try {
            const [geo] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
            if (geo) {
              const street = geo.street ?? geo.name ?? null;
              const address = [[geo.streetNumber, street].filter(Boolean).join(' ') || street, geo.city].filter(Boolean).join(', ');
              if (address) {
                row.address = await encryptLocationText(memberId, familyId, address);
                row.neighborhood = await encryptLocationText(memberId, familyId, geo.district ?? geo.city ?? geo.region ?? address);
              }
            }
            lastGeo = { lat, lng, t: now };
          } catch { /* best effort */ }
        }
        const { error } = await supabase.from('member_locations').upsert(row, { onConflict: 'member_id' });
        if (!error) last = { lat, lng, t: now };
      } finally {
        writing = false;
      }
    };

    // The very first fix, so the map is right the moment the tab opens.
    try { await handle(await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })); } catch { /* the watch will follow */ }
    if (stopped) return () => {};
    const begin = async () => {
      if (stopped || sub) return;
      const s2 = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 4_000, distanceInterval: 8 },
        (pos) => { handle(pos).catch(() => {}); },
      );
      if (stopped || sub) { s2.remove(); return; }
      sub = s2;
    };
    const end = () => { try { sub?.remove(); } catch { /* ignore */ } sub = null; };
    await begin();
    // High-accuracy streaming is only for when the map is actually on screen: stop it the moment the app leaves the
    // foreground (the adaptive background task takes over) and resume when it comes back.
    const appSub = AppState.addEventListener('change', (st) => { if (st === 'active') begin().catch(() => {}); else end(); });
    return () => { stopped = true; appSub.remove(); end(); };
  } catch (e) {
    console.warn('[liveSelfLocation] could not start', e);
  }
  return () => { stopped = true; try { sub?.remove(); } catch { /* ignore */ } sub = null; };
}
