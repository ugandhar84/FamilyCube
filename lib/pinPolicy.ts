/**
 * pinPolicy — who needs a PIN to enter a profile.
 *   - Anyone entering their own profile, or any non-parent entering someone else's: the target's PIN.
 *   - A PARENT entering a kid/teen's profile: no PIN. Parents look after the kids' accounts and should never be locked out of
 *     them. (A kid with their own separate login still needs the PIN: the server issues a per-device grant from that PIN
 *     check, and without it that kid's own actions would be refused.)
 * Profiles entered this way are remembered for the session so the resume lock does not then ask the parent for the kid's PIN.
 */
type P = { id: string; role: string; pinEnabled?: boolean; authUserId?: string | null; pin?: string | null };

const enteredByParent = new Set<string>();

const isChild = (m: P) => m.role === 'kid' || m.role === 'teen' || m.role === 'child' || m.role === 'teenager';

export function needsPinToSwitch(active: P | undefined | null, target: P): boolean {
  if (!target.pinEnabled) return false;
  if (active && active.id === target.id) return false;
  if (active && active.role === 'parent' && isChild(target) && !target.authUserId) return false;
  return true;
}

/** Call right after switching in WITHOUT a PIN because a parent did it. */
export function markEnteredByParent(memberId: string) { enteredByParent.add(memberId); }
/** Call after a real PIN entry for that member. */
export function clearEnteredByParent(memberId: string) { enteredByParent.delete(memberId); }
export function wasEnteredByParent(memberId: string | null | undefined) { return !!memberId && enteredByParent.has(memberId); }
