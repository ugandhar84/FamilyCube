import { useState, useEffect, useRef } from 'react';

// Module-level cache so images survive re-renders and don't re-fetch across rows
const imageCache: Record<string, string | null> = {};
const inflight: Record<string, Promise<string | null>> = {};

const KEY = process.env.EXPO_PUBLIC_UNSPLASH_ACCESS_KEY ?? '';

async function fetchUnsplashImage(query: string): Promise<string | null> {
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
    if (cacheKey in imageCache) {
      setUrl(imageCache[cacheKey]);
      return;
    }
    if (!inflight[cacheKey]) {
      inflight[cacheKey] = fetchUnsplashImage(mealName).then(result => {
        imageCache[cacheKey] = result;
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
