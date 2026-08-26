/**
 * Real Family Cube admin data layer — replaces the entirely-unmodified
 * PawBond template version of this file, which queried tables that are not
 * part of Family Cube's real schema. The pet-tracking feature that was the
 * last consumer of those exports has since been removed outright.
 *
 * This file backs the new admin console (features/admin):
 *   - lightweight family/member stats for the admin home screen
 *   - feature-flag + paywall-group read/write helpers, reusing
 *     lib/featureFlags.ts's own registry/cache where it makes sense
 */
import { supabase } from '@/lib/supabase';
import type { FeatureFlagKey } from '@/lib/featureFlags';

// ── Admin home stats ─────────────────────────────────────────────────────────
// Backed by admin_get_platform_stats() — a security-definer RPC gated by
// is_app_admin() (20260925092000_admin_advanced_controls.sql). Aggregate
// counts only, returns zero rows for a non-admin caller.

export type AdminHomeStats = {
  totalFamilies: number;
  totalMembers: number;
};

export async function getAdminHomeStats(): Promise<AdminHomeStats> {
  const stats = await getPlatformStats();
  return { totalFamilies: stats.totalFamilies, totalMembers: stats.totalMembers };
}

export type PlatformStats = {
  totalFamilies: number;
  totalMembers: number;
  totalParents: number;
  totalKids: number;
  totalChores: number;
  choresCompleted: number;
  totalEvents: number;
  totalChatMessages: number;
  totalKidRequests: number;
  kidRequestsPending: number;
  singleMemberFamilies: number;
};

export async function getPlatformStats(): Promise<PlatformStats> {
  const { data, error } = await supabase.rpc('admin_get_platform_stats').single();
  if (error) throw new Error(error.message);
  const row = data as any;
  return {
    totalFamilies: row.total_families ?? 0,
    totalMembers: row.total_members ?? 0,
    totalParents: row.total_parents ?? 0,
    totalKids: row.total_kids ?? 0,
    totalChores: row.total_chores ?? 0,
    choresCompleted: row.chores_completed ?? 0,
    totalEvents: row.total_events ?? 0,
    totalChatMessages: row.total_chat_messages ?? 0,
    totalKidRequests: row.total_kid_requests ?? 0,
    kidRequestsPending: row.kid_requests_pending ?? 0,
    singleMemberFamilies: row.single_member_families ?? 0,
  };
}

// ── Cross-family directory ───────────────────────────────────────────────────
// Backed by admin_list_families()/admin_list_family_members() — same
// is_app_admin()-gated RPC pattern. SELECT-only; no write path exists for
// another family's data from the admin console.

export type AdminFamilyRow = {
  familyId: string;
  familyName: string;
  memberCount: number;
  createdAt: string;
  isSoloFamily: boolean;
  creatorEmail: string | null;
};

export async function getAdminFamilies(): Promise<AdminFamilyRow[]> {
  const { data, error } = await supabase.rpc('admin_list_families');
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map(r => ({
    familyId: r.family_id,
    familyName: r.family_name,
    memberCount: r.member_count ?? 0,
    createdAt: r.created_at,
    isSoloFamily: !!r.is_solo_family,
    creatorEmail: r.creator_email ?? null,
  }));
}

export type DuplicateFamilyCreator = {
  creatorEmail: string | null;
  createdBy: string;
  familyIds: string[];
  familyNames: string[];
  familyCount: number;
};

/** Accounts that have created more than one family — should be 0 once idx_families_created_by_unique is enforced; see 20260925097000_prevent_duplicate_family_creation.sql. */
export async function getDuplicateFamilyCreators(): Promise<DuplicateFamilyCreator[]> {
  const { data, error } = await supabase.rpc('admin_list_duplicate_family_creators');
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map(r => ({
    creatorEmail: r.creator_email ?? null,
    createdBy: r.created_by,
    familyIds: r.family_ids ?? [],
    familyNames: r.family_names ?? [],
    familyCount: r.family_count ?? 0,
  }));
}

/** Deletes an EMPTY (zero-member) family — refuses server-side if it still has members. */
export async function deleteEmptyFamily(familyId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_empty_family', { target_family_id: familyId });
  if (error) throw new Error(error.message);
}

export type AdminFamilyMemberRow = {
  memberId: string;
  name: string;
  role: string;
  coins: number;
  level: number;
  lastActive: string | null;
  createdAt: string;
};

export async function getAdminFamilyMembers(familyId: string): Promise<AdminFamilyMemberRow[]> {
  const { data, error } = await supabase.rpc('admin_list_family_members', { target_family_id: familyId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map(r => ({
    memberId: r.member_id,
    name: r.name,
    role: r.role,
    coins: r.coins ?? 0,
    level: r.level ?? 1,
    lastActive: r.last_active,
    createdAt: r.created_at,
  }));
}

// ── Users directory ───────────────────────────────────────────────────────────
// Backed by admin_list_users() — searchable/filterable/paginated roster of
// every signed-up account (profiles), with family + subscription tier
// joined in. Real per-account data, not just aggregate counts.

export type AdminUserFilter = 'all' | 'new7d' | 'onboarded' | 'not_onboarded' | 'admin' | 'blocked';
export type AdminUserSort = 'newest' | 'oldest';

export type AdminUserRow = {
  authUserId: string;
  email: string | null;
  fullName: string | null;
  createdAt: string;
  onboardingCompleted: boolean;
  isAdmin: boolean;
  familyId: string | null;
  familyName: string | null;
  memberRole: string | null;
  subscriptionTier: string | null;
  blockedAt: string | null;
  blockedReason: string | null;
  /** How many ADDITIONAL families this account belongs to, beyond the one shown (familyName/memberRole) — e.g. a grandparent in two households. 0 for the common case. */
  otherFamilyCount: number;
};

export async function getAdminUsers(opts: {
  search?: string;
  filter?: AdminUserFilter;
  sort?: AdminUserSort;
  offset?: number;
  limit?: number;
} = {}): Promise<AdminUserRow[]> {
  const { data, error } = await supabase.rpc('admin_list_users', {
    search: opts.search?.trim() || null,
    filter_key: opts.filter ?? 'all',
    sort_key: opts.sort ?? 'newest',
    page_offset: opts.offset ?? 0,
    page_limit: opts.limit ?? 50,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map(r => ({
    authUserId: r.auth_user_id,
    email: r.email,
    fullName: r.full_name,
    createdAt: r.created_at,
    onboardingCompleted: !!r.onboarding_completed,
    isAdmin: !!r.is_admin,
    familyId: r.family_id,
    familyName: r.family_name,
    memberRole: r.member_role,
    subscriptionTier: r.subscription_tier,
    blockedAt: r.blocked_at,
    blockedReason: r.blocked_reason,
    otherFamilyCount: r.other_family_count ?? 0,
  }));
}

/** Blocks or unblocks a user account (real Supabase Auth ban — GoTrue refuses sign-in/refresh once blocked). */
export async function setUserBlocked(targetUserId: string, blocked: boolean, reason?: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('admin-set-user-blocked', {
    body: { target_user_id: targetUserId, blocked, reason },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
}

/** Soft-deletes a user account (7-day grace period, same mechanism as self-service account deletion). */
export async function deleteUserAccount(targetUserId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('delete-account', {
    body: { user_id: targetUserId },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
}

// ── Growth analytics ──────────────────────────────────────────────────────────
// Backed by admin_get_growth_stats()/admin_get_weekly_signups() — real data
// only: profiles.created_at (signups) and subscriptions.tier (RevenueCat-
// driven). No fabricated MRR — this schema stores no pricing, only tier.

export type GrowthStats = {
  signupsTotal: number;
  signups7d: number;
  signups30d: number;
  signups90d: number;
  signups365d: number;
  signupsPrev7d: number;
  signupsPrev30d: number;
  signupsPrev365d: number;
  onboardedTotal: number;
  onboardingRatePct: number;
  subsFree: number;
  subsPro: number;
  subsUltimate: number;
};

export async function getGrowthStats(): Promise<GrowthStats> {
  const { data, error } = await supabase.rpc('admin_get_growth_stats').single();
  if (error) throw new Error(error.message);
  const row = data as any;
  return {
    signupsTotal: row.signups_total ?? 0,
    signups7d: row.signups_7d ?? 0,
    signups30d: row.signups_30d ?? 0,
    signups90d: row.signups_90d ?? 0,
    signups365d: row.signups_365d ?? 0,
    signupsPrev7d: row.signups_prev_7d ?? 0,
    signupsPrev30d: row.signups_prev_30d ?? 0,
    signupsPrev365d: row.signups_prev_365d ?? 0,
    onboardedTotal: row.onboarded_total ?? 0,
    onboardingRatePct: Number(row.onboarding_rate_pct ?? 0),
    subsFree: row.subs_free ?? 0,
    subsPro: row.subs_pro ?? 0,
    subsUltimate: row.subs_ultimate ?? 0,
  };
}

export type WeeklySignups = { weekStart: string; signups: number };

export async function getWeeklySignups(weeksBack = 12): Promise<WeeklySignups[]> {
  const { data, error } = await supabase.rpc('admin_get_weekly_signups', { weeks_back: weeksBack });
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map(r => ({ weekStart: r.week_start, signups: r.signups ?? 0 }));
}

/** Percent change from `prev` to `curr`, or null if prev is 0 (undefined growth rate). */
export function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return curr > 0 ? null : 0;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

// ── Push broadcast ────────────────────────────────────────────────────────────
// Invokes the existing supabase/functions/send-broadcast edge function
// (updated to check app_admins instead of the old profiles.is_admin).

export type BroadcastAudience = 'all' | 'parents';

export async function sendAdminBroadcast(
  title: string,
  body: string,
  audience: BroadcastAudience = 'all',
): Promise<{ sent: number }> {
  const { data, error } = await supabase.functions.invoke('send-broadcast', {
    body: { title, body, audience },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return { sent: data?.sent ?? 0 };
}

// ── Feature flags (admin write path) ─────────────────────────────────────────
// Reads should go through lib/featureFlags.ts's own useFeatureFlag/
// isFeatureEnabled (realtime-subscribed cache) — this is the write side
// only, gated server-side by the feature_flags_admin_write RLS policy
// (is_app_admin()).

export async function setFeatureFlag(key: FeatureFlagKey, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('feature_flags')
    .upsert({ key, enabled, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
}

// ── Paywall groups ────────────────────────────────────────────────────────────

export type PaywallGroupRow = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  created_at: string;
};

export async function getPaywallGroups(): Promise<PaywallGroupRow[]> {
  const { data, error } = await supabase
    .from('paywall_groups')
    .select('id, key, label, description, created_at')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PaywallGroupRow[];
}

export async function createPaywallGroup(input: { key: string; label: string; description?: string | null }): Promise<PaywallGroupRow> {
  const { data, error } = await supabase
    .from('paywall_groups')
    .insert({ key: input.key.trim(), label: input.label.trim(), description: input.description?.trim() || null })
    .select('id, key, label, description, created_at')
    .single();
  if (error) throw new Error(error.message);
  return data as PaywallGroupRow;
}

export async function updatePaywallGroup(id: string, updates: { label?: string; description?: string | null }): Promise<void> {
  const { error } = await supabase.from('paywall_groups').update(updates).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deletePaywallGroup(id: string): Promise<void> {
  // feature_paywall_assignments.paywall_group_id has ON DELETE CASCADE —
  // deleting a group also clears any assignments pointing at it (those
  // features simply fall back to unrestricted/free).
  const { error } = await supabase.from('paywall_groups').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Feature → paywall group assignments ──────────────────────────────────────

export type FeaturePaywallAssignmentRow = {
  id: string;
  feature_key: string;
  paywall_group_id: string;
};

export async function getFeaturePaywallAssignments(): Promise<FeaturePaywallAssignmentRow[]> {
  const { data, error } = await supabase
    .from('feature_paywall_assignments')
    .select('id, feature_key, paywall_group_id');
  if (error) throw new Error(error.message);
  return (data ?? []) as FeaturePaywallAssignmentRow[];
}

/** Assign a feature to a paywall group, or clear its assignment (unrestricted) when groupId is null. */
export async function setFeaturePaywallAssignment(featureKey: string, groupId: string | null): Promise<void> {
  if (groupId === null) {
    const { error } = await supabase.from('feature_paywall_assignments').delete().eq('feature_key', featureKey);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await supabase
    .from('feature_paywall_assignments')
    .upsert(
      { feature_key: featureKey, paywall_group_id: groupId, updated_at: new Date().toISOString() },
      { onConflict: 'feature_key' },
    );
  if (error) throw new Error(error.message);
}
