import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { CACHE } from '@/lib/queryClient';
import { getMessagesPage, type ChatMessage } from '@/lib/db/chat';

export const chatKeys = {
  messages: (chatId: string) => ['chat', chatId, 'messages'] as const,
};

/**
 * Chat messages — infinite scroll upward (oldest at top, load more above).
 * pageParam = created_at of the oldest message currently loaded.
 */
export function useChatMessages(chatId: string | null) {
  return useInfiniteQuery({
    queryKey: chatKeys.messages(chatId ?? ''),
    queryFn: ({ pageParam }) => getMessagesPage(chatId!, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    // Cursor for next page = created_at of the FIRST (oldest) message in the page
    getNextPageParam: (first) => first.hasMore ? first.messages[0]?.created_at : undefined,
    enabled: !!chatId,
    ...CACHE.REALTIME,
    select: (data) => ({
      ...data,
      // Flatten all pages into chronological order for display
      allMessages: data.pages.flatMap(p => p.messages),
    }),
  });
}

/** Call this to optimistically append a new message (from realtime or after send) */
export function appendMessageToCache(
  qc: ReturnType<typeof useQueryClient>,
  chatId: string,
  msg: ChatMessage,
) {
  qc.setQueryData<any>(chatKeys.messages(chatId), (old: any) => {
    if (!old) return old;
    // Add to the last page's messages (most recent page)
    const pages = old.pages as { messages: ChatMessage[]; hasMore: boolean }[];
    const lastPage = pages[pages.length - 1];
    if (lastPage.messages.some(m => m.id === msg.id)) return old; // dedup
    return {
      ...old,
      pages: [
        ...pages.slice(0, -1),
        { ...lastPage, messages: [...lastPage.messages, msg] },
      ],
    };
  });
}

/** Patch an existing message in cache (for proposal accept/reject updates) */
export function patchMessageInCache(
  qc: ReturnType<typeof useQueryClient>,
  chatId: string,
  updated: ChatMessage,
) {
  qc.setQueryData<any>(chatKeys.messages(chatId), (old: any) => {
    if (!old) return old;
    return {
      ...old,
      pages: old.pages.map((page: any) => ({
        ...page,
        messages: page.messages.map((m: ChatMessage) =>
          m.id === updated.id ? { ...m, ...updated } : m
        ),
      })),
    };
  });
}
