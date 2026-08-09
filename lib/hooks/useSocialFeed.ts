import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { CACHE } from '@/lib/queryClient';
import { getFeedPage, getFollowingFeedPage } from '@/lib/db/social';

export const feedKeys = {
  forYou:    () => ['feed', 'for-you'] as const,
  following: (ids: string[]) => ['feed', 'following', ids.join(',')] as const,
};

/** For You feed — cursor-based infinite scroll, stale after 30s */
export function useForYouFeed() {
  return useInfiniteQuery({
    queryKey: feedKeys.forYou(),
    queryFn: ({ pageParam }) => getFeedPage(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    ...CACHE.HOT,
    // Flatten pages → flat posts array for consumption
  });
}

/** Following feed */
export function useFollowingFeed(followedPetIds: string[]) {
  return useInfiniteQuery({
    queryKey: feedKeys.following(followedPetIds),
    queryFn: ({ pageParam }) => getFollowingFeedPage(followedPetIds, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    ...CACHE.HOT,
    enabled: followedPetIds.length > 0,
  });
}

/** Flatten all pages into a single array — call this in the component */
export function flattenFeedPages(data: ReturnType<typeof useForYouFeed>['data']) {
  return data?.pages.flatMap(p => p.posts) ?? [];
}
