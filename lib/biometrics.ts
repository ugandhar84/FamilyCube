import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const BIOMETRIC_ENABLED_KEY          = '@pawbond_biometric_enabled';
const BIOMETRIC_ENABLED_KEY_LEGACY   = '@furever_biometric_enabled';
const BIOMETRIC_CREDENTIALS_KEY      = 'pawbond_biometric_creds';
const BIOMETRIC_CREDENTIALS_KEY_LEGACY = 'furever_biometric_creds';
const BIOMETRIC_SESSION_KEY = 'pawbond_biometric_session';
// Set whenever authStore.signOut() preserves the Supabase session for
// biometric restore instead of actually revoking it — Supabase's own client
// storage still holds a technically-valid session in this case (skipping
// signOut() entirely is what fixed the "saved token gets immediately
// revoked by signOut({scope:'local'})'s own server-side call" bug), so
// without this flag a cold app relaunch would find that still-valid session
// and skip straight past Face ID/login with no prompt at all. Boot's own
// getSession() gate checks this and treats a locked session as "no
// session" for routing purposes even though it's technically restorable;
// it's cleared only once Face ID/PIN successfully restores access.
const LOCKED_KEY = '@familycube_locked';

export async function setLocked(locked: boolean): Promise<void> {
  if (locked) await AsyncStorage.setItem(LOCKED_KEY, '1');
  else await AsyncStorage.removeItem(LOCKED_KEY);
}

export async function isLocked(): Promise<boolean> {
  return (await AsyncStorage.getItem(LOCKED_KEY)) === '1';
}

// Set immediately after a successful Face ID/session restore (LoginScreen's
// biometricLogin, LockScreen's unlock) — read once family members have
// actually loaded (see (tabs)/_layout.tsx's own effect) to reset
// activeMemberId back to the real signed-in account's own member profile.
// Whoever was PIN-switched to as the active member before the app closed
// is NOT necessarily who's coming back via Face ID (reported live: locked
// while on a PIN-less kid's profile, relaunched via Face ID, landed
// directly in that kid's account instead of the real auth-owner's).
const PENDING_OWNER_RESET_KEY = '@familycube_pending_owner_reset';

export async function markPendingOwnerReset(): Promise<void> {
  await AsyncStorage.setItem(PENDING_OWNER_RESET_KEY, '1');
}

export async function consumePendingOwnerReset(): Promise<boolean> {
  const pending = (await AsyncStorage.getItem(PENDING_OWNER_RESET_KEY)) === '1';
  if (pending) await AsyncStorage.removeItem(PENDING_OWNER_RESET_KEY);
  return pending;
}

// ── Hardware & enrollment check ──────────────────────────────────

export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && isEnrolled;
  } catch {
    return false;
  }
}

export async function getSupportedBiometricType(): Promise<'face' | 'fingerprint' | 'none'> {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'face';
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'fingerprint';
    return 'none';
  } catch {
    return 'none';
  }
}

export async function getBiometricLabel(): Promise<string> {
  const type = await getSupportedBiometricType();
  if (type === 'face') return 'Face ID';
  if (type === 'fingerprint') return 'Fingerprint';
  return 'Biometrics';
}

// ── User preference ───────────────────────────────────────────────

export async function isBiometricEnabled(): Promise<boolean> {
  let val = await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY);
  if (val === null) {
    const legacy = await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY_LEGACY);
    if (legacy !== null) {
      val = legacy;
      await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, legacy);
      await AsyncStorage.removeItem(BIOMETRIC_ENABLED_KEY_LEGACY);
    }
  }
  return val === 'true';
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, enabled ? 'true' : 'false');
}

// ── Credential storage (for re-auth after biometric) ─────────────

export async function saveBiometricCredentials(email: string, password: string): Promise<void> {
  await SecureStore.setItemAsync(BIOMETRIC_CREDENTIALS_KEY, JSON.stringify({ email, password }));
}

export async function getBiometricCredentials(): Promise<{ email: string; password: string } | null> {
  try {
    let raw = await SecureStore.getItemAsync(BIOMETRIC_CREDENTIALS_KEY);
    if (!raw) {
      const legacy = await SecureStore.getItemAsync(BIOMETRIC_CREDENTIALS_KEY_LEGACY);
      if (legacy) {
        raw = legacy;
        await SecureStore.setItemAsync(BIOMETRIC_CREDENTIALS_KEY, legacy);
        await SecureStore.deleteItemAsync(BIOMETRIC_CREDENTIALS_KEY_LEGACY);
      }
    }
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function clearBiometricCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(BIOMETRIC_CREDENTIALS_KEY);
  await SecureStore.deleteItemAsync(BIOMETRIC_CREDENTIALS_KEY_LEGACY);
}

// ── Session-token storage (Face ID login, incl. after sign-out) ───
// We persist the Supabase refresh/access tokens (NOT the password) so Face ID
// can restore the session even after an explicit local sign-out — the same
// approach banking apps use for "Log in with Face ID".

export async function saveBiometricSession(accessToken: string, refreshToken: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(
      BIOMETRIC_SESSION_KEY,
      JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }),
    );
    console.log('[Bio] saveBiometricSession: write completed for key', BIOMETRIC_SESSION_KEY);
  } catch (e: any) {
    // Was silently swallowed by the caller's own try/catch — reported live:
    // sign-out logged "saved biometric session token ✓" (the caller's own
    // log, which only confirms this function was CALLED, not that the write
    // actually succeeded) yet the very next Face ID login attempt got
    // "Sign in required," meaning getBiometricSession() found nothing.
    // Logging the real failure here instead of let it vanish silently.
    console.error('[Bio] saveBiometricSession FAILED:', e?.message, e);
    throw e;
  }
}

export async function getBiometricSession(): Promise<{ access_token: string; refresh_token: string } | null> {
  try {
    const raw = await SecureStore.getItemAsync(BIOMETRIC_SESSION_KEY);
    if (!raw) {
      console.warn('[Bio] getBiometricSession: no value stored for key', BIOMETRIC_SESSION_KEY);
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed?.refresh_token) {
      console.warn('[Bio] getBiometricSession: stored value present but missing refresh_token', parsed);
      return null;
    }
    return parsed;
  } catch (e: any) {
    console.error('[Bio] getBiometricSession FAILED:', e?.message, e);
    return null;
  }
}

export async function hasBiometricSession(): Promise<boolean> {
  return (await getBiometricSession()) !== null;
}

export async function clearBiometricSession(): Promise<void> {
  await SecureStore.deleteItemAsync(BIOMETRIC_SESSION_KEY);
}

// ── Authenticate ──────────────────────────────────────────────────

export async function authenticateWithBiometrics(reason?: string): Promise<boolean> {
  const { success } = await authenticateWithBiometricsDetailed(reason);
  return success;
}

/** Like authenticateWithBiometrics but surfaces the failure reason for debugging. */
export async function authenticateWithBiometricsDetailed(
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason ?? 'Sign in to PawBond',
      fallbackLabel: 'Use password',
      disableDeviceFallback: false,
      cancelLabel: 'Cancel',
    });
    return { success: result.success, error: (result as any).error };
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'unknown error' };
  }
}
