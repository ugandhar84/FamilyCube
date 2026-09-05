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
 * standard approach is a touch handler on the root view that only ever
 * resets the idle timer and lets the touch pass through to whatever's
 * actually being tapped, rather than intercepting it. KioskScreen wires
 * registerActivity to its root SafeAreaView's onTouchStart for that.
 *
 * Unlocking requires picking a profile (KioskLockScreen), and a PIN too
 * for any member who has one set — matching the phone app's own
 * `pinEnabled && pin` rule. This hook only owns the idle/ambient timers
 * and the locked boolean; KioskLockScreen and KioskScreen's onUnlock
 * handler own the actual profile pick + auth + setActiveMember flow.
 *
 * ── AUDIT FIX 1: touches inside a native Modal never reset the timer ────
 * The root SafeAreaView's onTouchStart is the ONLY activity source, and a
 * React Native <Modal> renders into its own native window — it is not a
 * descendant of that SafeAreaView in the touch hierarchy, so no touch
 * inside one ever bubbles to it. Kiosk puts a LOT behind modals:
 * KioskQuestEditor, KioskEventEditor, SmartTaskComposer, AddQuestModal,
 * AddEventModal, AskCubeChat, KidRequestModal, the chat attach menu and
 * lightboxes, PinEntryModal. So the previous behavior was: open the event
 * editor, spend 30 minutes carefully filling it in — never once resetting
 * the timer, because every one of those taps landed in the modal layer —
 * and the idle lock fires underneath you, mounting KioskLockScreen over
 * your half-finished form and discarding the input when you unlock back
 * into a remounted tab. Exactly the "editor open when idle-lock fires"
 * case this audit was asked to check, and it was genuinely broken.
 *
 * Two-part fix, because these are two separate problems:
 *   (a) registerActivity is now callable from anywhere, and the modal
 *       hosts wire it (see KioskScreen's KioskActivityProvider) so a
 *       touch in a modal counts as activity like any other.
 *   (b) suspendLock()/resumeLock() — while a text-entry modal is open the
 *       idle timer is HELD, not merely reset. Even (a) can't save someone
 *       who opens the editor, gets called away mid-sentence, and comes
 *       back: without a hold, they lose the draft. Discarding a partially
 *       typed form is a data-loss bug, not a security feature. The hold is
 *       explicitly NOT unbounded — see AUDIT FIX 2.
 *
 * ── AUDIT FIX 2: a suspended lock could be held open forever ────────────
 * A naive "pause the timer while a modal is open" is a privacy hole on a
 * physically-exposed device: leave the event editor open on the kitchen
 * counter and the kiosk never locks again, all night. So a suspension is
 * capped at SUSPEND_MAX_MS — past that the lock fires regardless of what's
 * open. That's the balance: you don't lose a draft to a 30-minute timer
 * you were actively working against, but the device cannot be held
 * permanently unlocked by leaving a sheet open.
 *
 * ── AUDIT FIX 3: stale-closure safety ──────────────────────────────────
 * The previous version's registerActivity closed over `locked` and was
 * rebuilt on every lock-state change, which meant KioskScreen's
 * onTouchStart prop identity churned and — more importantly — any consumer
 * that captured registerActivity once (a timer, an effect with [] deps, a
 * memoized child) held a callback frozen against a stale `locked`. Every
 * mutable input the timers read now lives in a ref, and every returned
 * callback has a stable identity for the hook's whole lifetime, so a
 * captured reference can never go stale. This is the single highest-risk
 * bug class in this file and the reason it's structured this way.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { KIOSK_AMBIENT_AFTER_MS } from './kioskTheme';

// Live-requested: "it should lock only when the timeout of 30 min or just
// user explicit click on lock" — was 5 minutes.
const DEFAULT_IDLE_MINUTES = 30;
// Same threshold used for "was this a genuine backgrounding, not a brief
// bounce" below.
const BACKGROUND_LOCK_AFTER_MS = 30 * 60_000;
// Longest an open editor/composer may hold the idle lock off. Generous
// enough that no realistic form-filling session trips it, short enough
// that a sheet left open on the counter still locks the device. See
// AUDIT FIX 2 above.
const SUSPEND_MAX_MS = 15 * 60_000;

export interface KioskIdleLock {
  locked: boolean;
  /** True once nothing has been touched for KIOSK_AMBIENT_AFTER_MS, and
   *  still false once locked (the lock screen is its own full surface —
   *  the ambient overlay must not also paint over it). */
  ambient: boolean;
  /** Reset the idle + ambient countdown. Safe to call at any frequency;
   *  stable identity for the hook's lifetime. */
  registerActivity: () => void;
  lockNow: () => void;
  unlock: () => void;
  /** Hold the idle lock off while a text-entry modal is open, so a
   *  half-typed form is never discarded by the timer. Capped at
   *  SUSPEND_MAX_MS. Balanced by resumeLock — always pair them. */
  suspendLock: () => void;
  resumeLock: () => void;
}

export function useKioskIdleLock(idleMinutes: number = DEFAULT_IDLE_MINUTES): KioskIdleLock {
  const [locked, setLocked] = useState(false);
  const [ambient, setAmbient] = useState(false);

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ambientTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suspendCapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Every mutable value the timers read lives in a ref, never in a closure
  // captured at callback-creation time — see AUDIT FIX 3. `lockedRef`
  // mirrors the `locked` state so registerActivity can early-out on it
  // without having to depend on (and be rebuilt by) that state.
  const lockedRef = useRef(false);
  const idleMsRef = useRef(idleMinutes * 60_000);
  // Refcount, not a boolean: kiosk can legitimately stack sheets (the chat
  // attach menu over the composer, PinEntryModal over the header switcher),
  // and a plain boolean would let the inner one's resume cancel the outer
  // one's still-active suspension.
  const suspendCountRef = useRef(0);

  useEffect(() => { lockedRef.current = locked; }, [locked]);
  useEffect(() => { idleMsRef.current = idleMinutes * 60_000; }, [idleMinutes]);

  const clearTimers = useCallback(() => {
    if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
    if (ambientTimerRef.current) { clearTimeout(ambientTimerRef.current); ambientTimerRef.current = null; }
  }, []);

  // Arms BOTH countdowns off the same "last activity" instant: ambient
  // first (90s), then the real lock. Reading idleMsRef rather than closing
  // over idleMinutes keeps this callback's identity stable forever.
  const armTimers = useCallback(() => {
    clearTimers();
    if (lockedRef.current) return;
    ambientTimerRef.current = setTimeout(() => setAmbient(true), KIOSK_AMBIENT_AFTER_MS);
    // A suspension holds ONLY the lock, never the ambient fade — an
    // untouched screen should still calm down visually even with a sheet
    // open; it just must not lock and throw the sheet's contents away.
    if (suspendCountRef.current > 0) return;
    idleTimerRef.current = setTimeout(() => {
      lockedRef.current = true;
      setLocked(true);
      setAmbient(false);
    }, idleMsRef.current);
  }, [clearTimers]);

  const registerActivity = useCallback(() => {
    if (lockedRef.current) return;
    setAmbient(false);
    armTimers();
  }, [armTimers]);

  const lockNow = useCallback(() => {
    clearTimers();
    if (suspendCapTimerRef.current) { clearTimeout(suspendCapTimerRef.current); suspendCapTimerRef.current = null; }
    // A manual lock overrides any outstanding suspension — someone tapping
    // the lock button means it NOW, whatever sheet happens to be open.
    suspendCountRef.current = 0;
    lockedRef.current = true;
    setAmbient(false);
    setLocked(true);
  }, [clearTimers]);

  const unlock = useCallback(() => {
    lockedRef.current = false;
    setLocked(false);
    setAmbient(false);
    armTimers();
  }, [armTimers]);

  const suspendLock = useCallback(() => {
    suspendCountRef.current += 1;
    if (suspendCountRef.current === 1) {
      // Drop the pending lock timer, but start the hard cap so the
      // suspension can't run forever (AUDIT FIX 2).
      if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
      if (suspendCapTimerRef.current) clearTimeout(suspendCapTimerRef.current);
      suspendCapTimerRef.current = setTimeout(() => {
        suspendCapTimerRef.current = null;
        suspendCountRef.current = 0;
        lockedRef.current = true;
        setAmbient(false);
        setLocked(true);
      }, SUSPEND_MAX_MS);
    }
  }, []);

  const resumeLock = useCallback(() => {
    if (suspendCountRef.current === 0) return;
    suspendCountRef.current -= 1;
    if (suspendCountRef.current === 0) {
      if (suspendCapTimerRef.current) { clearTimeout(suspendCapTimerRef.current); suspendCapTimerRef.current = null; }
      // Closing the sheet counts as activity — restart a full countdown
      // rather than resuming whatever fragment was left when it opened.
      registerActivity();
    }
  }, [registerActivity]);

  useEffect(() => {
    armTimers();
    return () => {
      clearTimers();
      if (suspendCapTimerRef.current) { clearTimeout(suspendCapTimerRef.current); suspendCapTimerRef.current = null; }
    };
  }, [armTimers, clearTimers]);

  // Live-reported bug this fixes: "if the camera open or map open, or
  // something is open from the app it is immediately locking the hub...
  // not good." A previous version locked on 'inactive' too — but
  // 'inactive' is iOS's transient state for MANY momentary interruptions
  // that are NOT someone actually leaving the kiosk: opening the camera, a
  // native image/document picker, a system permission dialog, or handing
  // off to the native Maps app (exactly what KioskFindFamTab's own
  // openDirections does). Same lesson the phone app's own biometric
  // re-lock in app/_layout.tsx already learned — its own comment: "ignore
  // 'inactive' (e.g. the bio prompt itself)." Only a genuine
  // background->active round trip, held for a real stretch, locks the
  // kiosk — camera/map/picker/permission-dialog interruptions leave it
  // exactly as it was.
  //
  // Audit addition: coming back from a SHORT backgrounding now re-arms the
  // countdown instead of leaving whatever fragment of it was pending when
  // the app went away. A timer that expires while backgrounded doesn't
  // fire reliably on iOS, so without this a kiosk could return to the
  // foreground with no armed idle timer at all and simply never lock again
  // until the next touch — a silent failure of the whole privacy feature.
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
      if (awayMs >= BACKGROUND_LOCK_AFTER_MS) { lockNow(); return; }
      if (!lockedRef.current) registerActivity();
    });
    return () => sub.remove();
  }, [lockNow, registerActivity]);

  return { locked, ambient, registerActivity, lockNow, unlock, suspendLock, resumeLock };
}
