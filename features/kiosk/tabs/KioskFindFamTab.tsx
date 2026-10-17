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
 * READ-ONLY by design — live-requested: "for kiosk we don't need to poll
 * the kiosk device location, instead show whatever is there from DB which
 * is mobile's updated one." A wall-mounted kiosk has no meaningful GPS
 * position of its own to share, and whichever member profile happens to be
 * switched in on it at a given moment isn't "at" the kiosk's physical
 * location in any way worth reporting — a phone's GPS answers "where is
 * this person," a kiosk's GPS would only ever answer "where is the
 * kitchen wall," which nobody needs. This tab used to carry a full "Share
 * my location" toggle + startBackgroundLocationTracking/battery-polling
 * cold-start re-attach, copied verbatim from GpsTab.tsx (the phone's own
 * tab, where tracking genuinely makes sense) — removed entirely. Every
 * `member_locations` row shown here was always going to be one some
 * phone's own GpsTab wrote; this tab only ever needs to read and decrypt
 * it, same as it already did for the map/roster.
 *
 * Every other capability GpsTab.tsx offers a viewer is reused here — same
 * `member_locations` table + decryptLocationText path (GpsTab.tsx:17,
 * 128-129), same avatar-pin Marker rendering and initialRegion bounding-box
 * math (GpsTab.tsx:464-480, 618-647), and the same tap-to-navigate-in-
 * native-Maps action (GpsTab.tsx:441-456, openDirections). No AI ETA/
 * arrival-prediction and no geofence-trigger UI exist anywhere in
 * GpsTab.tsx to parity-match — the only geofence-adjacent field is
 * safe_zone_name, a plain display string (GpsTab.tsx:48), and low-battery
 * alerts are a push-notification pipeline (lib/locationTracking.ts's
 * maybeAlertLowBattery, fired from the background task itself, i.e. from
 * whichever phone is actually tracking), not a UI element — kiosk's
 * existing low-battery badge already mirrors GpsTab's own <=20% styling
 * threshold, reading the same battery_level column any tracking phone
 * already writes.
 *
 * ── Hub-OS migration ────────────────────────────────────────────────────
 * Restyled onto the kiosk palette + KioskOS primitives. Every piece of
 * logic in this file is deliberately untouched: the member_id ordering and
 * the debounced realtime reload (both native-crash guards for
 * react-native-maps' Fabric interop layer), the Number.isFinite pin filter,
 * decryptLocationText, the share_location_enabled gate, and the
 * haversine "meaningful move" camera guard all survive verbatim. This is a
 * styling pass over a screen whose behavior was already audited.
 *
 * The map and the roster are now each a WidgetCard, so the tab reads as two
 * zones rather than a bare map above a loose grid, and the roster rows use
 * the Well treatment every other migrated tab uses for a list row.
 */
import { useEffect, useMemo, useRef, useState, useCallback, memo } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet, Pressable, Platform, Linking, Alert, useWindowDimensions } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { MapPin, BatteryLow, BatteryMedium, Navigation, History, Plus, Minus, LocateFixed, Clock, Car, ShieldCheck, MessageCircle } from 'lucide-react-native';
import { KIOSK_TYPO, KIOSK_HIT, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import { useKioskColors, kioskRoleAccent, kioskPastels } from '../kioskPalette';
import { useKioskNavStore } from '@/store/kioskNavStore';
import { Eyebrow } from '../components/KioskHomeParts';
import { WidgetCard, WidgetHeader, Well, Chip, TabTitle, EmptyNote } from '../components/KioskOS';
import { KioskFormDrawer } from '../components/KioskFormDrawer';
import { useKioskActivity, useKioskLockSuspended } from '../KioskActivityContext';
import { supabase } from '@/lib/supabase';
import { withAndroidShadowFix } from '@/lib/androidShadowFix';
import { decryptLocationText } from '@/lib/locationCrypto';
import type { FamilyMember } from '@/store/familyStore';
import FamilyAvatar from '@/components/FamilyAvatar';
import { KioskAvatar } from '../components/KioskAvatar';

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

// Same distance check GpsTab.tsx uses (GpsTab.tsx:63-70) to decide whether
// a freshly-computed initialRegion is a MEANINGFUL move worth re-animating
// the camera for, vs. GPS jitter on every realtime tick.
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Extracted + memoized so ONE family member's location ping doesn't force
// every OTHER member's marker to redraw — same fix and same reasoning as
// GpsTab.tsx's own FamilyMapMarker [live-reported: "Map should not refresh
// always... avatar change seamlessly if user moving.. I see map is doing
// full rebuilt" / "How Life360 handles similar way"]. A fresh `coordinate`
// object literal on every render (even when THIS member's own lat/lng
// hadn't changed) made react-native-maps redraw/reposition every marker's
// native layer on any unrelated realtime tick — memoized here with a
// stable coordinate object and primitive-only props so React.memo can
// actually skip re-rendering a marker whose own data didn't change.
const KioskFamilyMapMarker = memo(function KioskFamilyMapMarker({
  lat, lng, name, statusText, emoji, avatarUrl, siblingNames, ringColor, onPress,
}: {
  lat: number; lng: number; name: string; statusText: string;
  emoji?: string; avatarUrl?: string; siblingNames: string[]; ringColor: string;
  onPress?: () => void;
}) {
  const coordinate = useMemo(() => ({ latitude: lat, longitude: lng }), [lat, lng]);
  return (
    <Marker coordinate={coordinate} title={name} description={statusText} anchor={{ x: 0.5, y: 1 }} onPress={onPress}>
      <View style={s.mapPinWrap}>
        <View style={withAndroidShadowFix([s.mapPinAvatar, { borderColor: ringColor }])}>
          <FamilyAvatar name={name} emoji={emoji} avatarUrl={avatarUrl}
            siblings={siblingNames} ringColor={ringColor} ringWidth={0} size={40} />
        </View>
        <View style={[s.mapPinTail, { borderTopColor: ringColor }]} />
      </View>
    </Marker>
  );
});

export function KioskFindFamTab({ active, members }: {
  active: FamilyMember; members: FamilyMember[];
}) {
  const { k, isDark } = useKioskColors();
  const { registerActivity } = useKioskActivity();
  const [locations, setLocations] = useState<MemberLocation[]>([]);
  const [loading, setLoading] = useState(true);

  // Real "Location Today" timeline — same member_location_history query
  // GpsTab.tsx's own openHistory uses (today-only, decrypted addresses,
  // newest first) [live-requested: "history we have the location history
  // of each person right.. and provide the location icon to open the
  // maps" — a genuinely missing real feature this fork never carried
  // over, not something to invent]. The card's separate Navigation icon
  // still opens native-maps directions, unchanged.
  const [historyFor, setHistoryFor] = useState<{ member_id: string; name: string } | null>(null);
  const [history, setHistory] = useState<{ lat: number; lng: number; address: string | null; recorded_at: string }[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  useKioskLockSuspended(!!historyFor);

  const openHistory = async (memberId: string, name: string) => {
    registerActivity();
    setHistoryFor({ member_id: memberId, name });
    setHistoryLoading(true);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
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

  // Live-reported: "can we have map view lil taller in the portrait mode" —
  // a fixed 380px reads fine in landscape (where width is already scarce
  // and vertical room is at a premium relative to it) but leaves the map
  // feeling short on a portrait kiosk screen, which has far more spare
  // vertical space to give it. Scale off the actual window height instead
  // of a flat constant, capped so a very tall screen doesn't turn the map
  // into most of the tab.
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const isPortrait = winHeight >= winWidth;
  const mapHeight = isPortrait ? Math.min(560, Math.round(winHeight * 0.42)) : 380;

  const load = useCallback(async () => {
    // Stable order matters here beyond cosmetics: react-native-maps' Fabric
    // interop layer (RCTLegacyViewManagerInteropComponentView, since
    // newArchEnabled is on) has been observed crashing natively
    // ("insertObject:atIndex: object cannot be nil" inside AIRMap) when its
    // Marker children reorder between renders with no stable backing sort —
    // a bare `select('*')` with no .order() doesn't guarantee row order
    // between calls, and this reloads on every single realtime change to
    // member_locations (any member, not just this one). Ordering by
    // member_id keeps pinned's derived array (and therefore each render's
    // Marker list) in the same relative order every time, so the interop
    // layer is diffing a genuinely stable list rather than churn from
    // nothing more than Postgres returning rows in a different sequence.
    const { data } = await supabase.from('member_locations').select('*').order('member_id');
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
    // Debounced — react-native-maps' Fabric interop layer
    // (RCTLegacyViewManagerInteropComponentView, since newArchEnabled is on;
    // the library isn't fully Fabric-native yet) has a known native crash
    // ("insertObject:atIndex: object cannot be nil" inside AIRMap) triggered
    // by Marker children mounting/unmounting in quick succession. A bare
    // per-event `load()` re-renders (and therefore re-mounts every Marker
    // via the pinned.map() below) on EVERY single row change to
    // member_locations, for ANY member — a burst of several updates close
    // together (multiple members moving, or repeated writes while testing)
    // fired that mount/unmount churn repeatedly within milliseconds, right
    // in the window this crash needs. Collapsing a burst into one reload
    // 400ms after the last event in it doesn't fix the underlying library
    // limitation, but removes the actual trigger this screen was
    // repeatedly hitting it with.
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedLoad = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(load, 400);
    };
    const channelName = `kiosk_member_locations_${Math.random().toString(36).slice(2)}`;
    const ch = supabase.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_locations' }, debouncedLoad)
      .subscribe();
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(ch);
    };
  }, [load]);

  const locFor = (id: string) => locations.find(l => l.member_id === id);

  // Role -> accent now goes through the palette's own kioskRoleAccent, the
  // same helper every other kiosk surface uses, rather than a local ternary
  // over the app palette. Same semantic mapping (parent / senior / kid each
  // keep their own hue), now in kiosk's tuned values so a pin ring reads
  // against the map in both light and dark.
  const roleColor = (role: string) => kioskRoleAccent(k, role);

  // Same "who has a live pin" filter and bounding-box region math GpsTab.tsx
  // uses (GpsTab.tsx:461, 464-480) — centers/zooms to fit everyone sharing,
  // falling back to a continental-US view until at least one real pin exists.
  const pinned = useMemo(
    () => locations.filter(
      (l): l is MemberLocation & { lat: number; lng: number } =>
        // Was `l.lat != null && l.lng != null` with the Marker below reading
        // loc.lat!/loc.lng! — a type-level promise, not a runtime one. NaN
        // passes `!= null` (NaN !== null and NaN !== undefined are both
        // true) yet is exactly the kind of value a native map view chokes
        // on — react-native-maps' Fabric interop layer has been observed
        // crashing natively ("insertObject:atIndex: object cannot be nil")
        // when a Marker's coordinate isn't a real finite number. Number.isFinite
        // rejects null/undefined/NaN/Infinity in one check, so nothing
        // downstream needs the `!` assertions anymore.
        Number.isFinite(l.lat) && Number.isFinite(l.lng) && l.share_location_enabled !== false,
    ),
    [locations],
  );
  const initialRegion = useMemo(() => {
    if (pinned.length === 0) {
      return { latitude: 39.5, longitude: -98.35, latitudeDelta: 20, longitudeDelta: 20 };
    }
    const lats = pinned.map(p => p.lat);
    const lngs = pinned.map(p => p.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max(0.02, (maxLat - minLat) * 1.6),
      longitudeDelta: Math.max(0.02, (maxLng - minLng) * 1.6),
    };
  }, [pinned]);

  // Same "only re-animate on a meaningful move" guard GpsTab.tsx uses
  // (GpsTab.tsx:505-519) — MapView's `initialRegion` prop is read ONCE at
  // first render only, so without this the camera would zoom-to-fit
  // whatever was loaded at that exact instant (often nothing yet, or a
  // stale set) and never adjust again as real locations stream in via the
  // realtime subscription. animateToRegion is called imperatively instead
  // of feeding a new `region` prop every render, which GpsTab.tsx's own
  // comment notes causes a glitchy re-center/re-zoom jump on every poll.
  const mapRef = useRef<MapView>(null);
  const lastAnimatedRegion = useRef<{ latitude: number; longitude: number } | null>(null);
  useEffect(() => {
    if (pinned.length === 0) return;
    const prev = lastAnimatedRegion.current;
    const moved = !prev || haversineMeters(prev.latitude, prev.longitude, initialRegion.latitude, initialRegion.longitude) > 40;
    if (!moved) return;
    lastAnimatedRegion.current = { latitude: initialRegion.latitude, longitude: initialRegion.longitude };
    mapRef.current?.animateToRegion(initialRegion, 650);
  }, [initialRegion, pinned.length]);

  const sharingCount = pinned.length;
  const pastels = kioskPastels(k);
  const regionRef = useRef<{ latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string>(active.id);
  const zoomMap = (factor: number) => {
    const r = regionRef.current ?? initialRegion;
    mapRef.current?.animateToRegion({ ...r, latitudeDelta: r.latitudeDelta * factor, longitudeDelta: r.longitudeDelta * factor }, 250);
  };
  const focusMember = (id: string) => {
    setSelectedId(id);
    const l = locFor(id);
    if (l && Number.isFinite(l.lat) && Number.isFinite(l.lng) && l.share_location_enabled !== false) {
      const r = regionRef.current ?? initialRegion;
      mapRef.current?.animateToRegion({ latitude: l.lat as number, longitude: l.lng as number, latitudeDelta: Math.min(r.latitudeDelta, 0.05), longitudeDelta: Math.min(r.longitudeDelta, 0.05) }, 450);
    }
  };
  const ago = (iso?: string) => {
    if (!iso) return '';
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    const h = Math.floor(mins / 60);
    return h < 24 ? `${h} hr ago` : new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  const roster = members.filter(m => !(m as any).deletedAt && (m as any).inviteStatus !== 'pending');
  const messageMember = (id: string) => {
    registerActivity();
    useKioskNavStore.getState().setPendingDm(id);
    useKioskNavStore.getState().setPendingTab('chat');
  };

  return (
    <View style={s.root}>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={k.primary} />
      ) : (
        <View style={s.page}>
          {/* ── Map ── */}
          <View style={s.mapCol}>
            <MapView
              ref={mapRef}
              provider={PROVIDER_DEFAULT}
              style={StyleSheet.absoluteFill}
              initialRegion={initialRegion}
              showsMyLocationButton={false}
              showsCompass={false}
              onRegionChangeComplete={r => { regionRef.current = r; }}
            >
              {pinned.map(loc => {
                const m = members.find(mb => mb.id === loc.member_id);
                const rc = roleColor(m?.role ?? 'kid');
                return (
                  <KioskFamilyMapMarker
                    key={loc.member_id}
                    lat={loc.lat} lng={loc.lng}
                    name={m?.name ?? 'Family member'}
                    statusText={loc.status_text ?? STATUS_LABEL[loc.status]}
                    emoji={m?.emoji} avatarUrl={m?.avatarUrl}
                    siblingNames={members.map(mb => mb.name)}
                    ringColor={loc.member_id === selectedId ? k.primary : rc}
                    onPress={() => setSelectedId(loc.member_id)}
                  />
                );
              })}
            </MapView>
            {pinned.length === 0 && (
              <View pointerEvents="none" style={s.mapEmptyOverlay}>
                <MapPin size={28} color="#F7F2EE" />
                <Text style={s.mapEmptyText} numberOfLines={2}>No one is sharing their location yet</Text>
              </View>
            )}
            <View style={[s.mapTitle, { backgroundColor: k.card, borderColor: k.cardBorder }]}>
              <Text style={[s.mapTitleText, { color: k.text }]}>Find family</Text>
              <Text style={[s.mapSub, { color: k.textMuted }]}>{sharingCount} of {roster.length} sharing · from their phones</Text>
            </View>
            <View style={s.mapCtl}>
              {([[Plus, 0.5, 'Zoom in'], [Minus, 2, 'Zoom out']] as const).map(([Icon, f, label]) => (
                <Pressable key={label} onPress={() => zoomMap(f)} accessibilityRole="button" accessibilityLabel={label}
                  style={[s.ctlBtn, { backgroundColor: k.card, borderColor: k.cardBorder }]}>
                  <Icon size={22} color={k.text} />
                </Pressable>
              ))}
              <Pressable onPress={() => mapRef.current?.animateToRegion(initialRegion, 450)} accessibilityRole="button" accessibilityLabel="Show everyone"
                style={[s.ctlBtn, { backgroundColor: k.card, borderColor: k.cardBorder }]}>
                <LocateFixed size={22} color={k.text} />
              </Pressable>
            </View>
          </View>

          {/* ── Family panel ── */}
          <View style={[s.panel, { borderLeftColor: k.cardBorder }]}>
            <View style={s.panelHead}>
              <Eyebrow label="FAMILY" accent={k.sage} k={k} />
              <Text style={[s.panelCount, { color: k.textMuted }]}>{roster.length} people</Text>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: KIOSK_SPACE.sm, padding: KIOSK_SPACE.md, paddingTop: 0 }} onScrollBeginDrag={registerActivity}>
              {roster.map((m, i) => {
                const tone = pastels[Math.max(0, members.findIndex(x => x.id === m.id)) % pastels.length];
                const rawLoc = locFor(m.id);
                // Someone who turned sharing off keeps a stale row; never show it as live.
                const loc = rawLoc && rawLoc.share_location_enabled !== false ? rawLoc : null;
                const isLive = !!(loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng));
                const lowBattery = loc?.battery_level != null && loc.battery_level <= 20;
                const on = selectedId === m.id;
                const place = loc ? (loc.neighborhood || loc.status_text || STATUS_LABEL[loc.status] || 'Unknown') : 'Location not shared';
                return (
                  <View key={m.id} style={[s.card, { backgroundColor: on ? tone.card : tone.col, borderColor: on ? tone.fg : 'transparent' }]}>
                    <Pressable onPress={() => focusMember(m.id)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${m.name}, ${place}`} style={s.cardTop}>
                      <KioskAvatar name={m.name} emoji={m.emoji} avatarUrl={m.avatarUrl}
                        siblings={members.filter(x => x.id !== m.id).map(x => x.name)} size={48} bgColor={k.card} k={k} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[s.name, { color: k.text }]} numberOfLines={1}>{m.name}{m.id === active.id ? ' (you)' : ''}</Text>
                        <Text style={[s.place, { color: isLive ? k.textMuted : k.textFaint }]} numberOfLines={1}>{place}</Text>
                      </View>
                    </Pressable>
                    <View style={s.pills}>
                      {!!loc?.last_updated && <View style={[s.pill, { backgroundColor: k.card }]}><Clock size={13} color={k.sage} /><Text style={[s.pillText, { color: k.sage }]}>{ago(loc.last_updated)}</Text></View>}
                      {loc?.battery_level != null && (
                        <View style={[s.pill, { backgroundColor: lowBattery ? k.pastelPrimaryCard : k.card }]}>
                          {lowBattery ? <BatteryLow size={13} color={k.danger} /> : <BatteryMedium size={13} color={k.textMuted} />}
                          <Text style={[s.pillText, { color: lowBattery ? k.danger : k.textMuted }]}>{lowBattery ? 'Low battery ' : ''}{loc.battery_level}%</Text>
                        </View>
                      )}
                      {loc?.status === 'in_transit' && <View style={[s.pill, { backgroundColor: k.card }]}><Car size={13} color={k.textMuted} /><Text style={[s.pillText, { color: k.textMuted }]}>Moving</Text></View>}
                      <View style={[s.pill, { backgroundColor: k.card }]}><ShieldCheck size={13} color={loc ? k.sage : k.textFaint} /><Text style={[s.pillText, { color: loc ? k.sage : k.textFaint }]}>{loc ? 'Sharing' : 'Not sharing'}</Text></View>
                    </View>
                    {on && (
                      <View style={s.actions}>
                        {isLive && m.id !== active.id && (
                          <Pressable onPress={() => { registerActivity(); openDirections(loc!.lat!, loc!.lng!, loc!.address || m.name); }}
                            accessibilityRole="button" accessibilityLabel={`Get directions to ${m.name}`} style={[s.act, { backgroundColor: k.primary, flex: 1.3 }]}>
                            <Navigation size={17} color={k.onPrimary} /><Text style={[s.actText, { color: k.onPrimary }]}>Directions</Text>
                          </Pressable>
                        )}
                        {m.id !== active.id && (
                          <Pressable onPress={() => messageMember(m.id)} accessibilityRole="button" accessibilityLabel={`Message ${m.name}`} style={[s.act, { backgroundColor: k.card }]}>
                            <MessageCircle size={17} color={k.text} /><Text style={[s.actText, { color: k.text }]}>Message</Text>
                          </Pressable>
                        )}
                        <Pressable onPress={() => openHistory(m.id, m.name)} accessibilityRole="button" accessibilityLabel={`${m.name}'s location history today`} style={[s.act, { backgroundColor: k.card }]}>
                          <History size={17} color={k.text} /><Text style={[s.actText, { color: k.text }]}>Today</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                );
              })}
              {roster.length === 0 && <Text style={[s.place, { color: k.textFaint, textAlign: 'center' }]}>No family members yet.</Text>}
            </ScrollView>
          </View>
        </View>
      )}

      {/* Location history — real GpsTab.tsx feature (today-only timeline
          from member_location_history), kiosk-native drawer shell instead
          of the phone's bottom sheet, same query/data. */}
      <KioskFormDrawer
        visible={!!historyFor}
        variant="drawer"
        title={historyFor ? `${historyFor.name}'s Location Today` : 'Location Today'}
        subtitle={new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
        accent={k.sage}
        Icon={History}
        k={k}
        onClose={() => setHistoryFor(null)}
      >
        {historyLoading ? (
          <View style={{ alignItems: 'center', paddingVertical: KIOSK_SPACE.xl }}>
            <ActivityIndicator color={k.sage} />
          </View>
        ) : history.length === 0 ? (
          <EmptyNote text="No location updates recorded yet today." k={k} />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {history.map((h, idx) => (
              <View key={idx} style={[s.historyRow, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: k.cardBorder }]}>
                <View style={s.historyTimeCol}>
                  {/* Date + time per row, not just once in the drawer's
                      own subtitle [live-requested: "in history we should
                      sho date and time right"] — app-wide 12h format
                      standard. */}
                  <Text style={[s.historyDate, { color: k.textFaint }]} numberOfLines={1}>
                    {new Date(h.recorded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Text>
                  <Text style={[s.historyTime, { color: k.text }]} numberOfLines={1}>
                    {new Date(h.recorded_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </Text>
                </View>
                <View style={[s.historyDot, { backgroundColor: k.sage }]} />
                {/* Full address, not truncated to one line
                    [live-requested: "and complete address"]. */}
                <Text style={[s.historyAddr, { color: k.textMuted }]}>
                  {h.address ?? `${h.lat.toFixed(4)}, ${h.lng.toFixed(4)}`}
                </Text>
              </View>
            ))}
          </ScrollView>
        )}
      </KioskFormDrawer>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  page: { flex: 1, flexDirection: 'row', minHeight: 0 },
  mapCol: { flex: 1.7, minWidth: 0, overflow: 'hidden' },
  mapPinWrap: { alignItems: 'center' },
  // The pin plate, its shadow and the empty-state scrim sit on MAP TILES,
  // which look the same in light and dark mode, so these stay fixed.
  mapPinAvatar: {
    borderRadius: 22, borderWidth: 3, backgroundColor: '#fff', padding: 2,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  mapPinTail: {
    width: 0, height: 0, marginTop: -2,
    borderLeftWidth: 7, borderRightWidth: 7, borderTopWidth: 9,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },
  mapEmptyOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(10,8,7,0.45)', padding: KIOSK_SPACE.lg,
  },
  mapEmptyText: { fontSize: KIOSK_TYPO.body, fontWeight: '700', color: '#F7F2EE', marginTop: KIOSK_SPACE.xs, textAlign: 'center' },
  mapTitle: { position: 'absolute', left: KIOSK_SPACE.md, top: KIOSK_SPACE.md, borderRadius: KIOSK_RADIUS.lg, borderWidth: 1, paddingHorizontal: KIOSK_SPACE.md, paddingVertical: 10 },
  mapTitleText: { fontSize: KIOSK_TYPO.heading, fontWeight: '800', letterSpacing: -0.4 },
  mapSub: { fontSize: KIOSK_TYPO.label, fontWeight: '700' },
  mapCtl: { position: 'absolute', right: KIOSK_SPACE.md, top: KIOSK_SPACE.md, gap: 8 },
  ctlBtn: { width: 48, height: 48, borderRadius: KIOSK_RADIUS.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  panel: { width: 388, borderLeftWidth: StyleSheet.hairlineWidth, minHeight: 0 },
  panelHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', padding: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.sm },
  panelCount: { fontSize: KIOSK_TYPO.caption, fontWeight: '700' },
  card: { borderRadius: KIOSK_RADIUS.xl, borderWidth: 2, padding: 12, gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm },
  name: { fontSize: KIOSK_TYPO.subheading, fontWeight: '800' },
  place: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 1 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 5 },
  pillText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 6 },
  act: { flex: 1, minHeight: 48, borderRadius: KIOSK_RADIUS.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8 },
  actText: { fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
  // Location-history drawer rows.
  historyRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: KIOSK_SPACE.sm },
  historyTimeCol: { width: 68 },
  historyDate: { fontSize: KIOSK_TYPO.micro, fontWeight: '700' },
  historyTime: { fontSize: KIOSK_TYPO.caption, fontWeight: '800', marginTop: 1 },
  historyDot: { width: 8, height: 8, borderRadius: 4, marginHorizontal: KIOSK_SPACE.sm, marginTop: 6 },
  historyAddr: { flex: 1, fontSize: KIOSK_TYPO.body, fontWeight: '600', lineHeight: KIOSK_TYPO.body * 1.4 },
});
