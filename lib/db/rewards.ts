import { todayLocal, localDateStr } from '@/lib/dates';
import { supabase } from '@/lib/supabase';

export interface PartnerOffer {
  id: string;
  partner_name: string;
  partner_logo: string | null;
  title: string;
  description: string | null;
  category: string;
  coins_cost: number;
  discount_pct: number | null;
  discount_amt: number | null;
  coupon_type: 'code' | 'link' | 'qr';
  affiliate_url: string | null;
  max_uses_per_user: number;
  total_stock: number | null;
  redeemed_count: number;
  valid_until: string | null;
  is_featured: boolean;
}

export interface UserCoupon {
  id: string;
  offer_id: string;
  coupon_code: string | null;
  coins_spent: number;
  status: 'active' | 'used' | 'expired';
  redeemed_at: string;
  expires_at: string | null;
  offer?: PartnerOffer;
}

export interface RedeemResult {
  ok: boolean;
  error?: string;
  need?: number;
  have?: number;
  coupon_id?: string;
  coupon_code?: string | null;
  affiliate_url?: string | null;
  coins_left?: number;
}

export async function fetchOffers(): Promise<PartnerOffer[]> {
  const { data, error } = await supabase
    .from('partner_offers')
    .select('id,partner_name,partner_logo,title,description,category,coins_cost,discount_pct,discount_amt,coupon_type,affiliate_url,max_uses_per_user,total_stock,redeemed_count,valid_until,is_featured')
    .eq('is_active', true)
    .order('is_featured', { ascending: false })
    .order('coins_cost', { ascending: true });
  if (error) throw error;
  return (data ?? []) as PartnerOffer[];
}

export async function fetchMyCoupons(userId: string): Promise<UserCoupon[]> {
  const { data, error } = await supabase
    .from('user_coupons')
    .select('id,offer_id,coupon_code,coins_spent,status,redeemed_at,expires_at,offer:partner_offers(id,partner_name,partner_logo,title,category,discount_pct)')
    .eq('user_id', userId)
    .order('redeemed_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as UserCoupon[];
}

export async function redeemOffer(userId: string, offerId: string): Promise<RedeemResult> {
  const { data, error } = await supabase.rpc('redeem_offer', {
    p_user_id: userId,
    p_offer_id: offerId,
  });
  if (error) return { ok: false, error: error.message };
  return data as RedeemResult;
}

export async function fetchCoinBalance(userId: string): Promise<number> {
  const { data } = await supabase
    .from('profiles')
    .select('coins')
    .eq('id', userId)
    .single();
  return data?.coins ?? 0;
}

export async function markCouponUsed(couponId: string): Promise<void> {
  await supabase
    .from('user_coupons')
    .update({ status: 'used', used_at: new Date().toISOString() })
    .eq('id', couponId);
}

/** Coin action keys — for type safety on callers */
export type CoinAction =
  | 'daily_login'
  | 'post_created'
  | 'post_liked'
  | 'comment_added'
  | 'streak_7day'
  | 'streak_30day'
  | 'level_up';

export interface AwardResult {
  ok: boolean;
  coins_awarded?: number;
  balance?: number;
  today_earned?: number;
  daily_cap?: number;
  remaining?: number;
  error?: string;
  skip?: boolean;       // true = silent skip (cooldown, cap, new account) — don't show error
}

export interface StreakResult {
  ok: boolean;
  streak?: number;
  changed?: boolean;
  milestone?: string | null;
}

/**
 * Award coins via server-side RPC — all guards enforced in Postgres.
 * Client cannot cheat: direct writes to profiles.coins are blocked by RLS
 * + column-level REVOKE. This is the only valid path.
 */
export async function awardCoins(
  userId: string,
  action: CoinAction,
  refId?: string,
): Promise<AwardResult> {
  const { data, error } = await supabase.rpc('award_coins', {
    p_user_id: userId,
    p_action:  action,
    p_ref_id:  refId ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return data as AwardResult;
}

/**
 * Update login streak and fire streak milestone awards.
 * Call once per session after the user logs in or opens the app.
 */
export async function updateStreak(userId: string): Promise<StreakResult> {
  const { data, error } = await supabase.rpc('update_streak', { p_user_id: userId });
  if (error) return { ok: false };
  return data as StreakResult;
}

/** @deprecated — kept only for reference; replaced by server-side award_coins() */
export const COIN_REWARDS: Record<string, number> = {
  daily_login:   10,
  post_created:  20,
  post_liked:    2,
  comment_added: 5,
  streak_7day:   50,
  streak_30day:  200,
  level_up:      100,
};

/** Fetch user's remaining daily coin budget (for UI hints) */
export async function fetchDailyProgress(userId: string): Promise<{ earned: number; cap: number; remaining: number }> {
  const today = todayLocal();
  const { data } = await supabase
    .from('coin_ledger')
    .select('delta')
    .eq('user_id', userId)
    .gte('created_at', today)
    .gt('delta', 0);
  const earned = (data ?? []).reduce((s, r) => s + r.delta, 0);
  return { earned, cap: 100, remaining: Math.max(0, 100 - earned) };
}

