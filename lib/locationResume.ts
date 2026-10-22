/**
 * Restarts background location sharing at app launch for anyone who had it on.
 * Was only done by GpsTab.tsx's mount effect, so after a TestFlight update, reinstall or
 * OS stop nobody's phone sent a location until they opened Find Family.
 * Never prompts: it only resumes when location permission was already granted.
 */
import * as Location from 'expo-location';
import { supabase } from './supabase';
import { canShareLocation } from './childPrivacy';
import { startMotionTracking } from './motionTracking';
import {
  startBackgroundLocationTracking, isBackgroundLocationTracking, isBackgroundLocationSupported,
  setBackgroundLocationMemberId, setBackgroundLocationFamilyId, startBatteryPolling,
} from './locationTracking';

export async function resumeLocationSharingIfEnabled(memberId: string, familyId: string | null): Promise<void> {
  try {
    if (!isBackgroundLocationSupported()) return;
    const [fg, bg] = await Promise.all([Location.getForegroundPermissionsAsync(), Location.getBackgroundPermissionsAsync()]);
    if (fg.status !== 'granted' || bg.status !== 'granted') return;

    if (await isBackgroundLocationTracking().catch(() => false)) {
      setBackgroundLocationMemberId(memberId);
      setBackgroundLocationFamilyId(familyId);
      startBatteryPolling(memberId);
      startMotionTracking(memberId).catch(() => {});
      return;
    }
    const { data } = await supabase.from('member_locations').select('share_location_enabled').eq('member_id', memberId).maybeSingle();
    if (!data?.share_location_enabled || !(await canShareLocation(memberId))) return;
    if (await startBackgroundLocationTracking(memberId, familyId).catch(() => false)) {
      startBatteryPolling(memberId);
      startMotionTracking(memberId).catch(() => {});
    }
  } catch (e) {
    console.warn('[locationResume] failed:', (e as Error)?.message ?? e);
  }
}
