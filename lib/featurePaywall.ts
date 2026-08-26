/**
 * Runtime consumption helper for the dynamic paywall-groups system
 * (features/admin/screens/paywall-groups.tsx manages the source data).
 *
 * A feature_flags key can be assigned, at runtime, to a paywall_groups row
 * via feature_paywall_assignments. This hook resolves that assignment for
 * a given feature key. A feature with no assignment row is free/
 * unrestricted — returns null.
 *
 * Deliberately NOT wired into any existing feature-gating call site yet —
 * out of scope for this task. Consumers should treat a null return as "no
 * restriction" and a non-null return as "gated behind this paywall group's
 * key", and decide their own enforcement (e.g. compare against the
 * member/household's actual subscription tier once that concept exists).
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { FeatureFlagKey } from '@/lib/featureFlags';

export interface PaywallGroup {
  id: string;
  key: string;
  label: string;
  description: string | null;
}

// Small in-memory cache — same shape of concern as featureFlags.ts's own
// cache: this hook may mount in several places at once and shouldn't each
// issue their own round trip.
let groupsCache: PaywallGroup[] | null = null;
let assignmentsCache: Map<string, string> | null = null; // feature_key -> paywall_group_id
let fetchPromise: Promise<void> | null = null;

async function fetchAll(): Promise<void> {
  try {
    const [{ data: groups }, { data: assignments }] = await Promise.all([
      supabase.from('paywall_groups').select('id, key, label, description'),
      supabase.from('feature_paywall_assignments').select('feature_key, paywall_group_id'),
    ]);
    groupsCache = (groups ?? []) as PaywallGroup[];
    assignmentsCache = new Map((assignments ?? []).map(a => [a.feature_key as string, a.paywall_group_id as string]));
  } catch {
    groupsCache = groupsCache ?? [];
    assignmentsCache = assignmentsCache ?? new Map();
  }
}

/** Force a fresh fetch on next read — call after an admin-console write. */
export function invalidateFeaturePaywallCache(): void {
  groupsCache = null;
  assignmentsCache = null;
  fetchPromise = null;
}

/**
 * Returns the paywall group assigned to `featureKey`, or null if the
 * feature is unrestricted. `loading` is true until the first fetch
 * resolves.
 */
export function useFeaturePaywallGroup(featureKey: FeatureFlagKey | string): {
  group: PaywallGroup | null;
  loading: boolean;
} {
  const [group, setGroup] = useState<PaywallGroup | null>(null);
  const [loading, setLoading] = useState(groupsCache === null);

  useEffect(() => {
    let cancelled = false;
    const resolve = () => {
      if (!groupsCache || !assignmentsCache) return;
      const groupId = assignmentsCache.get(featureKey);
      const resolved = groupId ? groupsCache.find(g => g.id === groupId) ?? null : null;
      if (!cancelled) { setGroup(resolved); setLoading(false); }
    };

    if (groupsCache) {
      resolve();
    } else {
      if (!fetchPromise) fetchPromise = fetchAll();
      fetchPromise.then(resolve);
    }

    return () => { cancelled = true; };
  }, [featureKey]);

  return { group, loading };
}
