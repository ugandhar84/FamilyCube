/**
 * AppPinLockOverlay — blurs the screen and demands the active member's PIN
 * after the app has been backgrounded for a while, mirroring the existing
 * Face ID re-lock behavior in app/_layout.tsx's AppState handler but for
 * PIN-only accounts (no device biometric lock enabled). Without this, a
 * profile with pinEnabled could be resumed from the app switcher/background
 * with zero challenge — the PIN only ever gated switching INTO that profile
 * via PersonaSwitcherDropdown, never resuming an app that was already on it.
 */
import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useFamilyStore } from '@/store/familyStore';
import { useTheme } from '@/lib/ThemeContext';
import { wasReminderCallJustAnswered } from '@/lib/callAlert';
import PinEntryModal from './PinEntryModal';
import { wasEnteredByParent, hydrateEnteredByParent } from '@/lib/pinPolicy';
import { awayMs, stampActive, shouldLock } from '@/lib/appLock';

export default function AppPinLockOverlay() {
  const { isDark } = useTheme();
  const members = useFamilyStore(s => s.members);
  const activeMemberId = useFamilyStore(s => s.activeMemberId);
  const activeMember = members.find(m => m.id === activeMemberId) ?? null;

  const [pinChallengeVisible, setPinChallengeVisible] = useState(false);
  // Ref mirror of activeMember so the AppState listener (created once) always reads the CURRENT member.
  const activeMemberRef = useRef(activeMember);
  useEffect(() => { activeMemberRef.current = activeMember; }, [activeMember]);
  const challengeShownRef = useRef(false);
  useEffect(() => { challengeShownRef.current = pinChallengeVisible; }, [pinChallengeVisible]);

  // The single decision (see lib/appLock.ts): ask for the PIN only when the app is in the foreground AND has been unused for a
  // while. Called when a member becomes available and every time the app becomes active; it never runs for a background restart.
  const evaluate = useRef(async () => {
    if (challengeShownRef.current) return;
    const m = activeMemberRef.current;
    if (!m) return;
    await hydrateEnteredByParent();
    // If (tabs)/_layout.tsx is about to swap the active member back to the real owner, wait for that first.
    const { hasPendingOwnerReset } = await import('@/lib/biometrics');
    if (await hasPendingOwnerReset()) return;
    const away = await awayMs();
    const lock = shouldLock(away, {
      appIsActive: AppState.currentState === 'active',
      callJustAnswered: wasReminderCallJustAnswered(),
      hasPin: !!(m.pinEnabled && m.pin),
      enteredByParent: wasEnteredByParent(m.id),
    });
    if (lock) setPinChallengeVisible(true);
    else if (AppState.currentState === 'active') stampActive();
  }).current;

  useEffect(() => {
    let tick: ReturnType<typeof setInterval> | null = null;
    const startTick = () => { if (!tick) tick = setInterval(() => { if (AppState.currentState === 'active' && !challengeShownRef.current) stampActive(); }, 30_000); };
    const stopTick = () => { if (tick) { clearInterval(tick); tick = null; } };
    if (AppState.currentState === 'active') startTick();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') { startTick(); evaluate().catch(() => {}); return; }
      // Leaving the foreground (inactive or background): remember when. A brief interruption then returns within seconds.
      stopTick();
      if (!challengeShownRef.current) stampActive();
    });
    return () => { sub.remove(); stopTick(); };
  }, [evaluate]);

  // First evaluation once a member is known (cold start in the foreground). A background restart is skipped inside evaluate().
  const evaluatedOnMount = useRef(false);
  useEffect(() => {
    if (evaluatedOnMount.current || !activeMember) return;
    evaluatedOnMount.current = true;
    evaluate().catch(() => {});
  }, [activeMember, evaluate]);

  // If the active member changes to one without a PIN while the challenge
  // is up (shouldn't normally happen, but guards against a stale overlay),
  // or the member is cleared entirely, drop the challenge.
  useEffect(() => {
    if (pinChallengeVisible && !(activeMember?.pinEnabled && activeMember?.pin)) {
      setPinChallengeVisible(false);
    }
  }, [activeMember, pinChallengeVisible]);

  if (!pinChallengeVisible || !activeMember) return null;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="auto">
      <BlurView
        intensity={80}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFillObject}
      />
      <PinEntryModal
        resume
        visible={pinChallengeVisible}
        member={activeMember}
        onSuccess={() => { setPinChallengeVisible(false); stampActive(); }}
        // No real "cancel" destination exists here — this isn't a profile
        // switch the user can back out of, it's a resume challenge for the
        // profile they're already on. Keep the blur+challenge up rather
        // than dismissing to an unlocked state on a stray back-gesture.
        onCancel={() => {}}
      />
    </View>
  );
}
