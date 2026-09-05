/**
 * useKioskPhotos — the household's most recent real family photos, for the
 * two ambient photo surfaces on the kiosk (the Overview "Kept" frame widget
 * and the Memories tab's slideshow).
 *
 * Same shape and reasoning as useKioskMeals, deliberately: no new store,
 * because the real feature (features/vault/tabs/MemoriesTab.tsx over the
 * `family_memories` table) holds its rows in plain component state with a
 * single keyset-paginated query. Introducing a store now would mean two
 * competing sources of truth for one table. This hook runs the SAME
 * `family_memories` query MemoriesTab.load() runs, just narrowed to the
 * columns a photo frame needs and to rows that actually have an image.
 *
 * ── Why photo_urls is flattened here ────────────────────────────────────
 * A memory row can carry up to two media items (photo_url plus a
 * photo_urls array), and media_types marks which of them are videos. A
 * slideshow that silently showed a video's storage URL as an <Image> would
 * render a broken frame, so videos are filtered out and each remaining URL
 * becomes its own slide — a two-photo memory contributes two slides,
 * carrying the same title/date on both, which is what a photo frame wants.
 *
 * Realtime: subscribes to family_memories, so a photo posted from a phone
 * appears on the kitchen display without anyone touching it — the same
 * always-on behavior useKioskMeals gives the meal plan.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useFamilyStore } from '@/store/familyStore';

/** How many memory ROWS to pull. Each can yield up to two slides. */
const ROW_LIMIT = 24;

/** One slide: a single real image plus the memory it came from. */
export interface KioskPhoto {
  /** `${memoryId}:${index}` — stable across reloads, unique per slide. */
  key: string;
  memoryId: string;
  url: string;
  title: string;
  /** The memory's own `date` column (not created_at). */
  date: string | null;
}

interface MemoryRow {
  id: string;
  title: string | null;
  date: string | null;
  photo_url: string | null;
  photo_urls: string[] | null;
  media_types: string[] | null;
  created_at: string | null;
}

export function useKioskPhotos(): {
  photos: KioskPhoto[];
  loading: boolean;
  reload: () => void;
} {
  const members = useFamilyStore(s => s.members);
  const familyId = (members[0] as any)?.familyId as string | undefined;

  const [rows, setRows] = useState<MemoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!familyId) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('family_memories')
      .select('id,title,date,photo_url,photo_urls,media_types,created_at')
      .eq('family_id', familyId)
      // Same ordering MemoriesTab.load() uses, including the id tiebreak,
      // so the frame and the feed agree on what "most recent" means.
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(ROW_LIMIT);
    if (error) console.warn('[useKioskPhotos] load error', error.message);
    if (data) setRows(data as MemoryRow[]);
    setLoading(false);
  }, [familyId]);

  useEffect(() => {
    load();
    if (!familyId) return;
    // Debounced for the same reason useKioskMeals debounces: posting a
    // two-photo memory writes more than once, and each write would
    // otherwise trigger a full re-fetch.
    let t: ReturnType<typeof setTimeout> | null = null;
    const ch = supabase
      .channel(`kiosk_photos_${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'family_memories', filter: `family_id=eq.${familyId}` },
        () => { if (t) clearTimeout(t); t = setTimeout(load, 400); },
      )
      .subscribe();
    return () => { if (t) clearTimeout(t); supabase.removeChannel(ch); };
  }, [load, familyId]);

  const photos = useMemo(() => {
    const out: KioskPhoto[] = [];
    for (const r of rows) {
      // photo_urls is the multi-item column; when it's absent the single
      // photo_url is the only item. Mirrors MemoriesTab's own
      // `hasMulti ? mem.photo_urls! : [mem.photo_url!]`.
      const urls = r.photo_urls?.length ? r.photo_urls : r.photo_url ? [r.photo_url] : [];
      urls.forEach((url, i) => {
        if (!url) return;
        // MemoriesTab's own typeAtIdx: anything not explicitly 'video' is a
        // photo. A video URL in an <Image> renders as a broken frame.
        if (r.media_types?.[i] === 'video') return;
        out.push({
          key: `${r.id}:${i}`,
          memoryId: r.id,
          url,
          title: r.title?.trim() || 'Untitled memory',
          date: r.date,
        });
      });
    }
    return out;
  }, [rows]);

  return { photos, loading, reload: load };
}
