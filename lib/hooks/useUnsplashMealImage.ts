import { useState, useEffect, useRef } from 'react';

// Module-level cache so images survive re-renders and don't re-fetch across rows
const imageCache: Record<string, string | null> = {};
// A failed lookup (no key, rate limit, offline) is only remembered for a while, so it is retried later in the session
// instead of leaving the emoji placeholder until the app restarts.
const failedAt: Record<string, number> = {};
const RETRY_AFTER_MS = 10 * 60_000;
const inflight: Record<string, Promise<string | null>> = {};

const KEY = process.env.EXPO_PUBLIC_UNSPLASH_ACCESS_KEY ?? '';

async function fetchUnsplashImage(query: string): Promise<string | null> {
  // Preferred: the meal-image edge function (the Unsplash key stays on the server).
  try {
    const { supabase } = await import('@/lib/supabase');
    const { data } = await supabase.functions.invoke('meal-image', { body: { query } });
    if (data?.url) return data.url as string;
  } catch { /* fall through to the client key, if one is configured */ }
  if (!KEY) return null;
  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query + ' food')}&per_page=1&orientation=landscape&content_filter=high`;
    const res = await fetch(url, { headers: { Authorization: `Client-ID ${KEY}` } });
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.results?.[0]?.urls?.small as string) ?? null;
  } catch {
    return null;
  }
}

export function useUnsplashMealImage(mealName: string): string | null {
  const cacheKey = mealName.toLowerCase().trim();
  const [url, setUrl] = useState<string | null>(imageCache[cacheKey] ?? null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (cacheKey in imageCache && (imageCache[cacheKey] || Date.now() - (failedAt[cacheKey] ?? 0) < RETRY_AFTER_MS)) {
      setUrl(imageCache[cacheKey]);
      return;
    }
    if (!inflight[cacheKey]) {
      inflight[cacheKey] = fetchUnsplashImage(mealName).then(result => {
        imageCache[cacheKey] = result;
        if (!result) failedAt[cacheKey] = Date.now();
        delete inflight[cacheKey];
        return result;
      });
    }
    inflight[cacheKey].then(result => {
      if (mounted.current) setUrl(result);
    });
    return () => { mounted.current = false; };
  }, [cacheKey]);

  return url;
}
