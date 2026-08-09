import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

let Purchases: typeof import('react-native-purchases').default | null = null;
try { Purchases = require('react-native-purchases').default; } catch {}

const TIER_RANK: Record<string, number> = { free: 0, pro: 1, ultimate: 2 };
const ENTITLEMENTS = { pro: 'pro', ultimate: 'ultimate' };

// After a successful purchase, protect the just-set tier from being
// overwritten by a concurrent loadSubscription DB read (webhook may lag).
let purchaseLockUntil = 0;

async function getRCTier(): Promise<{ tier: SubscriptionTier; expiresAt: Date | null } | null> {
  if (!Purchases) return null;
  try {
    const info = await Purchases.getCustomerInfo();
    const ents = info.entitlements.active;
    if (!ents[ENTITLEMENTS.ultimate] && !ents[ENTITLEMENTS.pro]) return null;
    const tier: SubscriptionTier = ents[ENTITLEMENTS.ultimate] ? 'ultimate' : 'pro';
    const activeEnt = ents[ENTITLEMENTS.ultimate] ?? ents[ENTITLEMENTS.pro];
    const expiresAt = activeEnt.expirationDate ? new Date(activeEnt.expirationDate) : null;
    return { tier, expiresAt };
  } catch {
    return null;
  }
}

export type SubscriptionTier = 'free' | 'pro' | 'ultimate';
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'grace_period';

interface SubscriptionState {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  expiresAt: Date | null;
  loading: boolean;
  // Feature usage cache (current month)
  usage: Record<string, number>;

  // Actions
  loadSubscription: (userId: string) => Promise<void>;
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

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  tier: 'free',
  status: 'active',
  expiresAt: null,
  loading: true,
  usage: {},

  loadSubscription: async (userId: string) => {
    // Skip DB re-fetch for 30s after a successful purchase so the just-set
    // tier isn't overwritten before the webhook updates the DB.
    if (Date.now() < purchaseLockUntil) {
      set({ loading: false });
      return;
    }
    set({ loading: true });
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('tier, status, expires_at, fallback_tier')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;

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

      set({ tier: effectiveTier, status: dbStatus, expiresAt: effectiveExpiry, loading: false });
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
