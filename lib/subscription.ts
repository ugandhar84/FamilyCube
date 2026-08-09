let Purchases: typeof import('react-native-purchases').default | null = null;
let LOG_LEVEL: typeof import('react-native-purchases').LOG_LEVEL | null = null;
type PurchasesOffering = import('react-native-purchases').PurchasesOffering;
try {
  const mod = require('react-native-purchases');
  Purchases = mod.default;
  LOG_LEVEL = mod.LOG_LEVEL;
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
  requiredTier?: 'pro' | 'ultimate';
  perks?: string[];
}) {
  const tier    = opts?.requiredTier ?? 'pro';
  const label   = tier === 'ultimate' ? 'Ultimate' : 'Pro';
  const headline = opts?.title   ?? `${label} feature`;
  const body     = opts?.message ?? `Upgrade to ${label} to unlock this feature.`;
  usePaywallSheetStore.getState().show({ headline, body, perks: opts?.perks });
}

// ── RevenueCat product IDs ─────────────────────────────────────────────────
export const RC_API_KEY_IOS     = process.env.EXPO_PUBLIC_RC_API_KEY_IOS     ?? '';
export const RC_API_KEY_ANDROID = process.env.EXPO_PUBLIC_RC_API_KEY_ANDROID ?? '';

export const PRODUCT_IDS = {
  pro_monthly:    'pb_pro_monthly',
  pro_annual:     'pb_pro_annual',
  ultimate_monthly: 'pb_ultimate_monthly',
  ultimate_annual:  'pb_ultimate_annual',
} as const;

export const ENTITLEMENTS = {
  pro:    'pro',
  ultimate: 'ultimate',
} as const;

// ── Limits per tier ────────────────────────────────────────────────────────
export const LIMITS: Record<SubscriptionTier, {
  pets: number;
  moodScansPerDay: number;
  realAiScansPerDay: number;
  healthRecordsPerMonth: number;
  feedPostsPerMonth: number;      // -1 = unlimited
  videoPostsPerMonth: number;     // 0 = blocked
  playdatesPerMonth: number;      // -1 = unlimited
  historyDays: number;            // -1 = unlimited
  vetChatPerDay: number;          // 0 = blocked
  symptomScansPerDay: number;     // 0 = blocked
  familyManagement: number;       // 0 = blocked, 1 = allowed
}> = {
  free: {
    pets:                   1,
    moodScansPerDay:        4,
    realAiScansPerDay:      2,
    healthRecordsPerMonth:  3,
    feedPostsPerMonth:      5,
    videoPostsPerMonth:     0,
    playdatesPerMonth:      2,
    historyDays:            14,   // PRD: fixed 14-day history view
    vetChatPerDay:          0,    // PetDoc AI locked — Ultimate only
    symptomScansPerDay:     0,    // Symptom scanner locked — Ultimate only
    familyManagement:       0,
  },
  pro: {
    pets:                   5,
    moodScansPerDay:        10,
    realAiScansPerDay:      10,
    healthRecordsPerMonth:  -1,
    feedPostsPerMonth:      -1,
    videoPostsPerMonth:     -1,
    playdatesPerMonth:      -1,
    historyDays:            -1,
    vetChatPerDay:          0,    // PetDoc AI locked — Ultimate only per PRD
    symptomScansPerDay:     0,    // Symptom scanner locked — Ultimate only per PRD
    familyManagement:       1,
  },
  ultimate: {
    pets:                   5,    // PRD: up to 5 profiles
    moodScansPerDay:        10,
    realAiScansPerDay:      10,
    healthRecordsPerMonth:  -1,
    feedPostsPerMonth:      -1,
    videoPostsPerMonth:     -1,
    playdatesPerMonth:      -1,
    historyDays:            -1,
    vetChatPerDay:          50,   // Unlimited 24/7 PetDoc AI
    symptomScansPerDay:     3,    // 3 photo scans/day
    familyManagement:       1,
  },
};

// ── Feature key type ───────────────────────────────────────────────────────
export type FeatureKey = keyof (typeof LIMITS)[SubscriptionTier];

export function canAccess(tier: SubscriptionTier, feature: FeatureKey): boolean {
  const limit = LIMITS[tier][feature] as number;
  return limit !== 0;
}

export function getLimit(tier: SubscriptionTier, feature: FeatureKey): number {
  return LIMITS[tier][feature] as number;
}

export async function checkUsage(
  userId: string,
  tier: SubscriptionTier,
  feature: FeatureKey,
): Promise<{ allowed: boolean; current: number }> {
  const limit = getLimit(tier, feature);
  if (limit === -1) return { allowed: true, current: 0 };
  const colMap: Partial<Record<FeatureKey, string>> = {
    moodScansPerDay:       'mood_scans_today',
    realAiScansPerDay:     'ai_scans_today',
    healthRecordsPerMonth: 'health_records_month',
    feedPostsPerMonth:     'feed_posts_month',
    videoPostsPerMonth:    'video_posts_month',
    playdatesPerMonth:     'playdates_month',
    vetChatPerDay:         'vet_chat_today',
    symptomScansPerDay:    'symptom_scans_today',
  };
  const col = colMap[feature];
  if (!col) return { allowed: true, current: 0 };
  const { data } = await supabase
    .from('subscription_usage')
    .select(col)
    .eq('user_id', userId)
    .maybeSingle();
  const current = (data as any)?.[col] ?? 0;
  return { allowed: current < limit, current };
}

// ── RevenueCat helpers ─────────────────────────────────────────────────────
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export function isRevenueCatReady(): boolean {
  return !isExpoGo;
}

export async function initRevenueCat(userId: string): Promise<void> {
  console.log('[RC] initRevenueCat called, isExpoGo:', isExpoGo, 'Purchases:', !!Purchases);
  if (isExpoGo) return;
  try {
    Purchases?.configure({
      apiKey: Platform.OS === 'ios' ? RC_API_KEY_IOS : RC_API_KEY_ANDROID,
      // @ts-ignore — usesStoreKit2IfAvailable is valid at runtime but missing from older typings
      usesStoreKit2IfAvailable: false,
    });
    console.log('[RC] configured with StoreKit1');
    await Purchases?.logIn(userId);
    console.log('[RC] logged in:', userId);
  } catch (e) {
    console.warn('[RC] init error:', e);
  }
}

const DEV_MOCK_OFFERING: PurchasesOffering = {
  identifier: '$rc_default',
  serverDescription: 'Dev mock offering',
  metadata: {},
  availablePackages: [
    { identifier: '$rc_monthly', packageType: 'MONTHLY' as any, presentedOfferingContext: null as any, webCheckoutUrl: null, product: { identifier: 'pb_pro_monthly', productIdentifier: 'pb_pro_monthly', localizedTitle: 'PawBond Pro Monthly', localizedDescription: '', price: 5.99, priceString: '$5.99', currencyCode: 'USD', introPrice: { price: 0, priceString: 'Free', period: 'P1W', periodUnit: 'WEEK' as any, periodNumberOfUnits: 1, cycles: 1, paymentMode: 'FREE_TRIAL' as any }, subscriptionPeriod: 'P1M', discounts: [] } as any, offeringIdentifier: '$rc_default' },
    { identifier: '$rc_annual',  packageType: 'ANNUAL'  as any, presentedOfferingContext: null as any, webCheckoutUrl: null, product: { identifier: 'pb_pro_annual', productIdentifier: 'pb_pro_annual', localizedTitle: 'PawBond Pro Annual', localizedDescription: '', price: 39.99, priceString: '$39.99', currencyCode: 'USD', introPrice: { price: 0, priceString: 'Free', period: 'P1W', periodUnit: 'WEEK' as any, periodNumberOfUnits: 1, cycles: 1, paymentMode: 'FREE_TRIAL' as any }, subscriptionPeriod: 'P1Y', discounts: [] } as any, offeringIdentifier: '$rc_default' },
    { identifier: 'pb_ultimate_monthly', packageType: 'CUSTOM' as any, presentedOfferingContext: null as any, webCheckoutUrl: null, product: { identifier: 'pb_ultimate_monthly', productIdentifier: 'pb_ultimate_monthly', localizedTitle: 'PawBond Ultimate Monthly', localizedDescription: '', price: 9.99, priceString: '$9.99', currencyCode: 'USD', introPrice: { price: 0, priceString: 'Free', period: 'P1W', periodUnit: 'WEEK' as any, periodNumberOfUnits: 1, cycles: 1, paymentMode: 'FREE_TRIAL' as any }, subscriptionPeriod: 'P1M', discounts: [] } as any, offeringIdentifier: '$rc_default' },
    { identifier: 'pb_ultimate_annual',  packageType: 'CUSTOM' as any, presentedOfferingContext: null as any, webCheckoutUrl: null, product: { identifier: 'pb_ultimate_annual', productIdentifier: 'pb_ultimate_annual', localizedTitle: 'PawBond Ultimate Annual', localizedDescription: '', price: 69.99, priceString: '$69.99', currencyCode: 'USD', introPrice: { price: 0, priceString: 'Free', period: 'P1W', periodUnit: 'WEEK' as any, periodNumberOfUnits: 1, cycles: 1, paymentMode: 'FREE_TRIAL' as any }, subscriptionPeriod: 'P1Y', discounts: [] } as any, offeringIdentifier: '$rc_default' },
  ],
  lifetime: null,
  annual: null,
  sixMonth: null,
  threeMonth: null,
  twoMonth: null,
  monthly: null,
  weekly: null,
  webCheckoutUrl: null,
} as any;
let _offeringsPromise: Promise<any> | null = null;
function _fetchOfferings() {
  if (!_offeringsPromise) {
    _offeringsPromise = Purchases!.getOfferings().finally(() => { _offeringsPromise = null; });
  }
  return _offeringsPromise;
}

export async function getOfferings(): Promise<PurchasesOffering | null> {
  if (isExpoGo || !Purchases) return null;
  try {
    const offerings = await _fetchOfferings();
    if (offerings.current) return offerings.current;
    if (__DEV__) {
      console.warn('[RC] Offerings empty — using dev mock offering for UI testing');
      return DEV_MOCK_OFFERING;
    }
    return null;
  } catch {
    if (__DEV__) {
      console.warn('[RC] getOfferings failed — using dev mock offering for UI testing');
      return DEV_MOCK_OFFERING;
    }
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
    const entitlements = customerInfo.entitlements.active;
    const newTier: SubscriptionTier =
      entitlements[ENTITLEMENTS.ultimate] ? 'ultimate' :
      entitlements[ENTITLEMENTS.pro]     ? 'pro'     : 'free';
    // Update UI immediately from RC entitlements — authoritative, no need to wait for webhook
    const activeEnt = entitlements[ENTITLEMENTS.ultimate] ?? entitlements[ENTITLEMENTS.pro];
    const expiresAt = activeEnt?.expirationDate ? new Date(activeEnt.expirationDate) : null;
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
    const entitlements = customerInfo.entitlements.active;
    const tier: SubscriptionTier =
      entitlements[ENTITLEMENTS.ultimate] ? 'ultimate' :
      entitlements[ENTITLEMENTS.pro]     ? 'pro'     : 'free';
    if (tier !== 'free') {
      const activeEnt = entitlements[ENTITLEMENTS.ultimate] ?? entitlements[ENTITLEMENTS.pro];
      const expiresAt = activeEnt?.expirationDate ? new Date(activeEnt.expirationDate) : null;
      useSubscriptionStore.getState().setPurchasedTier(tier, 'active', expiresAt);
    }
    return { success: true, tier };
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Restore failed. Please try again.' };
  }
}
