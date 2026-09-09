/**
 * KioskPinStoreLocationSheet — kiosk-native port of
 * features/grocery/components/PinStoreLocationSheet.tsx: a one-time "where
 * is this store?" map picker. Once pinned, storeGeofencing.ts registers a
 * geofence there so a family member's OWN phone can notify them when
 * they're nearby with pending items for that store — the pin itself is
 * just a {lat, lng} written to groceryStore.ts's real pinStoreLocation
 * action, and whichever device did the pinning has no bearing on which
 * devices later geofence against it. A kiosk pinning "where Costco is"
 * once, from the kitchen wall, is exactly as valid as a phone doing it.
 *
 * Feature-flagged behind the SAME store_proximity_reminders flag the
 * phone checks (currently OFF by default for every platform — this isn't
 * a released feature yet anywhere, so gating kiosk identically means it
 * stays invisible today and appears on both platforms together the moment
 * the flag ships, rather than kiosk shipping ahead of or independent from
 * the phone's own rollout).
 *
 * Kiosk-specific accommodation: most wall-mounted tablets are WiFi-only
 * with no GPS radio, so the initial "center the map on my current
 * position" step is expected to routinely fail here — already a graceful
 * no-op in the real code (falls back to "no initial region, user can
 * still pan/tap" once expo-location's permission or fix comes back
 * empty), not something this port needed to newly handle. The forward-
 * geocode address search is the practical path on a GPS-less kiosk and
 * needs no device location at all.
 *
 * A centered dialog rather than the phone's bottom sheet: the real
 * content (search bar + 260px map + two buttons) is short and fixed, the
 * same "known length" case KioskFormDrawer's own header calls a dialog
 * right for — this isn't a growable list like KioskGroceryItemSheet.
 */
import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { MapPin, ArrowRight } from 'lucide-react-native';
import { useKioskColors } from '../kioskPalette';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { KioskFormDrawer, KioskFieldLabel, kioskInputStyle } from './KioskFormDrawer';
import { LocationAutocompleteInput } from '@/components/LocationAutocompleteInput';

export function KioskPinStoreLocationSheet({ visible, store, onClose, onPin }: {
  visible: boolean;
  store: string;
  onClose: () => void;
  onPin: (lat: number, lng: number) => Promise<void> | void;
}) {
  const { k } = useKioskColors();
  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState<{ latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null>(null);
  const [marker, setMarker] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // LocationAutocompleteInput expects a phone-shaped `colors` theme — a
  // thin field-by-field adapter onto KioskColors' own tokens rather than
  // reimplementing its suggestions/debounce logic kiosk-side. Confirmed
  // by grep that the component only ever reads these 6 fields.
  const phoneColorsShim = {
    border: k.cardBorder, placeholder: k.textFaint, primary: k.primary,
    textPrimary: k.text, textSecondary: k.textMuted, textTertiary: k.textFaint,
  };

  useEffect(() => {
    if (!visible) return;
    setLocating(true);
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') { setLocating(false); return; }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const r = { latitude: pos.coords.latitude, longitude: pos.coords.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 };
        setRegion(r);
        setMarker({ latitude: r.latitude, longitude: r.longitude });
      } catch { /* GPS-less kiosk, or permission denied — fall back to no initial region; search or a direct map tap still works */ }
      setLocating(false);
    })();
  }, [visible]);

  const save = async () => {
    if (!marker) return;
    setSaving(true);
    await onPin(marker.latitude, marker.longitude);
    setSaving(false);
    onClose();
  };

  const searchAddress = async () => {
    if (!searchText.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      const results = await Location.geocodeAsync(searchText.trim());
      if (results.length === 0) {
        setSearchError('No location found for that address.');
      } else {
        const { latitude, longitude } = results[0];
        const r = { latitude, longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 };
        setRegion(r);
        setMarker({ latitude, longitude });
        mapRef.current?.animateToRegion(r, 500);
      }
    } catch {
      setSearchError('Could not search that address.');
    }
    setSearching(false);
  };

  return (
    <KioskFormDrawer
      visible={visible}
      variant="drawer"
      title={`Pin ${store}'s Location`}
      subtitle="Tap the map to drop a pin, or search an address"
      accent={k.primary}
      Icon={MapPin}
      k={k}
      onClose={onClose}
      onSubmit={save}
      canSubmit={!!marker}
      submitting={saving}
      submitLabel="Pin It"
      footerNote="Whoever's nearby will be reminded about items still on the list for this store."
    >
      <View style={s.section}>
        <KioskFieldLabel k={k}>SEARCH AN ADDRESS</KioskFieldLabel>
        <View style={s.searchRow}>
          <LocationAutocompleteInput
            value={searchText}
            onChangeText={(t: string) => { setSearchText(t); setSearchError(null); }}
            placeholder="Search an address"
            colors={phoneColorsShim}
            style={{ flex: 1 }}
          />
          <Pressable
            onPress={searchAddress}
            disabled={!searchText.trim() || searching}
            style={[
              s.searchBtn,
              { backgroundColor: (!searchText.trim() || searching) ? k.well : k.primary },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Search address"
          >
            {searching
              ? <ActivityIndicator color={k.onAccent} size="small" />
              : <ArrowRight size={16} color={(!searchText.trim()) ? k.textFaint : k.onAccent} />}
          </Pressable>
        </View>
        {!!searchError && (
          <Text style={[s.searchError, { color: k.danger }]}>{searchError}</Text>
        )}
      </View>

      <View style={[s.mapBox, { backgroundColor: k.well }]}>
        {locating || !region ? (
          <View style={s.mapLoading}>
            <ActivityIndicator color={k.primary} />
          </View>
        ) : (
          <MapView
            ref={mapRef}
            provider={PROVIDER_DEFAULT}
            style={StyleSheet.absoluteFill}
            initialRegion={region}
            onPress={e => setMarker(e.nativeEvent.coordinate)}
          >
            {marker && (
              <Marker
                coordinate={marker}
                draggable
                onDragEnd={e => setMarker(e.nativeEvent.coordinate)}
              />
            )}
          </MapView>
        )}
      </View>
    </KioskFormDrawer>
  );
}

const s = StyleSheet.create({
  section: { gap: KIOSK_SPACE.sm },
  searchRow: { flexDirection: 'row', gap: KIOSK_SPACE.sm, alignItems: 'flex-start' },
  searchBtn: {
    width: KIOSK_HIT.control, height: KIOSK_HIT.control, borderRadius: KIOSK_RADIUS.md,
    alignItems: 'center', justifyContent: 'center',
  },
  searchError: { fontSize: KIOSK_TYPO.caption, fontWeight: '600' },
  mapBox: { height: 260, borderRadius: KIOSK_RADIUS.lg, overflow: 'hidden', marginTop: KIOSK_SPACE.sm },
  mapLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
