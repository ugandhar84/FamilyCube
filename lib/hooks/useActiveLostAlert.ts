import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';

// Shared invalidation registry — keyed by petId so SosScreen can poke specific instances
const _listeners = new Map<string, Set<() => void>>();

export function invalidateLostAlert(petId: string) {
  _listeners.get(petId)?.forEach(fn => fn());
}

/**
 * Returns the active lost alert for the given pet, or null.
 * Updates via: realtime subscription + AppState focus + manual invalidation.
 */
export function useActiveLostAlert(petId: string | null) {
  const [alert, setAlert] = useState<any | null>(undefined);
  const cancelRef = useRef(false);

  const doFetch = (id: string) => {
    cancelRef.current = false;
    supabase
      .from('lost_alerts')
      .select('id, pet_id, created_at, expires_at')
      .eq('pet_id', id)
      .eq('is_found', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelRef.current) setAlert(data ?? null);
      });
  };

  // Initial fetch + re-fetch when petId changes
  useEffect(() => {
    if (!petId) { setAlert(null); return; }
    doFetch(petId);
    return () => { cancelRef.current = true; };
  }, [petId]);

  // Re-fetch when app comes to foreground
  useEffect(() => {
    if (!petId) return;
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active') doFetch(petId);
    });
    return () => sub.remove();
  }, [petId]);

  // Manual invalidation (called from SosScreen after insert/found)
  useEffect(() => {
    if (!petId) return;
    if (!_listeners.has(petId)) _listeners.set(petId, new Set());
    const notify = () => doFetch(petId);
    _listeners.get(petId)!.add(notify);
    return () => { _listeners.get(petId)?.delete(notify); };
  }, [petId]);

  // Realtime subscription
  useEffect(() => {
    if (!petId) return;
    const channel = supabase
      .channel(`lost_alert_${petId}_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'lost_alerts', filter: `pet_id=eq.${petId}` },
        () => doFetch(petId),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [petId]);

  return alert;
}
