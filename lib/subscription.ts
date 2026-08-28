let Purchases: typeof import('react-native-purchases').default | null = null;
try {
  Purchases = require('react-native-purchases').default;
} catch {}
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { useSubscriptionStore, SubscriptionTier } from '@/store/subscriptionStore';
import { usePaywallSheetStore } from '@/store/paywallSheetStore';

// ── Upgrade prompt — opens the in-place PaywallSheet instead of navigating ──
export function showUpgradeAlert(opts?: {
  title?: string;
  message?: string;
  perks?: string[];
}) {
  usePaywallSheetStore.getState().show({
    headline: opts?.title ?? 'Family Plan',
    body: opts?.message ?? 'Unlock full access for your whole family.',
    perks: opts?.perks,
  });
}

// ── RevenueCat product IDs ─────────────────────────────────────────────────
export const RC_API_KEY_IOS     = process.env.EXPO_PUBLIC_RC_API_KEY_IOS     ?? '';
export const RC_API_KEY_ANDROID = process.env.EXPO_PUBLIC_RC_API_KEY_ANDROID ?? '';

export const PRODUCT_IDS = {
  monthly: 'familycube_monthly',
  annual:  'familycube_yearly',
} as const;

// Single entitlement gating the whole app — matches the RevenueCat dashboard
// exactly (Entitlements tab → com_familycube_ios_premium, display name
// "Family Plan"). Family Cube is deliberately single-tier (no feature
// gating within a subscribed family) — see docs/paywall_setup_and_implementation.md.
export const PREMIUM_ENTITLEMENT = 'com_familycube_ios_premium';

// ── RevenueCat helpers ─────────────────────────────────────────────────────
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export function isRevenueCatReady(): boolean {
  return !isExpoGo;
}

export async function initRevenueCat(userId: string): Promise<void> {
  if (isExpoGo) return;
  try {
    Purchases?.configure({
      apiKey: Platform.OS === 'ios' ? RC_API_KEY_IOS : RC_API_KEY_ANDROID,
      // @ts-ignore — usesStoreKit2IfAvailable is valid at runtime but missing from older typings
      usesStoreKit2IfAvailable: false,
    });
    await Purchases?.logIn(userId);
  } catch (e) {
    console.warn('[RC] init error:', e);
  }
}

let _offeringsPromise: Promise<any> | null = null;
function _fetchOfferings() {
  if (!_offeringsPromise) {
    _offeringsPromise = Purchases!.getOfferings().finally(() => { _offeringsPromise = null; });
  }
  return _offeringsPromise;
}

export async function getOfferings(): Promise<any | null> {
  if (isExpoGo || !Purchases) return null;
  try {
    const offerings = await _fetchOfferings();
    return offerings.current ?? null;
  } catch {
    return null;
  }
}

export async function hasRealOfferings(): Promise<boolean> {
  if (isExpoGo || !Purchases) return false;
  try {
    const offerings = await _fetchOfferings();
    return !!offerings.current;
  } catch {
    return false;
  }
}

export async function purchasePackage(
  pkg: any,
  userId: string,
): Promise<{ success: boolean; tier?: SubscriptionTier; error?: string }> {
  if (isExpoGo) return { success: false, error: 'Purchases require a TestFlight or App Store build.' };
  if (!Purchases) return { success: false, error: 'In-app purchases are not available on this device.' };
  try {
    // Timeout guard — StoreKit sometimes hangs if the product isn't configured
    // in the sandbox or TestFlight environment (promise never resolves).
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Purchase timed out — product may not be ready in App Store sandbox yet. Please try again in a few minutes.')), 60_000),
    );
    const { customerInfo } = await Promise.race([
      Purchases.purchasePackage(pkg),
      timeout,
    ]);
    const activeEnt = customerInfo.entitlements.active[PREMIUM_ENTITLEMENT];
    const newTier: SubscriptionTier = activeEnt ? 'premium' : 'free';
    const expiresAt = activeEnt?.expirationDate ? new Date(activeEnt.expirationDate) : null;
    // Update UI immediately from RC entitlements — authoritative, no need to wait for webhook
    useSubscriptionStore.getState().setPurchasedTier(newTier, 'active', expiresAt);
    // Sync DB immediately so server-side gates (edge functions) see the new tier right away
    supabase.functions.invoke('sync-subscription').catch(() => {});
    return { success: true, tier: newTier };
  } catch (e: any) {
    if (e?.userCancelled) return { success: false, error: 'Purchase was cancelled or product not found in sandbox.' };
    return { success: false, error: e?.message ?? 'Purchase failed. Please try again.' };
  }
}

export async function restorePurchases(
  userId: string,
): Promise<{ success: boolean; tier?: SubscriptionTier; error?: string }> {
  if (isExpoGo) return { success: false, error: 'Restore requires a TestFlight or App Store build.' };
  if (!Purchases) return { success: false, error: 'In-app purchases are not available on this device.' };
  try {
    const customerInfo = await Purchases.restorePurchases();
    const activeEnt = customerInfo.entitlements.active[PREMIUM_ENTITLEMENT];
    const tier: SubscriptionTier = activeEnt ? 'premium' : 'free';
    if (tier !== 'free') {
      const expiresAt = activeEnt?.expirationDate ? new Date(activeEnt.expirationDate) : null;
      useSubscriptionStore.getState().setPurchasedTier(tier, 'active', expiresAt);
    }
    return { success: true, tier };
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Restore failed. Please try again.' };
  }
}
