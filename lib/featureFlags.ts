/**
 * Feature flags — gate unreleased features without shipping them to users.
 *
 * HOW TO USE:
 *   const enabled = useFeatureFlag('gamification');
 *   if (!enabled) return null;
 *
 * HOW TO ENABLE FOR TESTING:
 *   Set LOCAL_OVERRIDES below to true while developing.
 *   For remote toggling, flip the flag in Supabase → Table Editor → feature_flags.
 *
 * HOW TO SHIP:
 *   Move the flag from LOCAL_OVERRIDES to DEFAULTS with value true,
 *   then delete the flag entry entirely once fully rolled out.
 */

import { useEffect, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { supabase } from '@/lib/supabase';

// ─── Flag registry ────────────────────────────────────────────────────────────

export type FeatureFlagKey =
  | 'gamification'         // XP / levels / coins / daily quests / leaderboard
  | 'daily_quests'         // Daily quest panel (sub-feature of gamification)
  | 'leaderboard'          // Weekly leaderboard (sub-feature of gamification)
  | 'cuteness_arena'       // Weekly bracket vote (sub-feature of gamification)
  | 'pet_report_card'      // Monthly auto-generated shareable stat card
  | 'seasonal_events'      // Time-limited holiday challenges
  | 'rewards_marketplace' // Partner coupons redeemable with coins
  | 'sponsored_ads'       // Sponsored partner listings on home screen
  | 'per_device_e2e';     // Multi-device chat encryption envelope (see lib/chatCrypto.ts)

/** Default state when no remote override exists. All OFF until you're ready. */
const DEFAULTS: Record<FeatureFlagKey, boolean> = {
  gamification:        true,
  daily_quests:        false,
  leaderboard:         false,
  cuteness_arena:      false,
  pet_report_card:     false,
  seasonal_events:     false,
  rewards_marketplace: false,
  sponsored_ads:       true,
  per_device_e2e:      false,
};

/**
 * Local dev overrides — flip to true here to test on your device.
 * These NEVER reach production users (Supabase remote flags win over these).
 * Commit with all false; override locally only.
 */
const LOCAL_OVERRIDES: Partial<Record<FeatureFlagKey, boolean>> = {
  // gamification: true,   // ← uncomment to test locally
};

// ─── In-memory cache ──────────────────────────────────────────────────────────

let cachedFlags: Record<FeatureFlagKey, boolean> | null = null;
let fetchPromise: Promise<void> | null = null;

// All mounted useFeatureFlag instances register here so a realtime update
// or foreground-resume triggers an immediate re-render on every gated component.
const listeners = new Set<() => void>();

async function fetchRemoteFlags(): Promise<void> {
  try {
    const { data, error } = await supabase.from('feature_flags').select('key, enabled');
    if (error || !data) return;
    const remote: Partial<Record<FeatureFlagKey, boolean>> = {};
    for (const row of data) {
      if (row.key in DEFAULTS) remote[row.key as FeatureFlagKey] = row.enabled;
    }
    cachedFlags = { ...DEFAULTS, ...remote };
    listeners.forEach(fn => fn());
  } catch {
    cachedFlags = { ...DEFAULTS };
  }
}

/** Force a fresh fetch — clears the cache so next call hits Supabase. */
export function invalidateFeatureFlags(): void {
  cachedFlags = null;
  fetchPromise = fetchRemoteFlags();
}

// Re-fetch whenever the app comes back to the foreground
AppState.addEventListener('change', (state: AppStateStatus) => {
  if (state === 'active') invalidateFeatureFlags();
});

function getFlags(): Record<FeatureFlagKey, boolean> {
  return { ...(cachedFlags ?? DEFAULTS), ...LOCAL_OVERRIDES };
}

function notifyAll() {
  listeners.forEach(fn => fn());
}

// ─── Realtime subscription (singleton) ───────────────────────────────────────
// Wired up once; every toggle in the admin panel silently propagates to all
// mounted components within ~1 second — no app restart needed.

let realtimeReady = false;

function ensureRealtime() {
  if (realtimeReady) return;
  realtimeReady = true;
  supabase
    .channel('feature_flags:changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'feature_flags' }, async (payload) => {
      // Patch the single changed row into the cache immediately, then notify.
      const row = (payload.new ?? payload.old) as { key: string; enabled: boolean } | undefined;
      if (row && row.key in DEFAULTS) {
        if (!cachedFlags) cachedFlags = { ...DEFAULTS };
        (cachedFlags as any)[row.key] = row.enabled;
        notifyAll();
      } else {
        // Unknown key — refresh everything to stay in sync.
        await fetchRemoteFlags();
      }
    })
    .subscribe();
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFeatureFlag(key: FeatureFlagKey): boolean {
  const [enabled, setEnabled] = useState(() => getFlags()[key]);

  useEffect(() => {
    // Sync immediately if cache is warm
    if (cachedFlags) setEnabled(getFlags()[key]);

    // Register as a listener so realtime updates and foreground resume re-render this component.
    const refresh = () => setEnabled(getFlags()[key]);
    listeners.add(refresh);

    // Kick off a fetch if not already in flight
    if (!fetchPromise) fetchPromise = fetchRemoteFlags();
    fetchPromise.then(refresh);

    ensureRealtime();

    return () => { listeners.delete(refresh); };
  }, [key]);

  return enabled;
}

/** Synchronous check — use outside of components (e.g. in navigation guards). */
export function isFeatureEnabled(key: FeatureFlagKey): boolean {
  return getFlags()[key];
}

/** Call once at app boot (e.g. in _layout.tsx) to pre-warm the cache. */
export async function prefetchFeatureFlags(): Promise<void> {
  if (!fetchPromise) fetchPromise = fetchRemoteFlags();
  await fetchPromise;
  ensureRealtime();
}
