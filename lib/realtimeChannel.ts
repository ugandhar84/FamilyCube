import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Returns a fresh channel for `topic`, or `null` if one is already active.
 *
 * Supabase throws "cannot add postgres_changes callbacks ... after
 * subscribe()" if `.on()` is called on a channel topic that's already
 * subscribed. That happens whenever the same screen (or two screens keyed
 * by the same value, e.g. activePetId) ends up mounted more than once at
 * once — a tab that stays mounted in the background plus a fresh
 * navigation to the same route, a fast-refresh remount overlapping the
 * previous instance's cleanup, etc. Exactly reproducing which of those
 * happened isn't reliable, so instead: only the first mounted instance
 * claims the channel.
 *
 * Callers must skip both `.on()`/`.subscribe()` setup AND
 * `supabase.removeChannel()` cleanup when this returns `null` — a `null`
 * result means another still-mounted instance owns that channel's
 * lifecycle, and removing it out from under that instance would silently
 * kill its realtime updates.
 */
export function claimChannel(topic: string): RealtimeChannel | null {
  const alreadyActive = supabase.getChannels().some(c => c.topic.endsWith(topic));
  if (alreadyActive) return null;
  return supabase.channel(topic);
}
