import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const BIOMETRIC_ENABLED_KEY          = '@pawbond_biometric_enabled';
const BIOMETRIC_ENABLED_KEY_LEGACY   = '@furever_biometric_enabled';
const BIOMETRIC_CREDENTIALS_KEY      = 'pawbond_biometric_creds';
const BIOMETRIC_CREDENTIALS_KEY_LEGACY = 'furever_biometric_creds';
const BIOMETRIC_SESSION_KEY = 'pawbond_biometric_session';

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
  await SecureStore.setItemAsync(
    BIOMETRIC_SESSION_KEY,
    JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }),
  );
}

export async function getBiometricSession(): Promise<{ access_token: string; refresh_token: string } | null> {
  try {
    const raw = await SecureStore.getItemAsync(BIOMETRIC_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.refresh_token) return null;
    return parsed;
  } catch {
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
