/**
 * useLiveTripEta — subscribes to a driver's live position (member_locations,
 * same table lib/locationTracking.ts's background task writes to) and
 * returns a continuously-updating ETA to a fixed destination, instead of
 * the static number typed in at dispatch time.
 *
 * Returns null when the driver's location isn't known/shared — callers
 * fall back to the trip's own static etaMinutes in that case, same as
 * before this hook existed.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { computeLiveEta, type LiveEtaResult } from '@/lib/tripEta';

export function useLiveTripEta(
  driverMemberId: string | undefined,
  destLat: number | undefined, destLng: number | undefined,
): LiveEtaResult | null {
  const [result, setResult] = useState<LiveEtaResult | null>(null);

  useEffect(() => {
    if (!driverMemberId || destLat == null || destLng == null) { setResult(null); return; }

    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from('member_locations')
        .select('lat, lng, speed_mph, share_location_enabled')
        .eq('member_id', driverMemberId)
        .maybeSingle();
      if (cancelled) return;
      if (!data || data.share_location_enabled === false) { setResult(null); return; }
      setResult(computeLiveEta({ lat: data.lat, lng: data.lng, speedMph: data.speed_mph }, destLat, destLng));
    };
    load();

    // Same realtime-subscribe-to-member_locations pattern GpsTab.tsx
    // already uses for its own map view — a fixed random suffix on the
    // channel name avoids a collision if this effect double-fires (React
    // Strict Mode dev-only double-invoke), same fix GpsTab documents.
    const channelName = `trip_eta_live_${Math.random().toString(36).slice(2)}`;
    const ch = supabase.channel(channelName)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'member_locations',
        filter: `member_id=eq.${driverMemberId}`,
      }, load)
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [driverMemberId, destLat, destLng]);

  return result;
}
