import { showAlert } from '@/components/AppAlert';
import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { AnimatedCubeMark } from '@/components/FamilyCubeLogo';
import {
  getBiometricLabel,
  authenticateWithBiometricsDetailed,
  getBiometricSession,
  clearBiometricSession,
} from '@/lib/biometrics';
import { TYPO } from '@/constants/theme';

/**
 * Biometric lock screen — an app-lock gate over an already-persisted Supabase
 * session (same model as PanoraTrade). It does NOT log in with a password; it
 * just requires Face ID / Touch ID before revealing the app. This is why it is
 * reliable: nothing depends on stored credentials.
 */
export default function LockScreen() {
  const { colors, isDark } = useTheme();
  const [label, setLabel] = useState('Biometrics');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const unlock = useCallback(async () => {
    if (inFlight.current) return; // guard against auto-trigger + tap race
    inFlight.current = true;
    setBusy(true);
    const { success, error } = await authenticateWithBiometricsDetailed('Unlock Family Cube');
    if (!success) {
      setBusy(false);
      inFlight.current = false;
      // Cancellations are fine — user can retry with the button. Only surface
      // genuine errors (no hardware / lockout etc).
      if (error && !['user_cancel', 'system_cancel', 'app_cancel'].includes(error)) {
        showAlert('Could not unlock', error);
      }
      return;
    }

    // Face ID passed. If the live session is still present (app-lock case),
    // just reveal the app. Otherwise (signed out) restore it from the stored
    // token — this is the "Log in with Face ID" flow.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const saved = await getBiometricSession();
      if (saved) {
        const { error: setErr } = await supabase.auth.setSession(saved);
        if (setErr) {
          // Token expired/revoked — fall back to password login.
          await clearBiometricSession();
          setBusy(false);
          inFlight.current = false;
          showAlert('Please sign in again', 'Your secure session expired. Sign in with your password to re-enable Face ID.');
          router.replace('/(auth)/login?signedOut=1' as any);
          return;
        }
      } else {
        // Nothing to restore — go to login.
        setBusy(false);
        inFlight.current = false;
        router.replace('/(auth)/login?signedOut=1' as any);
        return;
      }
    }
    // Clears the soft-lock flag set by authStore.signOut() when it preserves
    // a biometric session (skipping the real Supabase signOut so Face ID can
    // restore it) — without this, boot's getSession() gate would keep
    // treating this valid-but-locked session as "locked" on every future
    // cold launch, permanently stuck on this screen.
    const { setLocked, markPendingOwnerReset } = await import('@/lib/biometrics');
    await setLocked(false);
    await markPendingOwnerReset();
    setBusy(false);
    inFlight.current = false;
    router.replace('/(tabs)');
  }, []);

  useEffect(() => {
    (async () => {
      setLabel(await getBiometricLabel());
      // Auto-trigger shortly after mount
      setTimeout(() => unlock(), 400);
    })();
  }, [unlock]);

  const signInDifferent = async () => {
    // Full switch-account: drop the stored biometric session and sign out.
    // Routed through authStore.signOut({ forceGlobal: true }) instead of a
    // raw supabase.auth.signOut() — the raw call bypassed familyStore.reset()
    // entirely, a real cross-account data leak if the next sign-in on this
    // device is a different account (familyStore caches members under fixed,
    // non-user-scoped keys and would otherwise show the previous account's
    // family). forceGlobal ensures this never preserves a biometric-
    // restorable token for the account being abandoned, matching this
    // action's own intent.
    await clearBiometricSession();
    await useAuthStore.getState().signOut({ forceGlobal: true });
    router.replace('/(auth)/login?signedOut=1' as any);
  };

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]}>
      <View style={s.center}>
        <AnimatedCubeMark size={96} />
        <Text style={[s.title, { color: colors.textPrimary }]}>Family Cube</Text>
        <Text style={[s.sub, { color: colors.textSecondary }]}>Locked for your security</Text>

        <TouchableOpacity
          style={[s.unlockBtn, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}
          onPress={unlock}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name={label === 'Face ID' ? 'scan-outline' : 'finger-print-outline'} size={20} color="#fff" />
              <Text style={s.unlockText}>Unlock with {label}</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={s.altBtn} onPress={signInDifferent} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[s.altText, { color: colors.textSecondary }]}>Sign in with password instead</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  title:  { fontSize: TYPO.hero, fontWeight: '800', marginTop: 12 },
  sub:    { fontSize: TYPO.body, marginBottom: 28 },
  unlockBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 15, paddingHorizontal: 28, borderRadius: 26, minWidth: 240,
  },
  unlockText: { color: '#fff', fontSize: TYPO.subheading, fontWeight: '700' },
  altBtn:  { marginTop: 22, paddingVertical: 10 },
  altText: { fontSize: TYPO.body, fontWeight: '600' },
});
