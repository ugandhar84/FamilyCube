/**
 * KioskFindFamTab — family location roster for kiosk mode. Deliberately a
 * list, not an embedded interactive map (react-native-maps' pan/zoom/drag-
 * sheet gestures — see GpsTab.tsx's PanResponder-driven bottom sheet,
 * features/vault/tabs/GpsTab.tsx:558-596 — are built for a handheld touch
 * surface a person holds and repositions, not a fixed wall-mounted display
 * glanced at in passing). That's a presentation choice, not a feature cut:
 * every actual capability GpsTab.tsx offers a viewer is reused here —
 * same `member_locations` table + decryptLocationText path (GpsTab.tsx:17,
 * 128-129), same Share My Location toggle backed by the identical
 * lib/locationTracking.ts functions GpsTab.tsx itself calls (GpsTab.tsx:20,
 * 207-260), and the same tap-to-navigate-in-native-Maps action
 * (GpsTab.tsx:441-456, openDirections). No AI ETA/arrival-prediction and no
 * geofence-trigger UI exist anywhere in GpsTab.tsx to parity-match — the
 * only geofence-adjacent field is safe_zone_name, a plain display string
 * (GpsTab.tsx:48), and low-battery alerts are a push-notification pipeline
 * (lib/locationTracking.ts's maybeAlertLowBattery, fired from the
 * background task itself), not a UI element — kiosk's existing low-battery
 * badge already mirrors GpsTab's own <=20% styling threshold.
 */
import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet, TouchableOpacity, Switch, Alert, Platform, Linking } from 'react-native';
import { MapPin, BatteryLow, Navigation } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { decryptLocationText } from '@/lib/locationCrypto';
import {
  startBackgroundLocationTracking, stopBackgroundLocationTracking,
  isBackgroundLocationTracking, isBackgroundLocationSupported,
  setBackgroundLocationMemberId, setBackgroundLocationFamilyId,
  startBatteryPolling, stopBatteryPolling,
} from '@/lib/locationTracking';
import type { FamilyMember } from '@/store/familyStore';
import CubeSpinner from '@/components/CubeSpinner';

interface MemberLocation {
  member_id: string;
  address: string | null;
  neighborhood: string | null;
  lat: number | null;
  lng: number | null;
  status: 'at_home' | 'at_school' | 'at_work' | 'in_transit' | 'at_activity';
  status_text: string | null;
  battery_level: number | null;
  last_updated: string;
  share_location_enabled?: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  at_home: 'At home',
  at_school: 'At school',
  at_work: 'At work',
  in_transit: 'On the move',
  at_activity: 'At an activity',
};

// Same native-Maps deep link GpsTab.tsx's openDirections uses
// (GpsTab.tsx:441-456), with the identical web fallback.
async function openDirections(lat: number, lng: number, label: string) {
  const encodedLabel = encodeURIComponent(label);
  const nativeUrl = Platform.select({
    ios: `maps://?daddr=${lat},${lng}&q=${encodedLabel}`,
    android: `google.navigation:q=${lat},${lng}`,
    default: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
  })!;
  const webFallback = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  try {
    const canOpen = await Linking.canOpenURL(nativeUrl);
    await Linking.openURL(canOpen ? nativeUrl : webFallback);
  } catch {
    try { await Linking.openURL(webFallback); }
    catch { Alert.alert('Could not open maps', 'Please try again.'); }
  }
}

export function KioskFindFamTab({ active, members, colors, isDark }: {
  active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean;
}) {
  const [locations, setLocations] = useState<MemberLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [tracking, setTracking] = useState(false);
  const [togglingTrack, setTogglingTrack] = useState(false);

  const familyId = active.familyId;

  const load = useCallback(async () => {
    const { data } = await supabase.from('member_locations').select('*');
    setLoading(false);
    if (data) {
      // Decrypt address/neighborhood (per-device envelope, same as every
      // other member_locations reader) — this was rendering raw ciphertext
      // directly on the kiosk screen, the one surface here that skipped
      // decryptLocationText entirely.
      const decrypted = await Promise.all((data as any[]).map(async (r) => ({
        ...r,
        address: r.address ? await decryptLocationText(r.member_id, r.address) : r.address,
        neighborhood: r.neighborhood ? await decryptLocationText(r.member_id, r.neighborhood) : r.neighborhood,
      })));
      setLocations(decrypted as MemberLocation[]);
    }
  }, []);

  useEffect(() => {
    load();
    const channelName = `kiosk_member_locations_${Math.random().toString(36).slice(2)}`;
    const ch = supabase.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_locations' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  // Same cold-start re-attach GpsTab.tsx does (GpsTab.tsx:160-191) — the
  // task-body ref in locationTracking.ts lives in memory only, so a kiosk
  // app relaunch while tracking was already OS-level active would
  // otherwise deliver updates with no member to attribute them to.
  useEffect(() => {
    if (!active.id) return;
    (async () => {
      const isActive = await isBackgroundLocationTracking().catch(() => false);
      if (isActive) {
        setTracking(true);
        setBackgroundLocationMemberId(active.id);
        setBackgroundLocationFamilyId(familyId ?? null);
        return;
      }
      const { data } = await supabase.from('member_locations').select('share_location_enabled').eq('member_id', active.id).maybeSingle();
      if (data?.share_location_enabled && isBackgroundLocationSupported()) {
        const ok = await startBackgroundLocationTracking(active.id, familyId).catch(() => false);
        if (ok) { setTracking(true); startBatteryPolling(active.id); }
      }
    })();
  }, [active.id, familyId]);

  // Same toggle logic as GpsTab.tsx's toggleTracking (GpsTab.tsx:207-260) —
  // reused function-for-function, not reimplemented, so kiosk shares the
  // exact same permission flow, persisted-intent row, and error handling.
  const toggleTracking = async () => {
    if (!active.id) return;
    if (!isBackgroundLocationSupported()) {
      Alert.alert('Update needed', 'Location sharing needs a fresh app build to work on this device.');
      return;
    }
    setTogglingTrack(true);
    try {
      if (tracking) {
        await stopBackgroundLocationTracking();
        stopBatteryPolling();
        setTracking(false);
        await supabase.from('member_locations').update({ share_location_enabled: false }).eq('member_id', active.id);
      } else {
        const ok = await startBackgroundLocationTracking(active.id, familyId);
        if (!ok) {
          Alert.alert('Location permission needed',
            Platform.OS === 'ios'
              ? 'Go to Settings → Family Cube → Location and choose "Always" to share location from this device.'
              : 'Allow location access to share this device\'s position with the family.');
        } else {
          startBatteryPolling(active.id);
          await supabase.from('member_locations').upsert({
            member_id: active.id, family_id: familyId, share_location_enabled: true,
          }, { onConflict: 'member_id' });
        }
        setTracking(ok);
      }
    } catch (e) {
      console.warn('[KioskFindFamTab] toggleTracking failed', (e as Error)?.message ?? e);
      Alert.alert('Could not update location sharing', 'Something went wrong — please try again.');
    } finally {
      setTogglingTrack(false);
    }
  };

  const locFor = (id: string) => locations.find(l => l.member_id === id);

  return (
    <View style={s.root}>
      <View style={s.headerRow}>
        <Text style={[s.title, { color: colors.textPrimary }]}>Find Family</Text>
      </View>

      {/* Share My Location — same toggle GpsTab.tsx exposes for whoever's
          active (GpsTab.tsx:733-748), scoped to the kiosk's own currently
          switched-in profile since a kiosk has no single "owner" phone. */}
      <View style={[s.toggleRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={[s.toggleLabel, { color: colors.textPrimary }]}>
            Share {active.name.split(' ')[0]}'s location
          </Text>
          <Text style={[s.toggleSub, { color: colors.textTertiary }]}>
            {tracking ? 'Visible to the rest of the family' : 'Off — not shared with the family'}
          </Text>
        </View>
        {togglingTrack
          ? <CubeSpinner size={18} />
          : <Switch value={tracking} onValueChange={toggleTracking}
              trackColor={{ false: colors.border, true: colors.teal }} thumbColor="#fff" />}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
      <ScrollView contentContainerStyle={s.grid} showsVerticalScrollIndicator={false}>
        {members.map(m => {
          const rawLoc = locFor(m.id);
          // A member who explicitly turned "Share my location" off still
          // has a member_locations row (last-known data isn't deleted) —
          // GpsTab.tsx already gates its own "isLive" state on this same
          // flag so the pin/roster stop reading as current the instant
          // sharing is off; this kiosk view read the row unconditionally,
          // so it kept showing someone's last status/battery/neighborhood
          // as if it were live even after they opted out.
          const loc = rawLoc && rawLoc.share_location_enabled !== false ? rawLoc : null;
          const isLive = !!(loc && loc.lat != null && loc.lng != null);
          return (
            <View key={m.id} style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[s.avatar, { backgroundColor: colors.primaryLight }]}>
                <Text style={s.avatarEmoji}>{m.emoji ?? '👤'}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.name, { color: colors.textPrimary }]} numberOfLines={1}>{m.name}</Text>
                {loc ? (
                  <>
                    <View style={s.metaRow}>
                      <MapPin size={12} color={colors.teal} />
                      <Text style={[s.status, { color: colors.teal }]} numberOfLines={1}>
                        {loc.status_text || STATUS_LABEL[loc.status] || 'Unknown'}
                      </Text>
                    </View>
                    {!!loc.neighborhood && (
                      <Text style={[s.addr, { color: colors.textSecondary }]} numberOfLines={1}>{loc.neighborhood}</Text>
                    )}
                    {loc.battery_level != null && loc.battery_level <= 20 && (
                      <View style={s.metaRow}>
                        <BatteryLow size={12} color={colors.danger} />
                        <Text style={[s.lowBattery, { color: colors.danger }]}>{loc.battery_level}%</Text>
                      </View>
                    )}
                  </>
                ) : (
                  <Text style={[s.addr, { color: colors.textTertiary }]}>Location not shared</Text>
                )}
              </View>
              {isLive && (
                <TouchableOpacity onPress={() => openDirections(loc!.lat!, loc!.lng!, loc!.address || m.name)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={[s.navBtn, { backgroundColor: colors.tealLight ?? colors.teal + '18' }]}>
                  <Navigation size={16} color={colors.teal} />
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: 20 },
  headerRow: { marginBottom: 14 },
  title: { fontSize: 24, fontWeight: '800' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 14, marginBottom: 18 },
  toggleLabel: { fontSize: TYPO.body, fontWeight: '800' },
  toggleSub: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, width: 300, borderRadius: 16, borderWidth: 1, padding: 14 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarEmoji: { fontSize: 22 },
  name: { fontSize: TYPO.body, fontWeight: '800' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  status: { fontSize: 12, fontWeight: '700' },
  addr: { fontSize: 11.5, fontWeight: '600', marginTop: 3 },
  lowBattery: { fontSize: 11, fontWeight: '800' },
  navBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
