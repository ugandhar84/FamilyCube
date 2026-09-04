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

// Live-requested: "it should lock only when the timeout of 30 min or just
// user explicit click on lock" — was 5 minutes.
const DEFAULT_IDLE_MINUTES = 30;
// Same threshold used for "was this a genuine backgrounding, not a brief
// bounce" below.
const BACKGROUND_LOCK_AFTER_MS = 30 * 60_000;

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

  // Live-reported bug this fixes: "if the camera open or map open, or
  // something is open from the app it is immediately locking the hub...
  // not good." The previous version locked on 'inactive' too — but
  // 'inactive' is iOS's transient state for MANY momentary interruptions
  // that are NOT someone actually leaving the kiosk: opening the camera, a
  // native image/document picker, a system permission dialog, or handing
  // off to the native Maps app (exactly what KioskFindFamTab's own
  // openDirections does). Same lesson the phone app's own biometric
  // re-lock in app/_layout.tsx already learned — its own comment: "ignore
  // 'inactive' (e.g. the bio prompt itself)." Only a genuine
  // background->active round trip, held for a real stretch (same 30-
  // minute threshold as the idle timer, not an instant bounce), locks the
  // kiosk now — camera/map/picker/permission-dialog interruptions leave it
  // exactly as it was.
  const backgroundedAt = useRef<number | null>(null);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        if (backgroundedAt.current == null) backgroundedAt.current = Date.now();
        return;
      }
      if (state !== 'active') return; // ignore 'inactive' entirely
      const awayMs = backgroundedAt.current != null ? Date.now() - backgroundedAt.current : 0;
      backgroundedAt.current = null;
      if (awayMs >= BACKGROUND_LOCK_AFTER_MS) lockNow();
    });
    return () => sub.remove();
  }, [lockNow]);

  return { locked, registerActivity, lockNow, unlock };
}
