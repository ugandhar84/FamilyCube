import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Global invalidation — any code can call this to force an immediate re-fetch.
const _listeners = new Set<() => void>();
export function invalidateLostAlerts() {
  _listeners.forEach(fn => fn());
}

/** Returns the set of pet IDs that currently have an active lost alert.
 *  Stays live via Supabase realtime — badge appears/clears without any pull-to-refresh. */
export function useActiveLostAlerts(petIds: string[]): Set<string> {
  const [lostSet, setLostSet] = useState<Set<string>>(new Set());
  const [tick, setTick]       = useState(0);
  const key = petIds.slice().sort().join(',');

  // Global invalidation signal (from SosScreen after insert/found)
  useEffect(() => {
    const notify = () => setTick(t => t + 1);
    _listeners.add(notify);
    return () => { _listeners.delete(notify); };
  }, []);

  // Fetch whenever petIds or tick changes
  useEffect(() => {
    if (!petIds.length) { setLostSet(new Set()); return; }
    let cancelled = false;
    supabase
      .from('lost_alerts')
      .select('pet_id')
      .in('pet_id', petIds)
      .eq('is_found', false)
      .then(({ data }) => {
        if (!cancelled) setLostSet(new Set((data ?? []).map((r: any) => r.pet_id)));
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);

  // Realtime subscription — re-fetch on any INSERT or UPDATE to lost_alerts
  useEffect(() => {
    if (!petIds.length) return;
    const channelName = `lost_alerts_live_${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lost_alerts' },
        () => setTick(t => t + 1),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return lostSet;
}
