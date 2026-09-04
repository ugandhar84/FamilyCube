/**
 * KioskFindFamTab — family map + location roster for kiosk mode.
 *
 * Live-reported: "why there is no map view?" — an earlier pass here
 * reasoned that react-native-maps needed GpsTab.tsx's PanResponder-driven
 * draggable bottom sheet (GpsTab.tsx:558-596) and skipped the map
 * entirely on that basis. That reasoning didn't hold up: MapView/Marker
 * (GpsTab.tsx:610-649) are a self-contained map render with no dependency
 * on the sheet gesture at all — the sheet is a SEPARATE phone-only detail
 * panel layered on top, not something the map itself needs. Kiosk now
 * shows the real map, full-width above the roster (no draggable sheet —
 * there's no need to trade map space for list space on a screen this
 * wide, so both are simply shown at once, not chosen between).
 *
 * Every actual capability GpsTab.tsx offers a viewer is reused here — same
 * `member_locations` table + decryptLocationText path (GpsTab.tsx:17,
 * 128-129), same avatar-pin Marker rendering and initialRegion bounding-box
 * math (GpsTab.tsx:464-480, 618-647), same Share My Location toggle backed
 * by the identical lib/locationTracking.ts functions GpsTab.tsx itself
 * calls (GpsTab.tsx:20, 207-260), and the same tap-to-navigate-in-native-
 * Maps action (GpsTab.tsx:441-456, openDirections). No AI ETA/arrival-
 * prediction and no geofence-trigger UI exist anywhere in GpsTab.tsx to
 * parity-match — the only geofence-adjacent field is safe_zone_name, a
 * plain display string (GpsTab.tsx:48), and low-battery alerts are a
 * push-notification pipeline (lib/locationTracking.ts's
 * maybeAlertLowBattery, fired from the background task itself), not a UI
 * element — kiosk's existing low-battery badge already mirrors GpsTab's
 * own <=20% styling threshold.
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet, TouchableOpacity, Switch, Alert, Platform, Linking } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
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
import FamilyAvatar from '@/components/FamilyAvatar';
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

  // Same role-color mapping GpsTab.tsx's own roleColor uses (GpsTab.tsx:292-293).
  const roleColor = (role: string) =>
    role === 'parent' ? colors.accent : role === 'senior' ? colors.info : colors.success;

  // Same "who has a live pin" filter and bounding-box region math GpsTab.tsx
  // uses (GpsTab.tsx:461, 464-480) — centers/zooms to fit everyone sharing,
  // falling back to a continental-US view until at least one real pin exists.
  const pinned = useMemo(
    () => locations.filter(l => l.lat != null && l.lng != null && l.share_location_enabled !== false),
    [locations],
  );
  const initialRegion = useMemo(() => {
    if (pinned.length === 0) {
      return { latitude: 39.5, longitude: -98.35, latitudeDelta: 20, longitudeDelta: 20 };
    }
    const lats = pinned.map(p => p.lat!);
    const lngs = pinned.map(p => p.lng!);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max(0.02, (maxLat - minLat) * 1.6),
      longitudeDelta: Math.max(0.02, (maxLng - minLng) * 1.6),
    };
  }, [pinned]);

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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
        {/* Real map — same MapView/Marker/avatar-pin rendering GpsTab.tsx
            uses, just laid out full-width above the roster instead of
            behind a draggable sheet, since kiosk has room to show both at
            once rather than trading one for the other. */}
        <View style={[s.mapWrap, { borderColor: colors.border }]}>
          <MapView
            provider={PROVIDER_DEFAULT}
            style={StyleSheet.absoluteFill}
            initialRegion={initialRegion}
            showsMyLocationButton={false}
            showsCompass={false}
          >
            {pinned.map(loc => {
              const m = members.find(mb => mb.id === loc.member_id);
              const rc = roleColor(m?.role ?? 'kid');
              return (
                <Marker key={loc.member_id} coordinate={{ latitude: loc.lat!, longitude: loc.lng! }}
                  title={m?.name ?? 'Family member'} description={loc.status_text ?? STATUS_LABEL[loc.status]}
                  anchor={{ x: 0.5, y: 1 }}>
                  <View style={s.mapPinWrap}>
                    <View style={[s.mapPinAvatar, { borderColor: rc }]}>
                      <FamilyAvatar name={m?.name ?? ''} emoji={m?.emoji} avatarUrl={m?.avatarUrl}
                        siblings={members.map(mb => mb.name)} ringColor={rc} ringWidth={0} size={34} />
                    </View>
                    <View style={[s.mapPinTail, { borderTopColor: rc }]} />
                  </View>
                </Marker>
              );
            })}
          </MapView>
          {pinned.length === 0 && (
            <View pointerEvents="none" style={s.mapEmptyOverlay}>
              <MapPin size={20} color="#fff" />
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff', marginTop: 4, textAlign: 'center' }}>
                No one is sharing their location yet
              </Text>
            </View>
          )}
        </View>

        <View style={s.grid}>
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
        </View>
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
  // Fixed height rather than flex — a map needs a real, generous glance-
  // able area on a kiosk (not a cramped strip), but shouldn't consume the
  // whole screen the way it does on a phone (where it's the only content
  // before scrolling to the sheet); 380px gives it genuine presence while
  // leaving the roster grid below fully visible without excess scrolling.
  mapWrap: { height: 380, borderRadius: 20, borderWidth: 1, overflow: 'hidden', marginBottom: 20 },
  mapPinWrap: { alignItems: 'center' },
  mapPinAvatar: {
    borderRadius: 20, borderWidth: 2.5, backgroundColor: '#fff', padding: 2,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  mapPinTail: {
    width: 0, height: 0, marginTop: -2,
    borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },
  mapEmptyOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)',
  },
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
