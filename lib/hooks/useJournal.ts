import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CACHE } from '@/lib/queryClient';
import { getJournalData, savePetNote, deleteJournalEntry } from '@/lib/db/journal';
import { invalidateJournalCache } from '@/features/care/components/journalTypes';

export const journalKeys = {
  all: (petId: string) => ['journal', petId] as const,
};

const PAGE_LIMIT = 60;

/**
 * Journal — infinite scroll with cursor pagination.
 * Each page calls the single RPC with a timestamp cursor.
 * TanStack Query deduplicates, caches 30s, and handles background refetch.
 */
export function useJournal(petId: string | null) {
  return useInfiniteQuery({
    queryKey: journalKeys.all(petId ?? ''),
    queryFn: ({ pageParam }) => getJournalData(petId!, PAGE_LIMIT, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    // next cursor = oldest timestamp across all sub-arrays in this page
    getNextPageParam: (page) => {
      const allTimestamps: string[] = [];
      for (const key of Object.keys(page)) {
        if (key === 'profiles') continue;
        for (const item of (page[key] ?? [])) {
          const ts = item.noted_at ?? item.created_at ?? item.fed_at ??
                     item.done_at_time ?? item.logged_at ?? item.achieved_at ??
                     item.scheduled_at ?? item.visit_date ?? item.last_given;
          if (ts) allTimestamps.push(ts as string);
        }
      }
      if (!allTimestamps.length) return undefined;
      const oldest = allTimestamps.sort().at(0)!;
      // If we got a full page, there might be more
      const totalItems = Object.keys(page)
        .filter(k => k !== 'profiles')
        .reduce((s, k) => s + (page[k]?.length ?? 0), 0);
      return totalItems >= PAGE_LIMIT ? oldest : undefined;
    },
    enabled: !!petId,
    ...CACHE.WARM,
    
  });
}

export function useSavePetNote(petId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ authorId, content, isPrivate }: { authorId: string; content: string; isPrivate?: boolean }) =>
      savePetNote(petId, authorId, content, isPrivate),
    onSuccess: () => {
      invalidateJournalCache(petId);
      qc.invalidateQueries({ queryKey: journalKeys.all(petId) });
    },
  });
}

export function useDeleteJournalEntry(petId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ table, id }: { table: string; id: string }) => deleteJournalEntry(table, id),
    onSuccess: () => {
      invalidateJournalCache(petId);
      qc.invalidateQueries({ queryKey: journalKeys.all(petId) });
    },
  });
}
