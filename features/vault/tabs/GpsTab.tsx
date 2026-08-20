/**
 * GpsTab — Family Radar, redesigned around a real interactive map
 * (react-native-maps) instead of the old decorative sonar-ring canvas.
 * Members with real lat/lng show as pins on the map; "Share My Location"
 * requests foreground + background ("Always") permission and starts
 * continuous updates via lib/locationTracking.ts, so your pin stays live
 * even while the app is backgrounded. Members without live GPS yet still
 * show in the list below with the existing manual status picker.
 */
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform, ScrollView, Dimensions, Modal, Switch } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { Radio, MapPin, Battery, Zap, Navigation, Check, ChevronDown, LocateFixed, ShieldOff, RefreshCw } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { encryptMessage, decryptMessage } from '@/lib/chatCrypto';
import { useFamilyStore } from '@/store/familyStore';
import { useUIStore } from '@/store/uiStore';
import { startBackgroundLocationTracking, stopBackgroundLocationTracking, isBackgroundLocationTracking, setBackgroundLocationMemberId, setBackgroundLocationFamilyId, isBackgroundLocationSupported } from '@/lib/locationTracking';
import CubeSpinner from '@/components/CubeSpinner';
import FamilyAvatar from '@/components/FamilyAvatar';
import { CardHeader, StatusPill, MemberAvatar, BRAND } from './shared';

type LocStatus = 'at_home' | 'at_school' | 'at_work' | 'in_transit' | 'at_activity';

interface MemberLocation {
  member_id: string;
  address: string;
  street?: string | null;
  neighborhood: string;
  share_exact_address?: boolean;
  lat: number | null;
  lng: number | null;
  battery_level: number;
  is_charging: boolean;
  speed_mph: number;
  status: LocStatus;
  status_text: string | null;
  distance_from_home_miles: number;
  safe_zone_name: string | null;
  last_updated: string;
  // joined
  name: string;
  role: string;
}

const STATUS_LABELS: Record<LocStatus, string> = {
  at_home:     'Home',
  at_school:   'School',
  at_work:     'Work',
  in_transit:  'In Transit',
  at_activity: 'Activity',
};

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const STATUS_COLORS: Record<LocStatus, string> = {
  at_home:     BRAND.teal,
  at_school:   BRAND.blue,
  at_work:     BRAND.purple,
  in_transit:  BRAND.amber,
  at_activity: BRAND.emerald,
};

export default function GpsTab({ colors, isDark }: { colors: any; isDark: boolean }) {
  const { members, activeMemberId } = useFamilyStore();
  const [locations, setLocations]   = useState<MemberLocation[]>([]);
  const [loading, setLoading]       = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [openPicker, setOpenPicker] = useState<string | null>(null);
  const [tracking, setTracking]     = useState(false);
  const [togglingTrack, setTogglingTrack] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const familyId = activeMember?.familyId;

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('member_locations').select('*');
    if (data) {
      const merged: MemberLocation[] = await Promise.all(data.map(async (loc: any) => {
        const m = members.find(mb => mb.id === loc.member_id);
        return {
          ...loc,
          address: loc.address ? await decryptMessage(loc.address) : loc.address,
          street: loc.street ? await decryptMessage(loc.street) : loc.street,
          name: m?.name ?? loc.member_id, role: m?.role ?? 'parent',
        };
      }));
      const missing = members.filter(m => !data.some((d: any) => d.member_id === m.id));
      for (const m of missing) {
        merged.push({
          member_id: m.id, name: m.name, role: m.role,
          address: 'Unknown', neighborhood: 'Unknown', lat: null, lng: null,
          battery_level: 100, is_charging: false, speed_mph: 0,
          status: 'at_home', status_text: null,
          distance_from_home_miles: 0, safe_zone_name: 'Home',
          last_updated: new Date().toISOString(),
        });
      }
      setLocations(merged);
    }
    setLoading(false);
  }, [members]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    // Hide the global Ask Cube FAB while this full-bleed map is open — it
    // sits directly over the map's own floating controls otherwise. This
    // screen is reached via client-side state inside VaultScreen (no route
    // change), so the tab layout can't detect it any other way.
    useUIStore.getState().setFullBleedScreenActive(true);
    return () => useUIStore.getState().setFullBleedScreenActive(false);
  }, []);

  useEffect(() => {
    // Re-attach the member id after a cold start — the task-body ref in
    // locationTracking.ts lives in memory only, so a relaunch while
    // tracking was already OS-level active would otherwise deliver
    // updates with no member to attribute them to until the user
    // manually re-toggles.
    isBackgroundLocationTracking().then(active => {
      setTracking(active);
      if (active && activeMemberId) {
        setBackgroundLocationMemberId(activeMemberId);
        setBackgroundLocationFamilyId(familyId ?? null);
      }
    });
  }, [activeMemberId, familyId]);

  // Realtime — other family members' background pings should move their
  // pin on your map without you needing to pull-to-refresh.
  useEffect(() => {
    // A fixed channel name collides if this effect ever runs twice before
    // the first subscription's cleanup completes (React Strict Mode's
    // dev-only double-invoke of effects hits this directly) — see the
    // identical fix in FamilyRadarSection.tsx for the full explanation.
    const channelName = `member_locations_live_${Math.random().toString(36).slice(2)}`;
    const ch = supabase.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_locations' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const toggleTracking = async () => {
    if (!activeMemberId) return;
    if (!isBackgroundLocationSupported()) {
      Alert.alert(
        'Update needed',
        'Location sharing needs a fresh app build to work on this device. Ask whoever maintains the app to rebuild and reinstall it, then this will work.',
      );
      return;
    }
    setTogglingTrack(true);
    try {
      if (tracking) {
        await stopBackgroundLocationTracking();
        setTracking(false);
      } else {
        const ok = await startBackgroundLocationTracking(activeMemberId, familyId);
        if (!ok) {
          Alert.alert(
            'Location permission needed',
            Platform.OS === 'ios'
              ? 'Go to Settings → Family Cube → Location and choose "Always" to share your location with your family.'
              : 'Allow location access to share your position with your family.',
          );
        } else {
          // Background delivery only fires after real movement/time
          // thresholds — without this, turning sharing on leaves you
          // invisible on the map until you happen to walk 0.1mi.
          await refreshMyLocation(activeMemberId);
        }
        setTracking(ok);
      }
    } finally {
      setTogglingTrack(false);
    }
  };

  const shareExactAddress = locations.find(l => l.member_id === activeMemberId)?.share_exact_address ?? false;

  const toggleExactAddress = async (value: boolean) => {
    if (!activeMemberId) return;
    setLocations(prev => prev.map(l => l.member_id === activeMemberId ? { ...l, share_exact_address: value } : l));
    // Pass the new value straight through instead of letting
    // refreshMyLocation re-derive it from `locations` — that state hasn't
    // re-rendered yet at this point in the same tick, so it would read the
    // pre-toggle value and immediately overwrite the switch back to it.
    await refreshMyLocation(activeMemberId, value);
  };

  const updateStatus = async (memberId: string, status: LocStatus) => {
    setUpdatingId(memberId);
    setOpenPicker(null);
    const statusText = STATUS_LABELS[status];
    const encStatusText = await encryptMessage(statusText);
    const { error } = await supabase.from('member_locations').upsert({
      member_id: memberId, family_id: familyId, status, status_text: statusText,
      last_updated: new Date().toISOString(),
      address: encStatusText, neighborhood: encStatusText,
    }, { onConflict: 'member_id' });
    if (!error) {
      setLocations(prev => prev.map(l =>
        l.member_id === memberId ? { ...l, status, status_text: statusText } : l
      ));
    }
    setUpdatingId(null);
  };

  const roleColor = (role: string) =>
    role === 'parent' ? BRAND.purple : role === 'senior' ? BRAND.blue : BRAND.emerald;

  const fmtTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return '--'; }
  };

  const fmtRelative = (iso: string) => {
    try {
      const ms = Date.now() - new Date(iso).getTime();
      const mins = Math.floor(ms / 60_000);
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      return fmtTime(iso);
    } catch { return '--'; }
  };

  // Manual per-person refresh — pulls this member's own fresh GPS fix right
  // now instead of waiting for the next background-triggered update. Only
  // meaningful for the active member (we can't force someone else's phone
  // to report in), so this re-requests + upserts the local device position.
  const refreshMyLocation = async (memberId: string, shareExactOverride?: boolean) => {
    if (memberId !== activeMemberId) { load(); return; }
    setRefreshingId(memberId);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      console.log('[GpsTab] refreshMyLocation permission status:', status);
      if (status !== 'granted') {
        Alert.alert('Location permission needed', 'Allow location access to share your position with your family.');
        await load();
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = pos.coords;
      let coarseAddress = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      let preciseAddress = coarseAddress;
      let neighborhood = coarseAddress;
      try {
        const [geo] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        if (geo) {
          // streetNumber + street → the exact house/building. street alone
          // (no number) is the privacy-safe fallback when the toggle is off.
          const streetName = geo.street ?? geo.name ?? null;
          coarseAddress = [streetName, geo.city].filter(Boolean).join(', ') || coarseAddress;
          preciseAddress = [
            [geo.streetNumber, streetName].filter(Boolean).join(' ') || streetName,
            geo.city,
          ].filter(Boolean).join(', ') || coarseAddress;
          neighborhood = geo.district ?? geo.city ?? geo.region ?? coarseAddress;
        }
      } catch { /* best-effort */ }
      const loc0 = locations.find(l => l.member_id === memberId);
      const shareExact = shareExactOverride ?? loc0?.share_exact_address ?? false;
      const address = shareExact ? preciseAddress : coarseAddress;
      const now = new Date().toISOString();
      const encAddress = await encryptMessage(address);
      const encNeighborhood = await encryptMessage(neighborhood);
      console.log('[GpsTab] refreshMyLocation upserting', { memberId, familyId, lat, lng, shareExact });
      const { error: upsertErr } = await supabase.from('member_locations').upsert({
        member_id: memberId, family_id: familyId, lat, lng, address: encAddress,
        neighborhood: encNeighborhood, share_exact_address: shareExact,
        last_updated: now,
      }, { onConflict: 'member_id' });
      if (upsertErr) console.error('[GpsTab] member_locations upsert failed:', upsertErr.message);
      if (familyId) {
        const loc = locations.find(l => l.member_id === memberId);
        const { error: histErr } = await supabase.from('member_location_history').insert({
          member_id: memberId, family_id: familyId, lat, lng, address: encAddress,
          battery_level: loc?.battery_level ?? null, is_charging: loc?.is_charging ?? null,
          recorded_at: now,
        });
        if (histErr) console.error('[GpsTab] member_location_history insert failed:', histErr.message);
      }
    } finally {
      await load();
      setRefreshingId(null);
    }
  };

  const [historyFor, setHistoryFor] = useState<{ member_id: string; name: string } | null>(null);
  const [history, setHistory] = useState<{ lat: number; lng: number; address: string | null; recorded_at: string }[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const openHistory = async (memberId: string, name: string) => {
    setHistoryFor({ member_id: memberId, name });
    setHistoryLoading(true);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from('member_location_history')
      .select('lat, lng, address, recorded_at')
      .eq('member_id', memberId)
      .gte('recorded_at', startOfDay.toISOString())
      .order('recorded_at', { ascending: false });
    const decrypted = await Promise.all((data ?? []).map(async h => ({
      ...h, address: h.address ? await decryptMessage(h.address) : h.address,
    })));
    setHistory(decrypted);
    setHistoryLoading(false);
  };

  const pinned = useMemo(() => locations.filter(l => l.lat != null && l.lng != null), [locations]);
  const unpinned = useMemo(() => locations.filter(l => l.lat == null || l.lng == null), [locations]);

  const initialRegion = useMemo(() => {
    if (pinned.length === 0) {
      // Fallback region — roughly continental-US center — used only until
      // at least one member has a real pin.
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

  // MapView is uncontrolled (initialRegion only) so refreshes don't hard-snap
  // the camera — react-native-maps' `region` prop re-centers/re-zooms on
  // every render when fed a new object, which is what caused the glitchy
  // jump on every refresh. We instead animate the camera ourselves, and only
  // when the region has meaningfully changed (new pins, or an existing pin
  // moving materially), not on every poll/realtime tick.
  const mapRef = useRef<MapView>(null);
  const lastAnimatedRegion = useRef<Region | null>(null);
  useEffect(() => {
    if (pinned.length === 0) return;
    const prev = lastAnimatedRegion.current;
    const moved = !prev || haversineMeters(prev.latitude, prev.longitude, initialRegion.latitude, initialRegion.longitude) > 40;
    if (!moved) return;
    lastAnimatedRegion.current = initialRegion;
    mapRef.current?.animateToRegion(initialRegion, 650);
  }, [initialRegion, pinned.length]);

  if (loading) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <CubeSpinner size={28} />
    </View>
  );

  const { height: SCREEN_H } = Dimensions.get('window');
  // Map fills most of the screen, but leaves real room below for the roster
  // — a pure 80%-of-screen map left only a sliver for family member rows.
  const MAP_HEIGHT = Math.round(SCREEN_H * 0.52);
  const roster = [...pinned, ...unpinned];

  return (
    <View style={{ flex: 1 }}>
      {/* Full-bleed map — Apple-Maps style. */}
      <View style={{ height: MAP_HEIGHT, overflow: 'hidden' }}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_DEFAULT}
          style={{ width: '100%', height: '100%' }}
          initialRegion={initialRegion}
          showsMyLocationButton={false}
          showsCompass={false}
        >
          {pinned.map(loc => {
            const rc = roleColor(loc.role);
            const m = members.find(mb => mb.id === loc.member_id);
            return (
              <Marker key={loc.member_id} coordinate={{ latitude: loc.lat!, longitude: loc.lng! }}
                title={loc.name} description={loc.status_text ?? STATUS_LABELS[loc.status]}
                anchor={{ x: 0.5, y: 1 }}>
                <View style={g.mapPinWrap}>
                  <View style={[g.mapPinAvatar, { borderColor: rc }]}>
                    <FamilyAvatar name={loc.name} emoji={m?.emoji} avatarUrl={m?.avatarUrl}
                      siblings={members.map(mb => mb.name)} ringColor={rc} ringWidth={0} size={34} />
                  </View>
                  <View style={[g.mapPinTail, { borderTopColor: rc }]} />
                </View>
              </Marker>
            );
          })}
        </MapView>

        {pinned.length === 0 && (
          <View pointerEvents="none" style={g.mapEmptyOverlay}>
            <MapPin size={20} color="#fff" />
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff', marginTop: 4, textAlign: 'center' }}>
              No one's sharing their live location yet
            </Text>
          </View>
        )}

        {/* Floating header, over the map — no boxed card, translucent pills like Apple Maps */}
        <View style={g.mapHeaderOverlay}>
          <View style={g.mapHeaderChip}>
            <Radio size={14} color={BRAND.teal} />
            <Text style={{ fontSize: 12, fontWeight: '900', color: colors.textPrimary, marginLeft: 6 }}>Family Radar</Text>
          </View>
          <View style={g.mapHeaderChip}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textSecondary }}>
              {pinned.length}/{locations.length} live
            </Text>
          </View>
        </View>

        {/* Share My Location — floating pill, bottom-right of the map like a Maps action button */}
        <TouchableOpacity onPress={toggleTracking} disabled={togglingTrack} style={g.trackFab}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <View style={[g.trackFabInner, {
            backgroundColor: tracking ? BRAND.teal : (isDark ? colors.card : '#fff'),
          }]}>
            {togglingTrack
              ? <CubeSpinner size={16} />
              : tracking
                ? <LocateFixed size={18} color="#fff" />
                : <Navigation size={18} color={BRAND.teal} />}
          </View>
        </TouchableOpacity>
      </View>

      {/* Bottom sheet — pulls up over the map with a rounded top, plain rows
          (no cards). Person, address, battery, last refreshed, manual refresh. */}
      <ScrollView style={[g.sheet, { backgroundColor: colors.background, marginTop: -18 }]}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}>
        <View style={g.grabber} />
        <Text style={{ fontSize: 13, fontWeight: '900', color: colors.textPrimary, marginBottom: 10 }}>
          Family ({roster.length})
        </Text>

        {!tracking && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 12 }}>
            <ShieldOff size={11} color={colors.textTertiary} />
            <Text style={{ fontSize: 11, color: colors.textTertiary, flex: 1 }}>
              Your location is off — turn on the button on the map to share it with your family.
            </Text>
          </View>
        )}

        {tracking && (
          <View style={[g.exactToggleRow, { borderColor: colors.border }]}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textPrimary }}>
                Share exact address
              </Text>
              <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 1 }}>
                {shareExactAddress
                  ? 'Family sees your exact street number, e.g. "412 Wimberley Dr"'
                  : 'Family sees street name only, e.g. "Wimberley Dr"'}
              </Text>
            </View>
            <Switch value={shareExactAddress} onValueChange={toggleExactAddress}
              trackColor={{ false: colors.border, true: BRAND.teal }} thumbColor="#fff" />
          </View>
        )}

        {roster.map((loc, i) => {
          const rc  = roleColor(loc.role);
          const m   = members.find(mb => mb.id === loc.member_id);
          const isMe = loc.member_id === activeMemberId;
          const isRefreshing = refreshingId === loc.member_id;
          const isLive = loc.lat != null && loc.lng != null;

          return (
            <TouchableOpacity key={loc.member_id} activeOpacity={0.6}
              onPress={() => openHistory(loc.member_id, loc.name)}
              style={[g.row, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
              <FamilyAvatar name={loc.name} emoji={m?.emoji} avatarUrl={m?.avatarUrl}
                siblings={members.map(mb => mb.name)} ringColor={rc} size={40} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary }}>
                  {loc.name}{isMe && <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textTertiary }}> (you)</Text>}
                </Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }} numberOfLines={1}>
                  {loc.address && loc.address !== 'Unknown' ? loc.address : (loc.status_text ?? STATUS_LABELS[loc.status])}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
                  {isLive && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      {loc.is_charging
                        ? <Zap size={10} color={BRAND.amber} />
                        : <Battery size={10} color={loc.battery_level > 30 ? colors.textTertiary : BRAND.rose} />}
                      <Text style={{ fontSize: 11, fontWeight: '700', color: loc.battery_level > 30 ? colors.textTertiary : BRAND.rose }}>
                        {loc.battery_level}%
                      </Text>
                    </View>
                  )}
                  <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                    {isLive ? fmtRelative(loc.last_updated) : 'No live GPS'}
                  </Text>
                </View>
              </View>

              <TouchableOpacity onPress={() => refreshMyLocation(loc.member_id)} disabled={isRefreshing}
                style={g.refreshBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                {isRefreshing
                  ? <ActivityIndicator size="small" color={BRAND.teal} />
                  : <RefreshCw size={16} color={colors.textTertiary} />}
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Modal visible={!!historyFor} animationType="slide" transparent onRequestClose={() => setHistoryFor(null)}>
        <View style={g.historyBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setHistoryFor(null)} />
          <View style={[g.historySheet, { backgroundColor: colors.background }]}>
            <View style={g.grabber} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 16, fontWeight: '900', color: colors.textPrimary }}>
                {historyFor?.name}'s Location Today
              </Text>
              <TouchableOpacity onPress={() => setHistoryFor(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: BRAND.teal }}>Done</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 12, color: colors.textTertiary, marginBottom: 10 }}>
              {new Date().toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
            </Text>

            {historyLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                <CubeSpinner size={24} />
              </View>
            ) : history.length === 0 ? (
              <Text style={{ fontSize: 13, color: colors.textTertiary, textAlign: 'center', paddingVertical: 24 }}>
                No location updates recorded yet today.
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                {history.map((h, idx) => (
                  <View key={idx} style={g.historyRow}>
                    <View style={g.historyTimeCol}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textPrimary }}>
                        {new Date(h.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                    <View style={g.historyDot} />
                    <Text style={{ fontSize: 13, color: colors.textSecondary, flex: 1, marginLeft: 10 }} numberOfLines={1}>
                      {h.address ?? `${h.lat.toFixed(4)}, ${h.lng.toFixed(4)}`}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const g = StyleSheet.create({
  mapPinWrap:   { alignItems: 'center' },
  mapPinAvatar: { borderRadius: 20, borderWidth: 2.5, backgroundColor: '#fff', padding: 2,
                  shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  mapPinTail:   { width: 0, height: 0, marginTop: -2,
                  borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8,
                  borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  mapEmptyOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                     alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  mapHeaderOverlay: { position: 'absolute', top: 12, left: 12, right: 12,
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mapHeaderChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.92)',
                   borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
                   shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  trackFab:     { position: 'absolute', right: 12, bottom: 16 },
  trackFabInner: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
                   shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 },

  sheet:        { flex: 1, borderTopLeftRadius: 22, borderTopRightRadius: 22,
                  shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: -3 }, elevation: 6 },
  grabber:      { width: 36, height: 4, borderRadius: 2, backgroundColor: '#00000020', alignSelf: 'center', marginTop: 8, marginBottom: 12 },
  exactToggleRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1,
                    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  row:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  refreshBtn:   { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },

  historyBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  historySheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 32, maxHeight: '75%' },
  historyRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  historyTimeCol: { width: 62 },
  historyDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: BRAND.teal },
});
