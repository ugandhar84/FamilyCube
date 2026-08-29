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
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform, ScrollView, Dimensions, Modal, Switch, Linking, Animated, PanResponder } from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import MapView, { Marker, PROVIDER_DEFAULT, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { Radio, MapPin, Battery, Zap, Navigation, Check, ChevronDown, LocateFixed, ShieldOff, RefreshCw, Car, Footprints } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { encryptLocationText, decryptLocationText } from '@/lib/locationCrypto';
import { useFamilyStore } from '@/store/familyStore';
import { useUIStore } from '@/store/uiStore';
import { startBackgroundLocationTracking, stopBackgroundLocationTracking, isBackgroundLocationTracking, setBackgroundLocationMemberId, setBackgroundLocationFamilyId, isBackgroundLocationSupported, readBatteryStatus, startBatteryPolling, stopBatteryPolling } from '@/lib/locationTracking';
import CubeSpinner from '@/components/CubeSpinner';
import FamilyAvatar from '@/components/FamilyAvatar';
import { CardHeader, StatusPill, MemberAvatar } from './shared';

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

const statusColors = (colors: any): Record<LocStatus, string> => ({
  at_home:     colors.teal,
  at_school:   colors.info,
  at_work:     colors.accent,
  in_transit:  colors.amber,
  at_activity: colors.success,
});

// Speed-based movement badge — same rough heuristic Life360-style apps use
// under the hood (no separate motion-activity API on either platform is
// worth the added native dependency here): under ~1.5mph reads as GPS
// jitter on a stationary phone, not real walking; 1.5–8mph is a normal
// walking/jogging pace; above that is a vehicle. Only shown for a LIVE
// location (isLive gate at the call site) — a stale/no-GPS row has no
// current speed reading to classify.
type MovementKind = 'driving' | 'walking' | 'stationary';
function classifyMovement(speedMph: number): MovementKind {
  if (speedMph > 8) return 'driving';
  if (speedMph > 1.5) return 'walking';
  return 'stationary';
}
const MOVEMENT_META: Record<MovementKind, { label: string; Icon: typeof Car }> = {
  driving:    { label: 'Driving',  Icon: Car },
  walking:    { label: 'Walking',  Icon: Footprints },
  stationary: { label: 'Still',    Icon: MapPin },
};

export default function GpsTab({ colors, isDark }: { colors: any; isDark: boolean }) {
  // Real tab bar height (includes the safe-area bottom inset the custom
  // CustomTabBar already factors in) — without this, the sheet's min-height
  // snap point and its content's bottom padding were computed against the
  // full screen height, so the last roster row and the sheet itself at its
  // minimum size both ended up hidden behind the tab bar.
  let tabBarHeight = 0;
  try { tabBarHeight = useBottomTabBarHeight(); } catch { /* not inside a bottom-tabs navigator (e.g. some embedded contexts) — no bar to clear */ }

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
          address: loc.address ? await decryptLocationText(loc.member_id, loc.address) : loc.address,
          street: loc.street ? await decryptLocationText(loc.member_id, loc.street) : loc.street,
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
    }).catch(() => {}); // isBackgroundLocationTracking already resolves false on failure; this is defense-in-depth against an uncaught rejection reaching here
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
        stopBatteryPolling();
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
          startBatteryPolling(activeMemberId);
        }
        setTracking(ok);
      }
    } catch (e) {
      // startBackgroundLocationTracking is the one call in this function
      // that can still legitimately throw (native permission/task-manager
      // errors) — this was an unguarded try/finally with no catch, so a
      // thrown error here surfaced as an uncaught rejection instead of
      // reaching the user as feedback.
      console.warn('[GpsTab] toggleTracking failed', (e as Error)?.message ?? e);
      Alert.alert('Could not update location sharing', 'Something went wrong — please try again.');
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
    const encStatusText = await encryptLocationText(memberId, familyId, statusText);
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
    role === 'parent' ? colors.accent : role === 'senior' ? colors.info : colors.success;

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
      // Was never captured here — only the background task wrote speed_mph,
      // so a manual refresh silently left it stale/zero. GPS speed is
      // meters/sec; negative/null readings happen at low accuracy, clamp to 0.
      const speedMph = pos.coords.speed && pos.coords.speed > 0 ? Math.round(pos.coords.speed * 2.237) : 0;
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
      const encAddress = await encryptLocationText(memberId, familyId, address);
      const encNeighborhood = await encryptLocationText(memberId, familyId, neighborhood);
      // Was never read here at all — every manual refresh left
      // battery_level/is_charging whatever the background task last wrote
      // (or nothing, for someone who's never moved far enough to trigger
      // it), so the % shown was frequently stale or a hardcoded fallback,
      // not this refresh's actual reading. Read it fresh, same as the
      // background task does.
      const { level: batteryLevel, isCharging } = await readBatteryStatus();
      console.log('[GpsTab] refreshMyLocation upserting', { memberId, familyId, lat, lng, shareExact, batteryLevel, isCharging });
      const { error: upsertErr } = await supabase.from('member_locations').upsert({
        member_id: memberId, family_id: familyId, lat, lng, address: encAddress,
        neighborhood: encNeighborhood, share_exact_address: shareExact,
        speed_mph: speedMph,
        ...(batteryLevel !== null ? { battery_level: batteryLevel } : {}),
        ...(isCharging !== null ? { is_charging: isCharging } : {}),
        last_updated: now,
      }, { onConflict: 'member_id' });
      if (upsertErr) console.error('[GpsTab] member_locations upsert failed:', upsertErr.message);
      if (familyId) {
        const { error: histErr } = await supabase.from('member_location_history').insert({
          member_id: memberId, family_id: familyId, lat, lng, address: encAddress,
          battery_level: batteryLevel, is_charging: isCharging,
          recorded_at: now,
        });
        if (histErr) console.error('[GpsTab] member_location_history insert failed:', histErr.message);
      }
    } finally {
      await load();
      setRefreshingId(null);
    }
  };

  // The native background task (startBackgroundLocationTracking) only
  // fires on real movement — 80m/~0.05mi — so a stationary phone can go
  // hours between location writes even with sharing on (user-reported: a
  // pin showing "18h ago" while sharing was supposedly active). Mirrors
  // startBatteryPolling's existing pattern of a plain interval independent
  // of the movement gate, but scoped to LOCATION specifically and only
  // while sharing is actually on (unlike battery, which polls
  // unconditionally — location is the privacy-sensitive one, so this must
  // never run just because the GPS screen happens to be mounted). Also
  // only while this screen is in the foreground — a JS setInterval doesn't
  // reliably fire once the app backgrounds on iOS anyway, which is exactly
  // what the native background task above already exists to cover.
  useEffect(() => {
    if (!tracking || !activeMemberId) return;
    const interval = setInterval(() => {
      refreshMyLocation(activeMemberId);
    }, 5 * 60_000);
    return () => clearInterval(interval);
  }, [tracking, activeMemberId, familyId]);

  const [historyFor, setHistoryFor] = useState<{ member_id: string; name: string } | null>(null);
  const [history, setHistory] = useState<{ lat: number; lng: number; address: string | null; recorded_at: string }[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const openHistory = async (memberId: string, name: string) => {
    setHistoryFor({ member_id: memberId, name });
    setHistoryLoading(true);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    // Already date-bounded (today only), but a defensive cap guards
    // against a pathological case (e.g. GPS glitching and writing many
    // pings in a burst) rather than assuming today's row count is always
    // small.
    const { data } = await supabase
      .from('member_location_history')
      .select('lat, lng, address, recorded_at')
      .eq('member_id', memberId)
      .gte('recorded_at', startOfDay.toISOString())
      .order('recorded_at', { ascending: false })
      .limit(500);
    const decrypted = await Promise.all((data ?? []).map(async h => ({
      ...h, address: h.address ? await decryptLocationText(memberId, h.address) : h.address,
    })));
    setHistory(decrypted);
    setHistoryLoading(false);
  };

  // Tapping a member's address opens turn-by-turn directions in the
  // platform's native maps app (Apple Maps on iOS, Google Maps on
  // Android) — previously the address was just static text, no way to
  // actually navigate to where someone is. Falls back to Google Maps'
  // web URL (works from any platform/browser) if the native scheme fails
  // to open (e.g. Apple Maps not installed/available).
  const openDirections = async (lat: number, lng: number, label: string) => {
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

  // Active member always first (it's "my" row — the one thing worth
  // anchoring in place regardless of anyone's activity), then everyone
  // else sorted by most-recently-updated first, so a family member who
  // just moved/refreshed surfaces near the top instead of wherever the DB
  // happened to return their row. Was unordered ([...pinned, ...unpinned]
  // with no sort inside either group), so the list visually shuffled on
  // every realtime reload with no predictable order at all.
  //
  // Must stay above the `if (loading) return` early-return below — hooks
  // can never be conditional, and this one previously sat after it, which
  // corrupted the hook order (and crashed with "Rendered more hooks than
  // during the previous render") the instant `loading` flipped from true
  // to false on a live device.
  const roster = useMemo(() => {
    const all = [...pinned, ...unpinned];
    return all.sort((a, b) => {
      if (a.member_id === activeMemberId) return -1;
      if (b.member_id === activeMemberId) return 1;
      return new Date(b.last_updated).getTime() - new Date(a.last_updated).getTime();
    });
  }, [pinned, unpinned, activeMemberId]);

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

  // Map fills most of the screen, but leaves real room below for the roster
  // — a pure 80%-of-screen map left only a sliver for family member rows.
  // Draggable between three snap points via the grabber handle: MIN (mostly
  // collapsed, map fills nearly the whole screen), DEFAULT (this original
  // 48%-of-screen split), and MAX (sheet fills most of the screen, map
  // reduced to a strip up top) — previously a static height with a grabber
  // handle that looked draggable but did nothing.
  //
  // All hooks here MUST stay above the `if (loading) return` below — they
  // used to sit after it, which only ran them once loading finished,
  // violating the Rules of Hooks ("Rendered more hooks than during the
  // previous render") the moment loading flipped from true to false.
  const { height: SCREEN_H_RAW } = Dimensions.get('window');
  // The tab bar sits below this whole screen and eats into the visible
  // area — using the raw screen height for the map/sheet split let the
  // sheet's own "MIN" snap point end up SHORTER than the tab bar itself,
  // so at min-height the entire sheet rendered underneath the bar instead
  // of just being smaller. Usable height is screen minus the tab bar; and
  // SHEET_MIN has its own floor (not just a percentage) so it's always at
  // least tall enough to show the grabber + "Family (N)" header AND read as
  // an obvious, easy-to-grab sheet edge — confirmed live as too easy to
  // drag down to where the sheet became invisible against the map with
  // nothing left to grab it by. 140px (not 110) leaves real visible margin.
  const SCREEN_H = SCREEN_H_RAW - tabBarHeight;
  const SHEET_MIN = Math.max(140, Math.round(SCREEN_H * 0.16));
  const SHEET_DEFAULT = Math.round(SCREEN_H * 0.48);
  const SHEET_MAX = Math.round(SCREEN_H * 0.86);
  const SNAP_POINTS = [SHEET_MIN, SHEET_DEFAULT, SHEET_MAX];

  const sheetHeight = useRef(new Animated.Value(SHEET_DEFAULT)).current;
  const sheetHeightAtGestureStart = useRef(SHEET_DEFAULT);
  // Tracks which snap point the sheet is CURRENTLY resting at (updated on
  // every settle, drag or tap) — lets the grabber's plain-tap fallback
  // cycle to "the next one up" without re-deriving it from the live
  // Animated.Value (which needs an async listener/stopAnimation to read).
  const currentSnapRef = useRef(SHEET_DEFAULT);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, gesture) => Math.abs(gesture.dy) > 4,
      onPanResponderGrant: () => {
        sheetHeight.stopAnimation(v => { sheetHeightAtGestureStart.current = v; });
      },
      onPanResponderMove: (_e, gesture) => {
        // Dragging UP (negative dy) grows the sheet — invert dy.
        const next = sheetHeightAtGestureStart.current - gesture.dy;
        sheetHeight.setValue(Math.max(SHEET_MIN, Math.min(SHEET_MAX, next)));
      },
      onPanResponderRelease: (_e, gesture) => {
        // A near-zero-movement release is a TAP, not a drag — cycles to the
        // next snap point up (wrapping to MIN past MAX) instead of just
        // re-snapping to wherever it already was, which is what made the
        // grabber feel unresponsive/"stuck" when a drag attempt was too
        // small to register as real movement. This is the safety net for
        // recovering the sheet without needing a precise drag gesture.
        if (Math.abs(gesture.dy) < 6 && Math.abs(gesture.dx) < 6) {
          const next = SNAP_POINTS.find(p => p > currentSnapRef.current + 4) ?? SNAP_POINTS[0];
          currentSnapRef.current = next;
          Animated.spring(sheetHeight, { toValue: next, useNativeDriver: false, tension: 220, friction: 26 }).start();
          return;
        }
        const released = sheetHeightAtGestureStart.current - gesture.dy;
        // Snap to whichever of the three points is nearest, with a little
        // velocity bias so a quick flick commits to the next point even
        // from partway there rather than snapping back to where it started.
        const biased = released - gesture.vy * 60;
        const nearest = SNAP_POINTS.reduce((best, p) =>
          Math.abs(p - biased) < Math.abs(best - biased) ? p : best, SNAP_POINTS[0]);
        currentSnapRef.current = nearest;
        Animated.spring(sheetHeight, {
          toValue: nearest, useNativeDriver: false, tension: 220, friction: 26,
        }).start();
      },
    })
  ).current;

  if (loading) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <CubeSpinner size={28} />
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      {/* Full-bleed map — Apple-Maps style. Height derived from the sheet's
          animated height so it grows/shrinks in lockstep as the sheet is
          dragged. */}
      <Animated.View style={{ height: Animated.subtract(SCREEN_H, sheetHeight), overflow: 'hidden' }}>
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
            // Same speed-based movement badge as the list row below
            // (classifyMovement) — was list-row-only, so the map view (the
            // primary "where's everyone right now" glance) had no
            // Life360-style driving/walking indicator at all next to a
            // moving member's pin.
            const movement = classifyMovement(loc.speed_mph ?? 0);
            const movementMeta = movement !== 'stationary' ? MOVEMENT_META[movement] : null;
            return (
              <Marker key={loc.member_id} coordinate={{ latitude: loc.lat!, longitude: loc.lng! }}
                title={loc.name} description={loc.status_text ?? STATUS_LABELS[loc.status]}
                anchor={{ x: 0.5, y: 1 }}>
                <View style={g.mapPinWrap}>
                  <View>
                    <View style={[g.mapPinAvatar, { borderColor: rc }]}>
                      <FamilyAvatar name={loc.name} emoji={m?.emoji} avatarUrl={m?.avatarUrl}
                        siblings={members.map(mb => mb.name)} ringColor={rc} ringWidth={0} size={34} />
                    </View>
                    {movementMeta && (
                      <View style={[g.mapPinBadge, { backgroundColor: colors.info, borderColor: '#fff' }]}>
                        <movementMeta.Icon size={10} color="#fff" />
                      </View>
                    )}
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

        {/* Floating header, over the map — no boxed card, translucent pills like Apple Maps.
            mapHeaderChip's own backgroundColor is a hardcoded white
            (rgba(255,255,255,0.92)) with no theme awareness at all — in
            dark mode, colors.textPrimary is correctly near-white for use
            on DARK backgrounds, so pairing it with this always-white pill
            produced white-on-white, unreadable (direct feedback: "white
            color pill on map"). The "1/2 live" pill next to it only
            looked okay by accident — colors.textSecondary's dark-mode
            value happens to still have some contrast left over white.
            Overridden here to a real theme-aware translucent background
            instead of patching the two text colors individually. */}
        <View style={g.mapHeaderOverlay}>
          <View style={[g.mapHeaderChip, { backgroundColor: isDark ? 'rgba(30,26,20,0.85)' : 'rgba(255,255,255,0.92)' }]}>
            <Radio size={14} color={colors.teal} />
            <Text style={{ fontSize: 12, fontWeight: '900', color: colors.textPrimary, marginLeft: 6 }}>Family Radar</Text>
          </View>
          <View style={[g.mapHeaderChip, { backgroundColor: isDark ? 'rgba(30,26,20,0.85)' : 'rgba(255,255,255,0.92)' }]}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textSecondary }}>
              {pinned.length}/{locations.length} live
            </Text>
          </View>
        </View>

        {/* Share My Location — floating pill, bottom-right of the map like a Maps action button */}
        <TouchableOpacity onPress={toggleTracking} disabled={togglingTrack} style={g.trackFab}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <View style={[g.trackFabInner, {
            backgroundColor: tracking ? colors.teal : (isDark ? colors.card : '#fff'),
          }]}>
            {togglingTrack
              ? <CubeSpinner size={16} />
              : tracking
                ? <LocateFixed size={18} color="#fff" />
                : <Navigation size={18} color={colors.teal} />}
          </View>
        </TouchableOpacity>
      </Animated.View>

      {/* Bottom sheet — pulls up over the map with a rounded top, plain rows
          (no cards). Person, address, battery, last refreshed, manual refresh.
          Draggable via the grabber handle (panResponder), independent of the
          ScrollView's own scroll gesture below it — the grabber sits in its
          own small non-scrolling header row so dragging it never fights
          with scrolling the roster list. */}
      <Animated.View style={[g.sheet, { backgroundColor: colors.background, marginTop: -18, height: sheetHeight, overflow: 'hidden' }]}>
        {/* Grabber row — generous fixed-height pan target (not just the 4px
            bar itself) so it's easy to grab without precision. A plain View
            with the raw panHandlers, NOT a Touchable — layering
            TouchableOpacity's own gesture responder on top of PanResponder
            here made them fight each other and broke dragging entirely
            (confirmed live). The tap-to-cycle safety net lives inside
            panResponder's own onPanResponderRelease instead (a near-zero-
            movement release counts as a tap there). */}
        <View {...panResponder.panHandlers} style={{ paddingTop: 10, paddingBottom: 10, alignItems: 'center' }}>
          <View style={g.grabber} />
        </View>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 90 }}
          showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 13, fontWeight: '900', color: colors.textPrimary, marginBottom: 10 }}>
          Family ({roster.length})
        </Text>

        {/* Real, labeled toggle — the only other way to turn sharing on was
            a small unlabeled icon-only button floating on the map itself
            (trackFab below), which a user had no way to discover meant
            "tap to share your location" (flagged directly: "give another
            toggle button... visible to user, they don't need to click on
            arrow"). Same Switch + labeled-row pattern as "Share exact
            address" right below it, and the same toggleTracking handler
            the map button already uses — one source of truth, two entry
            points to it. */}
        <View style={[g.exactToggleRow, { borderColor: colors.border, marginBottom: 10 }]}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textPrimary }}>
              Share my location
            </Text>
            <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 1 }}>
              {tracking
                ? 'Your family can see where you are on the map'
                : 'Off — your family can\'t see your location'}
            </Text>
          </View>
          {togglingTrack
            ? <CubeSpinner size={16} />
            : <Switch value={tracking} onValueChange={toggleTracking}
                trackColor={{ false: colors.border, true: colors.teal }} thumbColor="#fff" />}
        </View>

        {!tracking && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 12 }}>
            <ShieldOff size={11} color={colors.textTertiary} />
            <Text style={{ fontSize: 11, color: colors.textTertiary, flex: 1 }}>
              Your location is off — turn on "Share my location" above to share it with your family.
            </Text>
          </View>
        )}

        {/* Was only rendered while tracking===true, so a user with location
            sharing off had no way to even discover this setting exists.
            Always shown now, and always interactive — this is just a
            preference for whenever sharing IS on, not something that
            needs sharing on right now to set. */}
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
            trackColor={{ false: colors.border, true: colors.teal }} thumbColor="#fff" />
        </View>

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
                {isLive ? (
                  <TouchableOpacity onPress={() => openDirections(loc.lat!, loc.lng!, loc.address || loc.name)} hitSlop={{ top: 4, bottom: 4 }}>
                    <Text style={{ fontSize: 12, color: colors.teal, fontWeight: '600', marginTop: 2, textDecorationLine: 'underline' }} numberOfLines={1}>
                      {loc.address && loc.address !== 'Unknown' ? loc.address : (loc.status_text ?? STATUS_LABELS[loc.status])}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }} numberOfLines={1}>
                    {loc.address && loc.address !== 'Unknown' ? loc.address : (loc.status_text ?? STATUS_LABELS[loc.status])}
                  </Text>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
                  {isLive && (() => {
                    const movement = classifyMovement(loc.speed_mph ?? 0);
                    // "Still" is the common case (most people most of the
                    // time) — only surface the badge for actual movement,
                    // otherwise it's just noise on nearly every row.
                    if (movement === 'stationary') return null;
                    const { label, Icon } = MOVEMENT_META[movement];
                    return (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Icon size={10} color={colors.info} />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.info }}>{label}</Text>
                      </View>
                    );
                  })()}
                  {isLive && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      {loc.is_charging
                        ? <Zap size={10} color={colors.amber} />
                        : <Battery size={10} color={loc.battery_level > 30 ? colors.textTertiary : colors.danger} />}
                      <Text style={{ fontSize: 11, fontWeight: '700', color: loc.battery_level > 30 ? colors.textTertiary : colors.danger }}>
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
                  ? <ActivityIndicator size="small" color={colors.teal} />
                  : <RefreshCw size={16} color={colors.textTertiary} />}
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })}
        </ScrollView>
      </Animated.View>

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
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.teal }}>Done</Text>
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
                    <View style={[g.historyDot, { backgroundColor: colors.teal }]} />
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
  mapPinBadge:  { position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9,
                  borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
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

  sheet:        { borderTopLeftRadius: 22, borderTopRightRadius: 22,
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
  historyDot:   { width: 6, height: 6, borderRadius: 3 },
});
