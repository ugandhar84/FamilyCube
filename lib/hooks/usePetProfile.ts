import { useQuery } from '@tanstack/react-query';
import { CACHE } from '@/lib/queryClient';
import { getPetProfile, DEFAULT_PET_PRIVACY } from '@/lib/db/petProfile';
import { usePetStore } from '@/store/petStore';

export const petProfileKeys = {
  profile: (petId: string) => ['pet-profile', petId] as const,
};

/**
 * Loads a pet profile — checks local store first (instant for own pets),
 * falls back to DB fetch (for other users' pets).
 * Cached for 5 minutes so tapping back and forward is instant.
 */
export function usePetProfile(petId: string | null) {
  const { pets } = usePetStore();
  const localPet = pets.find(p => p.id === petId);

  return useQuery({
    queryKey: petProfileKeys.profile(petId ?? ''),
    queryFn: () => getPetProfile(petId!),
    enabled: !!petId,
    staleTime: 0,              // always refetch — avoids stale null after RLS changes
    gcTime: CACHE.COOL.gcTime, // keep in memory 30 min once fetched
    retry: 2,
    // If pet is in local store, use it as placeholder — no loading spinner
    placeholderData: localPet ? {
      pet: localPet as any,
      allergies: [],
      isOwner: false,             // will be corrected by real fetch
      privacy: DEFAULT_PET_PRIVACY,
    } : undefined,
  });
}
