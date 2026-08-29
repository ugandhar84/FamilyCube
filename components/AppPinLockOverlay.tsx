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

// Same 5-minute threshold as the Face ID re-lock in app/_layout.tsx — only
// re-challenge after genuine backgrounding, not a brief bounce (a share
// sheet, a permission prompt, a quick app-switcher peek).
const LOCK_AFTER_MS = 300_000;

export default function AppPinLockOverlay() {
  const { isDark } = useTheme();
  const members = useFamilyStore(s => s.members);
  const activeMemberId = useFamilyStore(s => s.activeMemberId);
  const activeMember = members.find(m => m.id === activeMemberId) ?? null;

  const [pinChallengeVisible, setPinChallengeVisible] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  // Ref mirror of activeMember so the AppState listener (created once) always
  // reads the CURRENT member, not whichever was active when the effect ran.
  const activeMemberRef = useRef(activeMember);
  useEffect(() => { activeMemberRef.current = activeMember; }, [activeMember]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background') {
        if (backgroundedAt.current == null) backgroundedAt.current = Date.now();
        return;
      }
      if (next !== 'active') return; // ignore 'inactive' (e.g. a share sheet)
      const awayMs = backgroundedAt.current != null ? Date.now() - backgroundedAt.current : 0;
      backgroundedAt.current = null;
      if (awayMs < LOCK_AFTER_MS) return;
      // Same skip the sibling biometric re-lock check in app/_layout.tsx
      // applies — answering a call reminder backgrounds the app for the
      // call's duration (easily past LOCK_AFTER_MS), and forcing a PIN
      // re-entry the instant that call is answered is an unwanted
      // interruption for a resume the user didn't actually initiate.
      if (wasReminderCallJustAnswered()) return;
      // Challenge only if the CURRENT active member actually has a PIN set —
      // re-read via the ref at fire time, not a stale closure value.
      if (activeMemberRef.current?.pinEnabled && activeMemberRef.current?.pin) {
        setPinChallengeVisible(true);
      }
    });
    return () => sub.remove();
  }, []);

  // Cold boot never fires AppState's background→active transition — there
  // is no prior backgrounded timestamp to compare against on a freshly
  // launched process, so the listener above alone would never challenge a
  // PIN-enabled profile resumed via a full app relaunch (only via
  // background/foreground). Challenge once, the first time a PIN-enabled
  // member actually becomes available after mount/app-open — same
  // "resuming a PIN-protected profile always needs the PIN" principle,
  // just for the launch path the AppState listener structurally can't see.
  const challengedOnMount = useRef(false);
  useEffect(() => {
    if (challengedOnMount.current) return;
    if (!activeMember) return; // members not loaded yet — wait for the real value
    (async () => {
      // If (tabs)/_layout.tsx is about to swap activeMemberId back to the
      // real owner (a plain cold boot with no biometric lock, or a Face ID
      // restore), wait for that to actually happen first — otherwise this
      // can momentarily challenge for whichever member was last-persisted
      // (possibly a kid's PIN) a split second before the reset fires,
      // which is confusing even though it's not actually a security hole.
      const { hasPendingOwnerReset } = await import('@/lib/biometrics');
      if (await hasPendingOwnerReset()) return; // re-runs via the activeMember effect once the reset lands
      challengedOnMount.current = true;
      if (activeMember.pinEnabled && activeMember.pin) {
        setPinChallengeVisible(true);
      }
    })();
  }, [activeMember]);

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
        visible={pinChallengeVisible}
        member={activeMember}
        onSuccess={() => setPinChallengeVisible(false)}
        // No real "cancel" destination exists here — this isn't a profile
        // switch the user can back out of, it's a resume challenge for the
        // profile they're already on. Keep the blur+challenge up rather
        // than dismissing to an unlocked state on a stray back-gesture.
        onCancel={() => {}}
      />
    </View>
  );
}
