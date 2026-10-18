/**
 * appLock — one rule for when the app asks for a PIN again: only after the app has really been unused for a while.
 *
 * Why it exists: the PIN used to appear "randomly". It was decided from in-memory timers, so any time iOS restarted the app's
 * process (it does that often for location, geofence and call wake-ups, or to free memory) the app counted as a fresh start and
 * asked for the PIN, even if the person had been using it a minute earlier, or the restart happened in the background.
 *
 * The rule now: remember the last moment the app was in use (saved to disk, so it survives a restart). When the app becomes
 * active, ask for the PIN only if it has been more than LOCK_AFTER_MS since that moment. Brief interruptions (a permission
 * prompt, Control Center, a phone call, Face ID, the camera) never count, and a restart in the background never prompts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const LOCK_AFTER_MS = 15 * 60_000;
const KEY = 'familycube_last_active_at_v1';

export async function stampActive(): Promise<void> {
  try { await AsyncStorage.setItem(KEY, String(Date.now())); } catch { /* best effort */ }
}

/** Milliseconds since the app was last in use; Infinity if it never was (first launch after install). */
export async function awayMs(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const at = Number(raw);
    return raw && Number.isFinite(at) ? Math.max(0, Date.now() - at) : Infinity;
  } catch { return 0; }
}

/** Pure rule, tested: should a PIN be asked for now? */
export function shouldLock(away: number, opts: { appIsActive: boolean; callJustAnswered: boolean; hasPin: boolean; enteredByParent: boolean }): boolean {
  if (!opts.appIsActive) return false;          // a background restart never prompts
  if (!opts.hasPin || opts.enteredByParent) return false;
  if (opts.callJustAnswered) return false;      // coming back from a reminder call is not a fresh visit
  return away >= LOCK_AFTER_MS;
}
