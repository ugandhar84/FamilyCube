/**
 * locationHeartbeat — while the app is open and this person has location sharing on (and has consented), write a fresh position about
 * once a minute. Phones that sit still at home are otherwise silent (the background task only fires when moving), so the family saw
 * "Not sharing" / stale positions for people who were simply at home with the app open. Nothing runs in the background and nothing
 * runs without consent and the person's own sharing switch. It restarts whenever the active profile changes, so on a shared phone the
 * person who just switched in gets a fresh position right away.
 */
import * as Location from 'expo-location';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';
import { hasLocationConsent } from '@/lib/locationConsent';
import { isChildMember, memberById, hasChildConsent } from '@/lib/childPrivacy';

const BEAT_MS = 60_000;

export function startLocationHeartbeat(memberId: string, familyId: string | null): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const beat = async () => {
    if (stopped || AppState.currentState !== 'active') return;
    try {
      // A child's location needs a parent's grant; everyone else needs their own consent on this device.
      const consented = isChildMember(memberById(memberId)) ? await hasChildConsent(memberId, 'location') : await hasLocationConsent(memberId);
      if (!consented) return;
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted') return;
      const { data } = await supabase.from('member_locations').select('share_location_enabled').eq('member_id', memberId).maybeSingle();
      if (!data?.share_location_enabled) return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (stopped) return;
      if (pos.coords.accuracy != null && pos.coords.accuracy > 150) return;
      await supabase.from('member_locations').update({
        lat: pos.coords.latitude, lng: pos.coords.longitude, last_updated: new Date().toISOString(),
      }).eq('member_id', memberId);
    } catch { /* best effort */ }
  };
  const start = () => { if (!timer) { beat(); timer = setInterval(beat, BEAT_MS); } };
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
  if (AppState.currentState === 'active') start();
  const sub = AppState.addEventListener('change', st => { if (st === 'active') start(); else stop(); });
  return () => { stopped = true; stop(); sub.remove(); };
}
