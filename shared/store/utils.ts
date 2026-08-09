/**
 * shared/store/utils.ts — shared utilities used by all slice factories.
 *
 * `dedup` is the key primitive: it ensures that if two components independently
 * call `fetchPets` or `fetchMoodLogs` in the same render cycle, only one DB
 * query fires. The second caller receives the same in-flight Promise.
 *
 * `clearInFlight` is called on sign-out so stale promises from the previous
 * session can't accidentally resolve into the new session's store.
 */

// In-flight dedup map — keyed by a semantic string e.g. "pets:userId" or "moodLogs:petId".
const _inFlight = new Map<string, Promise<any>>();

/**
 * Wraps `fn` in a deduplication guard. If a call with the same `key` is already
 * in-flight, returns the existing Promise instead of starting a new one.
 * The entry is removed from the map as soon as the Promise settles (success or error).
 */
export function dedup<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (_inFlight.has(key)) return _inFlight.get(key)!;
  const p = fn().finally(() => _inFlight.delete(key));
  _inFlight.set(key, p);
  return p;
}

/** Drops all tracked in-flight promises — call during sign-out to prevent cross-session leaks. */
export function clearInFlight() {
  _inFlight.clear();
}
