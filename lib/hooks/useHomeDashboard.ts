import { useQuery, useQueries } from '@tanstack/react-query';
import { CACHE } from '@/lib/queryClient';
import { getHomeDashboard, getGlobalSummary } from '@/lib/db/home';
import { getSponsoredListings } from '@/lib/discovery';
import { format } from 'date-fns';

export const homeKeys = {
  dashboard:  (petId: string, date: string) => ['home', 'dashboard', petId, date] as const,
  sponsored:  (species: string[]) => ['home', 'sponsored', ...species.sort()] as const,
};

/**
 * All home-screen data in one RPC call.
 * Replaces: 6× HEAD counts + vet visit + scan count + latest mood + checklist + 2× notif counts
 * Stale after 30s — short enough to feel live, long enough to survive tab switching.
 */
export function useHomeDashboard(petId: string | null, userId: string | null) {
  const today = format(new Date(), 'yyyy-MM-dd');
  return useQuery({
    queryKey: homeKeys.dashboard(petId ?? '', today),
    queryFn: () => getHomeDashboard(petId!, userId!, today),
    enabled: !!petId && !!userId,
    ...CACHE.HOT,
    // Refetch every 60s in background while screen is mounted (live feel for checklist)
    refetchInterval: 60_000,
  });
}

/**
 * Single RPC aggregated across all pets for the summary card.
 * One DB call instead of N per-pet calls.
 */
export function useGlobalSummary(userId: string | null, enabled: boolean) {
  const today = format(new Date(), 'yyyy-MM-dd');
  return useQuery({
    queryKey: ['home', 'global-summary', userId ?? '', today],
    queryFn: () => getGlobalSummary(userId!, today),
    enabled: !!userId && enabled,
    ...CACHE.HOT,
    refetchInterval: 60_000,
  });
}

/**
 * Aggregated dashboard across all pets — used on the summary card.
 * Reuses per-pet cache entries (zero extra DB calls if pets were already viewed).
 */
export function useAllPetsDashboard(petIds: string[], userId: string | null) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const results = useQueries({
    queries: petIds.map(petId => ({
      queryKey: homeKeys.dashboard(petId, today),
      queryFn: () => getHomeDashboard(petId, userId!, today),
      enabled: !!userId && petIds.length > 0,
      ...CACHE.HOT,
    })),
  });

  const zero = { notes: 0, moods: 0, meals: 0, grooming: 0, weight: 0, vet: 0 };
  const combined = results.reduce((acc, r) => {
    const d = r.data;
    if (!d) return acc;
    const c = d.counts;
    return {
      counts: {
        notes:    acc.counts.notes    + c.notes,
        moods:    acc.counts.moods    + c.moods,
        meals:    acc.counts.meals    + c.meals,
        grooming: acc.counts.grooming + c.grooming,
        weight:   acc.counts.weight   + c.weight,
        vet:      acc.counts.vet      + c.vet,
      },
      scan_count: acc.scan_count + d.scan_count,
      // earliest upcoming vet across all pets
      next_vet: (() => {
        if (!acc.next_vet) return d.next_vet;
        if (!d.next_vet)   return acc.next_vet;
        return acc.next_vet < d.next_vet ? acc.next_vet : d.next_vet;
      })(),
      // most recent past vet across all pets
      last_vet: (() => {
        if (!acc.last_vet) return d.last_vet;
        if (!d.last_vet)   return acc.last_vet;
        return acc.last_vet.date > d.last_vet.date ? acc.last_vet : d.last_vet;
      })(),
      latest_mood: acc.latest_mood ?? d.latest_mood,
      checklist: [...acc.checklist, ...d.checklist],
      notif_general: acc.notif_general + d.notif_general,
      notif_social:  acc.notif_social  + d.notif_social,
    };
  }, {
    counts: { ...zero },
    scan_count: 0,
    next_vet: null as string | null,
    last_vet: null as { date: string; type: string; title: string } | null,
    latest_mood: null as any,
    checklist: [] as any[],
    notif_general: 0,
    notif_social: 0,
  });

  return { data: results.length > 0 ? combined : null };
}

/**
 * Sponsored listings — species-targeted, cached 10 min.
 */
export function useSponsoredListings(speciesList: string[] = [], activePetSpecies: string | null = null) {
  return useQuery({
    queryKey: homeKeys.sponsored(speciesList),
    queryFn: () => getSponsoredListings(speciesList, activePetSpecies),
    ...CACHE.COLD,
    refetchOnWindowFocus: false,
  });
}
