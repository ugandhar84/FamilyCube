import { useEffect } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { CACHE } from '@/lib/queryClient';
import { getAppSetting } from '@/lib/db/appSettings';
import { supabase } from '@/lib/supabase';

// One realtime channel for the whole app session — not one per hook instance.
// Multiple components calling useFeatureFlag for the same (or different) keys
// is normal (nav tiles, gates, settings rows all watch flags independently);
// giving each its own `app_settings:<key>` channel meant two mounted
// components watching the same key both tried to `.on()` the same topic,
// and Supabase throws once the first has already called `.subscribe()`.
let subscribed = false;
let _channel: ReturnType<typeof supabase.channel> | null = null;

export function resetAppSettingsSubscription() {
  if (_channel) { supabase.removeChannel(_channel); _channel = null; }
  subscribed = false;
}

function ensureAppSettingsChannel(queryClient: QueryClient) {
  if (subscribed) return;
  subscribed = true;
  _channel = supabase
    .channel('app_settings:changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, (payload) => {
      const key = (payload.new as any)?.key ?? (payload.old as any)?.key;
      if (key) queryClient.invalidateQueries({ queryKey: ['app_settings', key] });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'feature_flags' }, (payload) => {
      const key = (payload.new as any)?.key ?? (payload.old as any)?.key;
      if (key) queryClient.invalidateQueries({ queryKey: ['feature_flags', key] });
    })
    .subscribe();
}

/**
 * Admin-toggleable feature flag. A single app-wide realtime channel
 * invalidates the relevant query the moment its row changes, so an admin's
 * toggle reflects on already-open clients within a second or two — no
 * reload, no waiting out the query cache.
 *
 * `defaultEnabled` controls behavior while loading and when the flag row
 * doesn't exist yet in app_settings:
 * - `false` (default) — opt-in. Right for new/experimental features (video
 *   posts, fullscreen media) that should stay hidden until an admin turns
 *   them on.
 * - `true` — opt-out. Right for established, already-live features (SOS,
 *   mood scan, health records, events) — shipping this gate must not
 *   silently disable them for everyone; only an explicit `false` row should.
 */
export function useFeatureFlag(key: string, defaultEnabled = false): boolean {
  const queryClient = useQueryClient();

  useEffect(() => {
    ensureAppSettingsChannel(queryClient);
  }, [queryClient]);

  const { data, isLoading } = useQuery({
    queryKey: ['app_settings', key],
    queryFn: () => getAppSetting<boolean>(key),
    staleTime: 0, // Always fetch fresh (was CACHE.COLD which might be stale)
    gcTime: 1000 * 60 * 5, // Keep in cache for 5min
    refetchOnWindowFocus: true, // Refetch when user returns to app
  });

  if (isLoading || data == null) return defaultEnabled;
  return data === true;
}
