/**
 * Location-sharing consent. Apple (guidelines 5.1.1 and 2.5.4) wants a clear, in-app explanation of what is collected and why
 * BEFORE the system location prompt, an explicit opt-in, and an easy way to stop. This records, per person on this device,
 * that they read and accepted the disclosure. Nothing starts tracking without it, including the automatic resume after a reinstall.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const LOCATION_CONSENT_VERSION = 1;
const key = (memberId: string) => `familycube_location_consent_v${LOCATION_CONSENT_VERSION}_${memberId}`;

export async function hasLocationConsent(memberId: string): Promise<boolean> {
  try { return (await AsyncStorage.getItem(key(memberId))) != null; } catch { return false; }
}

export async function recordLocationConsent(memberId: string): Promise<void> {
  try { await AsyncStorage.setItem(key(memberId), new Date().toISOString()); } catch { /* the next enable will ask again */ }
}

export async function clearLocationConsent(memberId: string): Promise<void> {
  try { await AsyncStorage.removeItem(key(memberId)); } catch { /* ignore */ }
}
