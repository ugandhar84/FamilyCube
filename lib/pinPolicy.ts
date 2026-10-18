/**
 * pinPolicy — who needs a PIN to enter a profile.
 *   - Anyone entering their own profile, or any non-parent entering someone else's: the target's PIN.
 *   - A PARENT entering a kid/teen's profile: no PIN. Parents look after the kids' accounts and should never be locked out of
 *     them. (A kid with their own separate login still needs the PIN: the server issues a per-device grant from that PIN
 *     check, and without it that kid's own actions would be refused.)
 * Profiles entered this way are remembered for the session so the resume lock does not then ask the parent for the kid's PIN.
 */
type P = { id: string; role: string; pinEnabled?: boolean; authUserId?: string | null; pin?: string | null };

import AsyncStorage from '@react-native-async-storage/async-storage';

// Remembered across app restarts (iOS often relaunches the app in the background for location, so an in-memory flag was lost and a
// parent sitting in a child's profile was suddenly asked for the child's PIN). Each entry expires after 12 hours.
const ENTERED_KEY = 'familycube_entered_by_parent_v1';
const ENTERED_TTL_MS = 12 * 60 * 60 * 1000;
const enteredByParent = new Map<string, number>();
let hydrated: Promise<void> | null = null;

async function persistEntered(): Promise<void> {
  try { await AsyncStorage.setItem(ENTERED_KEY, JSON.stringify([...enteredByParent.entries()])); } catch { /* best effort */ }
}
/** Loads the remembered entries once (call before reading wasEnteredByParent at app start). */
export function hydrateEnteredByParent(): Promise<void> {
  if (!hydrated) {
    hydrated = (async () => {
      try {
        const raw = await AsyncStorage.getItem(ENTERED_KEY);
        for (const [id, at] of (JSON.parse(raw ?? '[]') as [string, number][])) if (Date.now() - at < ENTERED_TTL_MS && !enteredByParent.has(id)) enteredByParent.set(id, at);
      } catch { /* start empty */ }
    })();
  }
  return hydrated;
}

const isChild = (m: P) => m.role === 'kid' || m.role === 'teen' || m.role === 'child' || m.role === 'teenager';

export function needsPinToSwitch(active: P | undefined | null, target: P): boolean {
  if (!target.pinEnabled) return false;
  if (active && active.id === target.id) return false;
  if (active && active.role === 'parent' && isChild(target) && !target.authUserId) return false;
  return true;
}

/** Call right after switching in WITHOUT a PIN because a parent did it. */
export function markEnteredByParent(memberId: string) { enteredByParent.set(memberId, Date.now()); persistEntered(); }
/** Call after a real PIN entry for that member. */
export function clearEnteredByParent(memberId: string) { enteredByParent.delete(memberId); persistEntered(); }
export function wasEnteredByParent(memberId: string | null | undefined) {
  if (!memberId) return false;
  const at = enteredByParent.get(memberId);
  return at != null && Date.now() - at < ENTERED_TTL_MS;
}
