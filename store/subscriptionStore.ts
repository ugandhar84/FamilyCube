import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { PREMIUM_ENTITLEMENT } from '@/lib/subscription';

let Purchases: typeof import('react-native-purchases').default | null = null;
try { Purchases = require('react-native-purchases').default; } catch {}

// Single paid tier — Family Cube gates on "subscribed or not", never on
// which of several tiers (see docs/paywall_setup_and_implementation.md).
const TIER_RANK: Record<string, number> = { free: 0, premium: 1 };

// After a successful purchase, protect the just-set tier from being
// overwritten by a concurrent loadSubscription DB read (webhook may lag).
let purchaseLockUntil = 0;

async function getRCTier(): Promise<{ tier: SubscriptionTier; expiresAt: Date | null } | null> {
  if (!Purchases) return null;
  try {
    const info = await Purchases.getCustomerInfo();
    const activeEnt = info.entitlements.active[PREMIUM_ENTITLEMENT];
    if (!activeEnt) return null;
    const expiresAt = activeEnt.expirationDate ? new Date(activeEnt.expirationDate) : null;
    return { tier: 'premium', expiresAt };
  } catch {
    return null;
  }
}

export const FREE_TRIAL_DAYS = 7;

export type SubscriptionTier = 'free' | 'premium';
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'grace_period';

interface SubscriptionState {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  expiresAt: Date | null;
  loading: boolean;
  // 7-day free trial — full access from family creation date
  trialEndsAt: Date | null;
  trialDaysLeft: number;   // 0 when expired; -1 when no family yet
  isTrial: boolean;        // true while within the 7-day window and not subscribed
  usage: Record<string, number>;

  // Actions
  loadSubscription: (userId: string, familyId?: string) => Promise<void>;
  setTier: (tier: SubscriptionTier, status?: SubscriptionStatus, expiresAt?: Date | null) => void;
  setPurchasedTier: (tier: SubscriptionTier, status?: SubscriptionStatus, expiresAt?: Date | null) => void;
  refreshUsage: (userId: string, feature: string) => Promise<number>;
  incrementUsage: (userId: string, feature: string) => Promise<number>;
  reset: () => void;
}

const currentPeriod = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const dailyPeriod = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getPeriod = (feature: string) =>
  feature.endsWith('PerDay') ? dailyPeriod() : currentPeriod();

function computeTrial(familyCreatedAt: string | null): { trialEndsAt: Date | null; trialDaysLeft: number; isTrial: boolean } {
  if (!familyCreatedAt) return { trialEndsAt: null, trialDaysLeft: -1, isTrial: false };
  const trialEndsAt = new Date(new Date(familyCreatedAt).getTime() + FREE_TRIAL_DAYS * 86_400_000);
  const msLeft = trialEndsAt.getTime() - Date.now();
  const trialDaysLeft = Math.max(0, Math.ceil(msLeft / 86_400_000));
  return { trialEndsAt, trialDaysLeft, isTrial: msLeft > 0 };
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  tier: 'free',
  status: 'active',
  expiresAt: null,
  loading: true,
  trialEndsAt: null,
  trialDaysLeft: -1,
  isTrial: false,
  usage: {},

  loadSubscription: async (userId: string, familyId?: string) => {
    if (Date.now() < purchaseLockUntil) {
      set({ loading: false });
      return;
    }
    set({ loading: true });
    try {
      const [subResult, familyResult] = await Promise.all([
        supabase.from('subscriptions').select('tier, status, expires_at, fallback_tier').eq('user_id', userId).maybeSingle(),
        familyId ? supabase.from('families').select('created_at').eq('id', familyId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      ]);

      const { data, error } = subResult;
      if (error) throw error;

      const trial = computeTrial((familyResult.data as any)?.created_at ?? null);

      const expiresAt = data?.expires_at ? new Date(data.expires_at) : null;
      const isExpired = expiresAt ? expiresAt < new Date() && data?.status !== 'grace_period' : false;
      const dbTier: SubscriptionTier = !data
        ? 'free'
        : isExpired
          ? ((data as any).fallback_tier as SubscriptionTier ?? 'free')
          : (data.tier as SubscriptionTier);
      const dbStatus: SubscriptionStatus = !data ? 'active' : isExpired ? 'expired' : (data.status as SubscriptionStatus);

      // If DB shows free/lower tier, check RC directly — webhook may not have fired yet
      const rcResult = (TIER_RANK[dbTier] < 2) ? await getRCTier() : null;
      const effectiveTier = rcResult && TIER_RANK[rcResult.tier] > TIER_RANK[dbTier] ? rcResult.tier : dbTier;
      const effectiveExpiry = rcResult && TIER_RANK[rcResult.tier] > TIER_RANK[dbTier] ? rcResult.expiresAt : expiresAt;

      const isSubscribed = TIER_RANK[effectiveTier] > 0;
      set({
        tier: effectiveTier, status: dbStatus, expiresAt: effectiveExpiry, loading: false,
        ...trial,
        // suppress trial once subscribed — no need to show countdown to paying users
        isTrial: isSubscribed ? false : trial.isTrial,
      });
    } catch {
      // Keep whatever tier is currently in the store rather than dropping to free —
      // a network hiccup shouldn't revoke a paying user's access.
      set({ loading: false });
    }
  },

  // Called from realtime DB updates — does NOT set the purchase lock
  setTier: (tier, status = 'active', expiresAt = null) => {
    set({ tier, status, expiresAt });
  },

  // Called after a successful purchase/restore — locks loadSubscription for 30s
  // so the just-set tier isn't overwritten before the webhook updates the DB
  setPurchasedTier: (tier, status = 'active', expiresAt = null) => {
    purchaseLockUntil = Date.now() + 30_000;
    set({ tier, status, expiresAt });
  },

  reset: () => {
    purchaseLockUntil = 0; // clear lock on sign-out so next user isn't blocked
    set({ tier: 'free', status: 'active', expiresAt: null, loading: false, usage: {} });
  },

  refreshUsage: async (userId: string, feature: string) => {
    const { data, error } = await supabase.rpc('get_feature_usage', {
      p_user_id: userId,
      p_feature: feature,
      p_period: getPeriod(feature),
    });
    if (error) throw error;
    const count = data ?? 0;
    set(s => ({ usage: { ...s.usage, [feature]: count } }));
    return count;
  },

  incrementUsage: async (userId: string, feature: string) => {
    const { data, error } = await supabase.rpc('increment_feature_usage', {
      p_user_id: userId,
      p_feature: feature,
      p_period: getPeriod(feature),
    });
    if (error) throw error;
    const count = data ?? 1;
    set(s => ({ usage: { ...s.usage, [feature]: count } }));
    return count;
  },
}));
