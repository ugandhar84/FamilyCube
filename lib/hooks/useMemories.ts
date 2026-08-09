import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { CACHE } from '@/lib/queryClient';
import { getPhotosPage, getMilestones } from '@/lib/db/memories';

export const memoriesKeys = {
  photos:     (petId: string) => ['memories', 'photos', petId] as const,
  milestones: (petId: string) => ['memories', 'milestones', petId] as const,
};

/** Photos — 24 per page (3-column grid), cursor-based */
export function usePhotos(petId: string | null) {
  return useInfiniteQuery({
    queryKey: memoriesKeys.photos(petId ?? ''),
    queryFn: ({ pageParam }) => getPhotosPage(petId!, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!petId,
    staleTime: 60_000,
  });
}

export function flattenPhotos(data: ReturnType<typeof usePhotos>['data']) {
  return data?.pages.flatMap(p => p.photos) ?? [];
}

/** Milestones — small set, no pagination needed */
export function useMilestones(petId: string | null) {
  return useQuery({
    queryKey: memoriesKeys.milestones(petId ?? ''),
    queryFn: () => getMilestones(petId!),
    enabled: !!petId,
    ...CACHE.COLD,
  });
}
