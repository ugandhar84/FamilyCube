/**
 * useFamilyMemories — the real `family_memories` data layer, extracted
 * verbatim out of features/vault/tabs/MemoriesTab.tsx so a second surface
 * (the kiosk's own 2-column feed, features/kiosk/components/
 * KioskMemoryFeed.tsx) can render a completely different CARD while
 * driving the exact same QUERY, REALTIME SUBSCRIPTION and ACTIONS.
 *
 * ── Why extract rather than reimplement ─────────────────────────────────
 * All of this logic lived as local functions inside one component, which
 * meant the only way for kiosk to get real hearting/deleting/posting was
 * either to embed the phone card unchanged (what it did — a single-column
 * phone card at kiosk width) or to fork the logic. Forking is the worse of
 * the two: every one of the functions below carries live-fixed bug
 * behavior with real consequences behind it —
 *
 *   · load/loadMore's KEYSET pagination via a (created_at, id) composite
 *     cursor, where a plain `.lt('created_at', …)` silently skips or
 *     duplicates rows sharing a timestamp;
 *   · postMemory's `if (error) throw` — an RLS-denied insert returns
 *     data:null WITHOUT throwing, so a naive `if (data)` closed the
 *     composer as though it had saved when nothing was written;
 *   · heartMemory's notify rule — only the like transition notifies (never
 *     an unlike), and only the memory's own poster, never a broadcast;
 *   · the focusMemoryId splice, which fetches a deep-linked memory that
 *     falls outside page 1 so a notification tap always has a card to
 *     scroll to;
 *   · the realtime channel's stale-topic sweep, which stops a hot reload
 *     from leaving a duplicate subscription behind.
 *
 * A second copy of that would drift from this one the first time either is
 * touched. So this file IS the logic, and both surfaces consume it.
 *
 * ── Contract, and why it's shaped this way ──────────────────────────────
 * This is a pure lift: every function below is byte-for-byte the behavior
 * MemoriesTab had, with only the two things that were genuinely
 * component-local changed —
 *   1. `setMemories` is internal; callers get `memories` plus the actions.
 *   2. The console tags stay '[MemoriesTab]' rather than being renamed, so
 *      existing log-grepping and any support notes still match.
 *
 * NOT extracted, deliberately: the composer's OPEN flag (the
 * openMemoryComposerRequested effect + useFocusEffect pair) stays in
 * MemoriesTab. useFocusEffect is expo-router navigation state, which is
 * meaningful on the phone's own screen and meaningless for a kiosk pane
 * that is never "blurred" by a router. Pulling it in would have made this
 * hook impose a navigation dependency on every consumer for one caller's
 * benefit. Same for the MediaViewer `viewer`/`handleSave` state, which is
 * presentation, not data.
 *
 * ── Relationship to useKioskPhotos ──────────────────────────────────────
 * features/kiosk/useKioskPhotos.ts runs a NARROWER read-only version of
 * the same query (fewer columns, no pagination, flattened to one row per
 * IMAGE rather than per memory) for the ambient photo frame and slideshow.
 * It is deliberately left alone: its job is a flat slide list for a
 * screensaver, not a paginated interactive feed, and folding the two would
 * make the slideshow carry pagination and mutation it has no use for. What
 * matters is that there are still only TWO readers of this table, both
 * documented, rather than a third appearing for the kiosk feed — the kiosk
 * feed uses THIS hook.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { todayLocal } from '@/lib/dates';
import { supabase, uploadFamilyMemoryPhoto, uploadFamilyMemoryVideo } from '@/lib/supabase';
import { useFamilyStore } from '@/store/familyStore';

export interface Memory {
  id: string; family_id: string; title: string; description: string | null;
  date: string; photo_url: string | null; photo_urls: string[] | null;
  caption_overlay: boolean;
  hearts: number; hearted_by: string[]; created_by: string | null;
  tagged_member_ids?: string[]; tag?: string | null;
  media_types?: string[] | null;
  created_at?: string | null;
}

export interface ComposedMedia { uri: string; type: 'photo' | 'video'; }

export interface FamilyMemoriesApi {
  memories: Memory[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  /** The viewer's own member id, as both surfaces resolve it. */
  myId: string;
  familyId: string;
  reload: () => void;
  loadMore: () => void;
  postMemory: (
    media: ComposedMedia[], caption: string, captionOverlay: boolean,
    taggedMemberIds: string[], tag: string | null,
  ) => Promise<void>;
  heartMemory: (mem: Memory) => Promise<void>;
  deleteMemory: (id: string) => void;
}

// Real keyset pagination, not a single ever-growing fixed-size fetch
// (was `.limit(200)` unconditionally on every screen visit — every memory
// ever posted loaded at once, no "load more" affordance at all;
// live-flagged: "see if we are only fetching few for the pagination like
// a [social app] feeds page"). created_at is the cursor (paired with id
// as a tiebreak for same-millisecond inserts) rather than `date`, which
// is day-granularity and ties for every post made the same day.
const PAGE_SIZE = 12;

export function useFamilyMemories({ focusMemoryId }: {
  /** A deep-linked memory that may fall outside page 1 — fetched and
   *  spliced in so the caller always has a card to scroll to. */
  focusMemoryId?: string | null;
} = {}): FamilyMemoriesApi {
  const { members, activeMemberId } = useFamilyStore();
  const familyId = (members[0] as any)?.familyId ?? 'family-1';
  const myId = activeMemberId ?? members[0]?.id ?? '';

  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading]   = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]   = useState(true);

  const cursorRef = useRef<{ created_at: string; id: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    cursorRef.current = null;
    const { data, error } = await supabase.from('family_memories')
      .select('*').eq('family_id', familyId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(PAGE_SIZE);
    if (error) console.error('[MemoriesTab] load failed:', error.message, error);
    if (data) {
      setMemories(data as Memory[]);
      setHasMore(data.length === PAGE_SIZE);
      const last = data[data.length - 1] as Memory | undefined;
      cursorRef.current = last ? { created_at: last.created_at!, id: last.id } : null;
    }
    setLoading(false);
  }, [familyId]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !cursorRef.current) return;
    setLoadingMore(true);
    // Keyset pagination via (created_at, id) composite cursor — a plain
    // .lt('created_at', cursor) alone would silently skip/duplicate rows
    // that share the cursor row's exact created_at timestamp; the OR
    // clause below also catches those via the id tiebreak.
    const { created_at, id } = cursorRef.current;
    const { data, error } = await supabase.from('family_memories')
      .select('*').eq('family_id', familyId)
      .or(`created_at.lt.${created_at},and(created_at.eq.${created_at},id.lt.${id})`)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(PAGE_SIZE);
    if (error) { console.error('[MemoriesTab] loadMore failed:', error.message, error); setLoadingMore(false); return; }
    if (data?.length) {
      setMemories(prev => {
        const seen = new Set(prev.map(m => m.id));
        return [...prev, ...(data as Memory[]).filter(m => !seen.has(m.id))];
      });
      const last = data[data.length - 1] as Memory;
      cursorRef.current = { created_at: last.created_at!, id: last.id };
    }
    setHasMore((data?.length ?? 0) === PAGE_SIZE);
    setLoadingMore(false);
  }, [familyId, hasMore, loadingMore]);

  useEffect(() => { load(); }, [load]);

  // A memory_posted/memory_liked push can deep-link to a memory older than
  // the first page — fetch it directly and splice it in so the auto-scroll
  // target (MemoriesScreen's focusMemoryId) always actually exists on
  // screen instead of silently doing nothing for anything not on page 1.
  useEffect(() => {
    if (!focusMemoryId || loading) return;
    if (memories.some(m => m.id === focusMemoryId)) return;
    supabase.from('family_memories').select('*').eq('id', focusMemoryId).maybeSingle()
      .then(({ data }) => {
        if (data) setMemories(prev => prev.some(m => m.id === data.id) ? prev : [...prev, data as Memory]);
      });
  }, [focusMemoryId, loading, memories]);

  // Realtime — new/edited/removed memories from other family members show
  // up live instead of only appearing after a manual reload. Same
  // channel/cleanup pattern as choreStore.ts's ensureRealtime (stale-topic
  // sweep guards against a hot-reload leaving a duplicate subscription).
  useEffect(() => {
    if (!familyId) return;
    const topic = `family_memories:${familyId}`;
    const stale = supabase.getChannels().filter(c => c.topic === `realtime:${topic}`);
    stale.forEach(c => supabase.removeChannel(c));
    const channel = supabase.channel(topic)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'family_memories', filter: `family_id=eq.${familyId}` },
        ({ eventType, new: newRow, old: oldRow }) => {
          if (eventType === 'INSERT') {
            const row = newRow as Memory;
            setMemories(prev => prev.some(m => m.id === row.id) ? prev : [row, ...prev]);
          } else if (eventType === 'UPDATE') {
            const row = newRow as Memory;
            setMemories(prev => prev.map(m => m.id === row.id ? row : m));
          } else if (eventType === 'DELETE') {
            const row = oldRow as { id: string };
            setMemories(prev => prev.filter(m => m.id !== row.id));
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [familyId]);

  const postMemory = useCallback(async (
    media: { uri: string; type: 'photo' | 'video' }[], caption: string,
    captionOverlay: boolean, taggedMemberIds: string[], tag: string | null,
  ) => {
    // Mixed photo/video upload — each slot routes to its own upload
    // function (uploadFamilyMemoryVideo compresses via react-native-
    // compressor; uploadFamilyMemoryPhoto compresses via compressImage) but
    // both land in the same signed-URL shape, so photo_urls/media_types
    // stay simple parallel arrays regardless of what's in each slot.
    const urls = await Promise.all(media.map((m, i) =>
      m.type === 'video'
        ? uploadFamilyMemoryVideo(familyId, m.uri, media.length > 1 ? i : undefined)
        : uploadFamilyMemoryPhoto(familyId, m.uri, media.length > 1 ? i : undefined)
    ));
    const mediaTypes = media.map(m => m.type);
    // No title field in the photo-first compose flow — `title` is NOT NULL
    // at the DB level, so fall back to something reasonable when there's no
    // caption to reuse. `description` is the actual caption text.
    const { data, error } = await supabase.from('family_memories').insert({
      family_id: familyId, created_by: myId,
      title: caption || 'Family memory', description: caption || null,
      date: todayLocal(),
      photo_url: urls[0], photo_urls: urls.length > 1 ? urls : null,
      media_types: mediaTypes,
      caption_overlay: captionOverlay,
      tagged_member_ids: taggedMemberIds, tag,
      hearts: 0, hearted_by: [],
    }).select().single();
    // Previously this discarded `error` and just checked `if (data)` — an
    // RLS-denied insert returns data:null with no thrown exception, so the
    // compose sheet closed as if it had succeeded while nothing was ever
    // saved. Throw so the caller's catch block surfaces the real cause.
    if (error) {
      console.error('[MemoriesTab] postMemory insert failed:', error.message, error);
      throw new Error(error.message);
    }
    if (data) setMemories(prev => [data as Memory, ...prev]);

    const posterName = members.find(m => m.id === myId)?.name ?? 'Someone';
    const recipientIds = members.filter(m => m.id !== myId).map(m => m.id);
    if (recipientIds.length) {
      supabase.functions.invoke('family-notifier', {
        body: {
          type: 'memory_posted', familyId, memberIds: recipientIds,
          payload: { posterName, caption: caption || undefined, memoryId: data?.id },
          persist: true, excludeMemberId: myId,
        },
      }).catch(e => console.warn('[MemoriesTab] postMemory notify failed:', e?.message));
    }
  }, [familyId, myId, members]);

  const heartMemory = useCallback(async (mem: Memory) => {
    const alreadyHearted = mem.hearted_by?.includes(myId);
    const newHearts = alreadyHearted ? mem.hearts - 1 : mem.hearts + 1;
    const newHearted = alreadyHearted
      ? mem.hearted_by.filter(id => id !== myId)
      : [...(mem.hearted_by ?? []), myId];
    const { error } = await supabase.from('family_memories')
      .update({ hearts: newHearts, hearted_by: newHearted }).eq('id', mem.id);
    if (!error) {
      setMemories(prev => prev.map(m =>
        m.id === mem.id ? { ...m, hearts: newHearts, hearted_by: newHearted } : m
      ));

      // Only the like transition notifies (not unliking), and only the
      // memory's own poster — not a broadcast to everyone else, unlike
      // postMemory above.
      if (!alreadyHearted && mem.created_by && mem.created_by !== myId) {
        const likerName = members.find(m => m.id === myId)?.name ?? 'Someone';
        supabase.functions.invoke('family-notifier', {
          body: {
            type: 'memory_liked', familyId, memberIds: [mem.created_by],
            payload: { likerName, caption: mem.description || undefined, memoryId: mem.id },
            persist: true, excludeMemberId: myId,
          },
        }).catch(e => console.warn('[MemoriesTab] heartMemory notify failed:', e?.message));
      }
    }
  }, [familyId, myId, members]);

  const deleteMemory = useCallback((id: string) => {
    Alert.alert('Remove memory', 'Delete this post? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await supabase.from('family_memories').delete().eq('id', id);
        setMemories(prev => prev.filter(m => m.id !== id));
      }},
    ]);
  }, []);

  return {
    memories, loading, loadingMore, hasMore, myId, familyId,
    reload: load, loadMore, postMemory, heartMemory, deleteMemory,
  };
}

/**
 * Who may delete a memory. Was unconditional on the phone card — any
 * family member (kid/teen/senior included) could delete anyone else's
 * posted memory (live-flagged: "if one pasted the memories should other
 * can have delete option?"). Only the poster or a parent can, the same
 * rule now enforced server-side too (the family_memories_delete RLS
 * policy). Shared so the kiosk card cannot drift from it.
 */
export function canDeleteMemory(
  mem: Pick<Memory, 'created_by'>,
  myId: string,
  members: { id: string; role?: string }[],
): boolean {
  const myRole = members.find(m => m.id === myId)?.role;
  return mem.created_by === myId || myRole === 'parent';
}
