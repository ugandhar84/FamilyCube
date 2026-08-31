/**
 * useDriverLocation — live-decrypted address for one member's current
 * member_locations row, with realtime updates.
 *
 * Was duplicated byte-for-byte in EnRouteBanner.tsx and hubComponents.tsx's
 * pickup-radar viewer card — same query, same decrypt call, same realtime
 * subscription pattern, each independently opening its own postgres_changes
 * channel for the SAME member_id whenever both a driver and any viewer of
 * their trip (other parent, kid, GP) had their Hub open at once. One shared
 * hook here means one subscription per (driverMemberId, mounted component)
 * still, but now sharing the exact same code path — a future timing/decrypt
 * fix only needs to happen once, not kept in sync across two files.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { decryptLocationText } from '@/lib/locationCrypto';

export function useDriverLocation(driverMemberId: string | null | undefined, enabled: boolean): string | null {
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !driverMemberId) { setAddress(null); return; }
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.from('member_locations')
        .select('address, lat, lng, share_location_enabled').eq('member_id', driverMemberId).maybeSingle();
      if (cancelled) return;
      // share_location_enabled === false is an explicit opt-out — same gate
      // GpsTab.tsx applies to its own pin/roster. Without it, a driver who
      // turned location sharing off mid-trip kept leaking their last-known
      // address into the En Route banner every viewer's Hub shows.
      if (!data || data.lat == null || data.lng == null || data.share_location_enabled === false) { setAddress(null); return; }
      setAddress(data.address ? await decryptLocationText(driverMemberId, data.address) : null);
    };
    load();
    // Randomized suffix — this hook can mount once per VIEWER of the same
    // trip (every parent/kid/teen/GP watching it on their own Hub), so a
    // fixed channel name keyed only on driverMemberId would collide the
    // instant two instances (real or React Strict Mode's dev-only
    // double-invoke) target the same member_id.
    const channelName = `driver_location_${driverMemberId}_${Math.random().toString(36).slice(2)}`;
    const ch = supabase.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_locations', filter: `member_id=eq.${driverMemberId}` }, load)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [enabled, driverMemberId]);

  return address;
}
