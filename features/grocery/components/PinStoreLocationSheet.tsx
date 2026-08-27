/**
 * PinStoreLocationSheet — one-time "where is this store?" map picker.
 * Feature-flagged (store_proximity_reminders): once a store has a pinned
 * lat/lng, storeGeofencing.ts registers a geofence there so the family gets
 * a local notification when someone's device is nearby with pending items
 * for that store. Skippable — a store with no pin just never geofences.
 */
import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Modal, ActivityIndicator, StyleSheet, Keyboard } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { LocationAutocompleteInput } from '@/components/LocationAutocompleteInput';

export function PinStoreLocationSheet({ visible, store, onClose, onPin }: {
  visible: boolean;
  store: string;
  onClose: () => void;
  onPin: (lat: number, lng: number) => Promise<void> | void;
}) {
  const { colors } = useTheme();
  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState<{ latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null>(null);
  const [marker, setMarker] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

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
      } catch { /* fall back to no initial region — user can still pan/tap */ }
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

  // Forward-geocode typed text ("123 Main St, Springfield" or just
  // "Walmart Springfield") to coordinates via expo-location — no Places API
  // needed for this (per user: manual pin now, Places lookup later); this
  // resolves a real address/place string the user already knows, it just
  // doesn't do brand-name "nearest Walmart" search the way Places would.
  const searchAddress = async () => {
    if (!searchText.trim()) return;
    Keyboard.dismiss();
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.card, paddingBottom: 24 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: 12, marginBottom: 12 }} />
          <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: colors.textPrimary }}>Pin {store}'s location</Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
              Tap the map to drop a pin. We'll remind whoever's nearby about items still on the list for this store.
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginHorizontal: 20, marginBottom: 12, alignItems: 'flex-start' }}>
            <LocationAutocompleteInput
              value={searchText}
              onChangeText={(t) => { setSearchText(t); setSearchError(null); }}
              placeholder="Search an address"
              colors={colors}
              style={{ flex: 1 }}
            />
            <Pressable onPress={searchAddress} disabled={!searchText.trim() || searching}
              style={{ width: 44, height: 47, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                backgroundColor: (!searchText.trim() || searching) ? colors.textDisabled : colors.primary }}>
              {searching
                ? <ActivityIndicator color={colors.textInverse} size="small" />
                : <Ionicons name="arrow-forward" size={16} color={colors.textInverse} />}
            </Pressable>
          </View>
          {searchError && (
            <Text style={{ fontSize: 12, color: colors.danger, marginHorizontal: 20, marginTop: -6, marginBottom: 10 }}>
              {searchError}
            </Text>
          )}

          <View style={{ height: 260, marginHorizontal: 20, borderRadius: 16, overflow: 'hidden' }}>
            {locating || !region ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : (
              <MapView
                ref={mapRef}
                provider={PROVIDER_DEFAULT}
                style={{ width: '100%', height: '100%' }}
                initialRegion={region}
                onPress={(e) => setMarker(e.nativeEvent.coordinate)}
              >
                {marker && (
                  <Marker
                    coordinate={marker}
                    draggable
                    onDragEnd={(e) => setMarker(e.nativeEvent.coordinate)}
                  />
                )}
              </MapView>
            )}
          </View>

          <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginTop: 16 }}>
            <Pressable onPress={onClose}
              style={{ flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1.5, borderColor: colors.border }}>
              <Text style={{ fontWeight: '700', color: colors.textSecondary }}>Skip</Text>
            </Pressable>
            <Pressable onPress={save} disabled={!marker || saving}
              style={{ flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center',
                backgroundColor: (!marker || saving) ? colors.textDisabled : colors.primary,
                flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
              {saving
                ? <ActivityIndicator color={colors.textInverse} size="small" />
                : <><Ionicons name="location" size={16} color={colors.textInverse} /><Text style={{ fontWeight: '800', color: colors.textInverse }}>Pin It</Text></>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
