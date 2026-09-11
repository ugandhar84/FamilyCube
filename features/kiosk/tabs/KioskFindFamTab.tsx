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
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet, TouchableOpacity, Platform, Linking, Alert, useWindowDimensions } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { MapPin, BatteryLow, BatteryMedium, Navigation, History } from 'lucide-react-native';
import { KIOSK_TYPO, KIOSK_HIT, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import { useKioskColors, kioskRoleAccent } from '../kioskPalette';
import { WidgetCard, WidgetHeader, Well, Chip, TabTitle, EmptyNote } from '../components/KioskOS';
import { KioskFormDrawer } from '../components/KioskFormDrawer';
import { useKioskActivity, useKioskLockSuspended } from '../KioskActivityContext';
import { supabase } from '@/lib/supabase';
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

  return (
    <View style={s.root}>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={k.primary} />
      ) : (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        onScrollBeginDrag={registerActivity}
      >
        <TabTitle
          title="Find Family"
          subtitle="Where everyone is right now, from their own phones"
          k={k}
          right={
            <Chip
              label={`${sharingCount}/${members.length} sharing`}
              accent={sharingCount > 0 ? k.sage : k.textFaint}
              isDark={isDark}
              k={k}
            />
          }
        />

        {/* Real map — same MapView/Marker/avatar-pin rendering GpsTab.tsx
            uses, just laid out full-width above the roster instead of
            behind a draggable sheet, since kiosk has room to show both at
            once rather than trading one for the other. */}
        <WidgetCard k={k} isDark={isDark} padded={false} style={s.mapCard}>
        <View style={[s.mapWrap, { height: mapHeight }]}>
          <MapView
            ref={mapRef}
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
                <Marker key={loc.member_id} coordinate={{ latitude: loc.lat, longitude: loc.lng }}
                  title={m?.name ?? 'Family member'} description={loc.status_text ?? STATUS_LABEL[loc.status]}
                  anchor={{ x: 0.5, y: 1 }}>
                  <View style={s.mapPinWrap}>
                    <View style={[s.mapPinAvatar, { borderColor: rc }]}>
                      <FamilyAvatar name={m?.name ?? ''} emoji={m?.emoji} avatarUrl={m?.avatarUrl}
                        siblings={members.map(mb => mb.name)} ringColor={rc} ringWidth={0} size={40} />
                    </View>
                    <View style={[s.mapPinTail, { borderTopColor: rc }]} />
                  </View>
                </Marker>
              );
            })}
          </MapView>
          {pinned.length === 0 && (
            <View pointerEvents="none" style={s.mapEmptyOverlay}>
              <MapPin size={28} color="#F7F2EE" />
              {/* Fixed light-on-scrim rather than a palette token: this
                  plate sits over map tiles, so its contrast has to come
                  from the scrim beneath it, not from the theme. */}
              <Text style={s.mapEmptyText} numberOfLines={2}>
                No one is sharing their location yet
              </Text>
            </View>
          )}
        </View>
        </WidgetCard>

        <WidgetCard k={k} isDark={isDark}>
          <WidgetHeader
            Icon={MapPin} eyebrow="Roster" title="Family"
            accent={k.sage} k={k} isDark={isDark}
            right={<Chip label={`${members.length}`} accent={k.sage} isDark={isDark} k={k} />}
          />
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
          const isLive = !!(loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng));
          // Layout: row 1 avatar+name, row 2 current location, battery %
          // badge pinned to the card's own top-right corner, a bottom
          // action button (repurposes the real "get directions" action —
          // no separate location-history feature exists anywhere in the
          // app to back a literal history view) [live-requested: "2 row
          // avtar + name / current location / battery % on tthe top right
          // and bottom is history icon"].
          const lowBattery = loc?.battery_level != null && loc.battery_level <= 20;
          return (
            <Well
              key={m.id}
              k={k}
              accent={isLive ? roleColor(m.role ?? 'kid') : undefined}
              style={s.card}
            >
              {loc?.battery_level != null && (
                <View style={[s.batteryBadge, { backgroundColor: lowBattery ? k.dangerSoft : k.well, borderColor: lowBattery ? k.dangerEdge : k.cardBorder }]}>
                  {lowBattery
                    ? <BatteryLow size={11} color={k.danger} />
                    : <BatteryMedium size={11} color={k.textMuted} />}
                  <Text style={[s.batteryBadgeText, { color: lowBattery ? k.danger : k.textMuted }]} numberOfLines={1}>
                    {loc.battery_level}%
                  </Text>
                </View>
              )}

              <View style={s.cardRow1}>
                <KioskAvatar
                  name={m.name}
                  emoji={m.emoji}
                  avatarUrl={m.avatarUrl}
                  siblings={members.filter(x => x.id !== m.id).map(x => x.name)}
                  size={32}
                  bgColor={roleColor(m.role ?? 'kid') + (isDark ? '24' : '1A')}
                  k={k}
                />
                <Text style={[s.name, { color: k.text }]} numberOfLines={1}>{m.name}</Text>
              </View>

              {loc ? (
                <View style={s.metaRow}>
                  <MapPin size={12} color={k.sage} />
                  <Text style={[s.status, { color: k.sage }]} numberOfLines={1}>
                    {loc.neighborhood || loc.status_text || STATUS_LABEL[loc.status] || 'Unknown'}
                  </Text>
                </View>
              ) : (
                <Text style={[s.addr, { color: k.textFaint }]} numberOfLines={1}>Location not shared</Text>
              )}

              {/* Two real, separate actions — History (member_location_
                  history's own today-timeline, same real GpsTab.tsx
                  feature) and Navigation (native-maps directions), not
                  one icon standing in for the other
                  [live-requested: "history we have the location history
                  of each person right.. and provide the location icon to
                  open the maps"]. History works for anyone with at least
                  one location ping today, even one not currently pinned
                  live; Navigation only makes sense with a real live pin. */}
              <View style={s.cardActionsRow}>
                <TouchableOpacity
                  onPress={() => openHistory(m.id, m.name)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={`${m.name}'s location history today`}
                  style={[s.navBtn, { backgroundColor: k.well, borderColor: k.cardBorder }]}>
                  <History size={16} color={k.textMuted} />
                </TouchableOpacity>
                {isLive && (
                  <TouchableOpacity
                    onPress={() => { registerActivity(); openDirections(loc!.lat!, loc!.lng!, loc!.address || m.name); }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Get directions to ${m.name}`}
                    style={[s.navBtn, { backgroundColor: k.sageSoft, borderColor: k.sageEdge }]}>
                    <Navigation size={16} color={k.sage} />
                  </TouchableOpacity>
                )}
              </View>
            </Well>
          );
        })}
        </View>
        {members.length === 0 && (
          <EmptyNote text="No family members yet." k={k} />
        )}
        </WidgetCard>
      </ScrollView>
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

// Rescaled to the kiosk ladder. The roster cards carried 11.5-12px meta
// text — unreadable at the distance this screen is actually consulted
// from ("is anyone on their way home yet?"). Every fixed-width card also
// gains maxWidth:'100%' so a narrow portrait pane reflows instead of
// clipping (the grid already wraps).
const s = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: KIOSK_SPACE.lg, paddingBottom: KIOSK_SPACE.xxl },
  mapCard: { overflow: 'hidden', marginBottom: KIOSK_SPACE.md },
  // The map fills its WidgetCard edge to edge (the card is padded={false}),
  // so the card's own radius does the rounding and this only owns height.
  mapWrap: { overflow: 'hidden' },
  mapPinWrap: { alignItems: 'center' },
  // The pin plate, its shadow and the empty-state scrim below are the one
  // place in this file that stays fixed rather than theme-derived: they sit
  // on MAP TILES, which are the same in light and dark mode, so their
  // contrast has to come from the pin itself. A dark-mode card color here
  // would make pins vanish against the map. Matches GpsTab.tsx's own pins.
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
  mapEmptyText: {
    fontSize: KIOSK_TYPO.body, fontWeight: '700', color: '#F7F2EE',
    marginTop: KIOSK_SPACE.xs, textAlign: 'center',
  },
  // Real 4-per-row grid — was a fixed 300px card width with no share-based
  // sizing, wrapping to whatever count happened to fit rather than a
  // deliberate column count [live-requested: "lets make this ia nice grid
  // of familuy memebrs to fit the ocntenter an dmaller like 4 ppl. in a
  // row"]. Smaller/more compact card to match: less padding, smaller
  // avatar/text, nav button moved below the name row instead of beside it
  // (no room for it inline at this width).
  // 3 per row now (was 4), and a shorter card — smaller vertical padding
  // and inter-row gap [live-requested: "may be resuc the height of the
  // card and make grid limit to 3?"].
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.sm },
  // [live-requested: "dont waste the space on the card"] — tighter
  // padding all round, and cardRow1's own reserved clearance for the
  // battery badge cut down to just what that small badge actually needs.
  // Cut down further [live-reported: "over sized too much blank spaces
  // make it cute and nice"] — a fixed, content-hugging width instead of a
  // percentage share of the row (percentage sizing was forcing every card
  // as wide as the grid's own column math regardless of how little text
  // actually needed that width), a smaller avatar/nav-button footprint,
  // and every inter-row gap trimmed to the minimum that still reads as
  // separate rows rather than a jammed block.
  card: {
    width: 132,
    flexDirection: 'column', alignItems: 'center', gap: 1,
    paddingVertical: 5, paddingHorizontal: 5, position: 'relative',
  },
  // Row 1: avatar + name side by side [live-requested: "2 row avtar +
  // name / current location"].
  cardRow1: { flexDirection: 'row', alignItems: 'center', gap: 5, width: '100%', paddingRight: 20 },
  avatar: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 13 },
  name: { fontSize: KIOSK_TYPO.caption, fontWeight: '800', flexShrink: 1 },
  // Battery %, pinned to the card's own top-right corner
  // [live-requested: "battery % on tthe top right"].
  batteryBadge: {
    position: 'absolute', top: 4, right: 4,
    flexDirection: 'row', alignItems: 'center', gap: 2,
    borderWidth: 1, borderRadius: KIOSK_RADIUS.sm,
    paddingHorizontal: 4, paddingVertical: 1,
  },
  batteryBadgeText: { fontSize: 9, fontWeight: '800' },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 1 },
  status: { fontSize: KIOSK_TYPO.micro, fontWeight: '700' },
  addr: { fontSize: KIOSK_TYPO.micro, fontWeight: '600', marginTop: 1, textAlign: 'center' },
  lowBattery: { fontSize: KIOSK_TYPO.micro, fontWeight: '800' },
  // Bottom action row — History always shows, Navigation only when live.
  cardActionsRow: { flexDirection: 'row', gap: 5, marginTop: 1 },
  navBtn: {
    width: 26, height: 26, borderRadius: 13, marginTop: 1,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  // Location-history drawer rows.
  historyRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: KIOSK_SPACE.sm },
  historyTimeCol: { width: 68 },
  historyDate: { fontSize: KIOSK_TYPO.micro, fontWeight: '700' },
  historyTime: { fontSize: KIOSK_TYPO.caption, fontWeight: '800', marginTop: 1 },
  historyDot: { width: 8, height: 8, borderRadius: 4, marginHorizontal: KIOSK_SPACE.sm, marginTop: 6 },
  historyAddr: { flex: 1, fontSize: KIOSK_TYPO.body, fontWeight: '600', lineHeight: KIOSK_TYPO.body * 1.4 },
});
