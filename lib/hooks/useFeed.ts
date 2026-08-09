import { useInfiniteQuery } from '@tanstack/react-query';
import { CACHE } from '@/lib/queryClient';
import { fetchFeedPage } from '@/lib/db/social';

export const FEED_QUERY_KEY = ['feed', 'for_you'] as const;

/**
 * Infinite-scroll feed with automatic caching and deduplication.
 * - First render: fetches page 0 once, caches for 30s (HOT).
 * - Tab switch back: serves from cache — zero round-trips within staleTime.
 * - Pull to refresh: calls refetch(), bypasses staleTime.
 * - Load more: fetchNextPage() appends page N without re-fetching earlier pages.
 */
export function useForYouFeed() {
  return useInfiniteQuery({
    queryKey: FEED_QUERY_KEY,
    queryFn: ({ pageParam }) => fetchFeedPage(pageParam as number),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
    initialPageParam: 0,
    staleTime: CACHE.HOT.staleTime,
    gcTime:    CACHE.HOT.gcTime,
    refetchOnWindowFocus: false,
  });
}
