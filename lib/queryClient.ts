import { QueryClient } from '@tanstack/react-query';

// ── Cache tiers — pick the one that matches how fast the data changes ─────────
//
//  REALTIME   stale: 0      gc: 2 min   — chat, live feed (Supabase realtime owns freshness)
//  HOT        stale: 30s    gc: 5 min   — social feed, home activity (users post frequently)
//  WARM       stale: 2 min  gc: 10 min  — health records, journal (edited a few times a week)
//  COOL       stale: 10 min gc: 30 min  — pet profile, vaccines, weight (rarely changes)
//  COLD       stale: 30 min gc: 60 min  — app settings, feature flags, milestones (near-static)

export const CACHE = {
  REALTIME: { staleTime: 0,           gcTime: 2  * 60_000 },
  HOT:      { staleTime: 30_000,      gcTime: 5  * 60_000 },
  WARM:     { staleTime: 2  * 60_000, gcTime: 10 * 60_000 },
  COOL:     { staleTime: 10 * 60_000, gcTime: 30 * 60_000 },
  COLD:     { staleTime: 30 * 60_000, gcTime: 60 * 60_000 },
} as const;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Default: WARM — sensible middle ground for health-record-type data
      ...CACHE.WARM,
      // Retry once on transient network failures, not 3× (avoids hammering Supabase)
      retry: 1,
      // Refetch when app comes back to foreground / tab regains focus
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 0,
    },
  },
});
