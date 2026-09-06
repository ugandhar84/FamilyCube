/**
 * useKioskWeather — polls lib/weather.ts's real Open-Meteo fetch for the
 * kiosk header's switcher strip. Refetches every 30 minutes (matching that
 * module's own cache TTL — polling faster would just re-read the same
 * cached value) plus once on mount.
 *
 * Returns null (not a fallback/placeholder value) whenever no real reading
 * is available yet or the fetch failed — the header must render nothing
 * rather than a fabricated temperature, same rule this app's kiosk work has
 * held to everywhere else weather was considered (KioskHeader.tsx and
 * KioskAmbientOverlay.tsx's own prior "no weather API, don't fabricate"
 * notes).
 */
import { useEffect, useState } from 'react';
import { getCurrentWeather, type Weather } from '@/lib/weather';

const POLL_MS = 30 * 60 * 1000;

export function useKioskWeather(): Weather | null {
  const [weather, setWeather] = useState<Weather | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const w = await getCurrentWeather();
      if (!cancelled && w) setWeather(w);
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  return weather;
}
