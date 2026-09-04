/**
 * useKioskIdleLock — auto-locks the kiosk after a period of no touch
 * activity anywhere on screen, and exposes a manual lock too (live-
 * requested: "we can lock and go if no one using it"). A wall-mounted
 * kitchen tablet left showing whoever last used it is a real privacy
 * concern in a multi-generational household — a kid's Hub, or a parent's
 * Ask Fam conversation, sitting visible to anyone walking by until someone
 * happens to switch profiles.
 *
 * React Native has no built-in "any touch happened anywhere" signal — the
 * standard approach (used here) is a transparent full-screen touch
 * responder layered UNDER the real content that only ever resets the idle
 * timer and lets the touch pass through to whatever's actually being
 * tapped, rather than intercepting it. See KioskIdleTouchLayer below.
 *
 * Unlocking now requires picking a profile (KioskLockScreen), and a PIN
 * too for any member who has one set — matching the phone app's own
 * `pinEnabled && pin` rule. This hook only owns the idle timer/locked
 * boolean; KioskLockScreen and KioskScreen's onUnlock handler own the
 * actual profile pick + auth + setActiveMember flow.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

const DEFAULT_IDLE_MINUTES = 5;

export function useKioskIdleLock(idleMinutes: number = DEFAULT_IDLE_MINUTES) {
  const [locked, setLocked] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  const armTimer = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => setLocked(true), idleMinutes * 60_000);
  }, [clearTimer, idleMinutes]);

  // Any touch — resets the countdown. While already locked, this is a
  // no-op for the countdown (there's nothing to protect further); the
  // lock screen's own tap handler is what actually unlocks.
  const registerActivity = useCallback(() => {
    if (locked) return;
    armTimer();
  }, [locked, armTimer]);

  const lockNow = useCallback(() => {
    clearTimer();
    setLocked(true);
  }, [clearTimer]);

  const unlock = useCallback(() => {
    setLocked(false);
    armTimer();
  }, [armTimer]);

  useEffect(() => {
    armTimer();
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Backgrounding the app (someone switches to another app, or the device
  // sleeps) should lock immediately on return — same reasoning as the idle
  // timer, just triggered by a different real-world signal.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') lockNow();
    });
    return () => sub.remove();
  }, [lockNow]);

  return { locked, registerActivity, lockNow, unlock };
}
