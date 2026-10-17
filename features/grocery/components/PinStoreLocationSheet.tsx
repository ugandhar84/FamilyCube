/**
 * PinStoreLocationSheet — full-page store location manager.
 * Figma: "Pin store location" — search field (active border), map, "Pin this
 * exact branch" detail card, name/address fields, footer note. Manages ALL
 * pinned stores on this one page (no separate list/map screen) — explicit
 * store name + address fields, add-another without closing, and a card per
 * pinned store below the form that loads back into the fields for editing
 * [live-requested: "we should have store name and the address to add then
 * it should show the pin and they can pin like 4 location in the same page
 * also they can edit while clicking the perticular card"].
 */
import { MapPin } from 'lucide-react-native';
import { OverlayHeading } from '@/components/OverlayPage';
import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet, Keyboard, ScrollView } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';
import { LocationAutocompleteInput } from '@/components/LocationAutocompleteInput';

export function PinStoreLocationSheet({ visible, store, pinnedStores, onClose, onPin, onUnpin }: {
  visible: boolean;
  // Initial store to load into the form on open (e.g. "edit this one" from
  // the grocery list's per-store pin icon). Empty string opens a blank form.
  store: string;
  // All currently pinned stores — rendered as cards below the form so every
  // pin is visible/editable on this same page, not a separate screen.
  pinnedStores: Record<string, { lat: number; lng: number; address?: string }>;
  onClose: () => void;
  onPin: (storeName: string, lat: number, lng: number, address?: string) => Promise<void> | void;
  onUnpin: (storeName: string) => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState<{ latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null>(null);
  const [marker, setMarker] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(true);
  const [saving, setSaving] = useState(false);
  const [address, setAddress] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [storeName, setStoreName] = useState('');
  // The store name this form is currently editing, if any — distinct from
  // `storeName` (the live text field) so we can tell "editing Tesco, user is
  // retyping its name" apart from "adding a brand-new store."
  const [editingStore, setEditingStore] = useState('');

  const P = colors.primary;

  const resetForEditing = (name: string) => {
    setStoreName(name);
    setEditingStore(name);
    setSearchError(null);
    const coords = pinnedStores[name];
    // Load the saved address back into the field instead of leaving it
    // blank — previously this field always reset to '' even when editing
    // an existing pin, so re-saving wiped out the only readable address
    // ever stored for that card [live-reported: "it is not showing address
    // on saved pin instead showing the lat lang"].
    setAddress(coords?.address ?? '');
    if (coords) {
      const r = { latitude: coords.lat, longitude: coords.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 };
      setRegion(r);
      setMarker({ latitude: coords.lat, longitude: coords.lng });
      mapRef.current?.animateToRegion(r, 400);
    }
  };

  useEffect(() => {
    if (!visible) return;
    setLocating(true);
    setStoreName(store);
    setEditingStore(store);
    const coords = store ? pinnedStores[store] : undefined;
    setAddress(coords?.address ?? '');
    (async () => {
      try {
        if (coords) {
          const r = { latitude: coords.lat, longitude: coords.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 };
          setRegion(r);
          setMarker({ latitude: coords.lat, longitude: coords.lng });
          setLocating(false);
          return;
        }
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') { setLocating(false); return; }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
        const r = { latitude: pos.coords.latitude, longitude: pos.coords.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 };
        setRegion(r);
        setMarker({ latitude: r.latitude, longitude: r.longitude });
      } catch { /* fall back */ }
      setLocating(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const resolvedStoreName = storeName.trim();
  const otherPinnedEntries = Object.entries(pinnedStores).filter(([name]) => name !== editingStore);

  const save = async () => {
    if (!marker || !resolvedStoreName) return;
    setSaving(true);
    await onPin(resolvedStoreName, marker.latitude, marker.longitude, address.trim() || undefined);
    setSaving(false);
    // Stay on the page so another store can be pinned, per "they can pin
    // like 4 location in the same page" — reset to a blank form instead of
    // closing.
    resetForEditing('');
  };

  const searchAddress = async () => {
    if (!address.trim()) return;
    Keyboard.dismiss();
    setSearching(true);
    setSearchError(null);
    try {
      const results = await Location.geocodeAsync(address.trim());
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

  if (!visible) return null;

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#0E0C13' : '#FFFFFF' }}>

      {/* Header — ReviewInbox pattern */}
      <OverlayHeading eyebrow="FAMILY CUBE · GROCERIES" title="Pin store location" subtitle="Get a reminder when you are near this store." accent="teal" Icon={MapPin} onTitlePress={onClose} topInset={insets.top} />

      <ScrollView keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: insets.bottom + 48 }}>

        {/* Store name field */}
        <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 }}>Store name</Text>
          <TextInput
            value={storeName}
            onChangeText={setStoreName}
            placeholder="e.g. Riverside Tesco"
            placeholderTextColor={colors.textTertiary}
            style={{ fontSize: 15, color: colors.textPrimary, padding: 0 }}
          />
        </View>

        {/* Address field — geocodes to drop/move the pin */}
        <View style={{ borderRadius: 14, borderWidth: 2, borderColor: P, backgroundColor: isDark ? colors.surface : '#FFFFFF',
          padding: 14, gap: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 2 }}>Address</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <LocationAutocompleteInput
                value={address}
                onChangeText={(t) => { setAddress(t); setSearchError(null); }}
                placeholder="e.g. 400 Icy Trl, Celina, TX"
                colors={colors}
                style={{ fontSize: 15, color: colors.textPrimary }}
              />
            </View>
            <Pressable onPress={searchAddress} disabled={!address.trim() || searching}
              style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                backgroundColor: (!address.trim() || searching) ? colors.surface : P }}>
              {searching
                ? <ActivityIndicator color="#FFFFFF" size="small" />
                : <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />}
            </Pressable>
          </View>
        </View>
        {searchError && (
          <Text style={{ fontSize: 12, color: colors.danger, marginTop: -8 }}>{searchError}</Text>
        )}

        {/* Map shows the pin that results from the address/name above */}
        <View style={{ width: '100%', height: 220, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface }}>
          {locating || !region ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={P} />
            </View>
          ) : (
            <MapView ref={mapRef} provider={PROVIDER_DEFAULT}
              style={{ width: '100%', height: '100%' }}
              initialRegion={region}
              onPress={(e) => setMarker(e.nativeEvent.coordinate)}>
              {marker && (
                <Marker coordinate={marker} draggable onDragEnd={(e) => setMarker(e.nativeEvent.coordinate)} />
              )}
            </MapView>
          )}
        </View>
        <Text style={{ fontSize: 12, fontWeight: '500', color: colors.textSecondary, marginTop: -6 }}>
          {marker ? `Pinned at ${marker.latitude.toFixed(4)}, ${marker.longitude.toFixed(4)} · drag the pin to adjust` : 'Tap the map to drop a pin'}
        </Text>

        {/* "Pin this exact branch" detail card */}
        <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
          padding: 20, gap: 10,
          shadowColor: '#172337', shadowOpacity: isDark ? 0 : 0.05, shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 }, elevation: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPrimary }}>Pin this exact branch</Text>
          <View style={{ gap: 3 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary }}>
              {resolvedStoreName || 'Enter a store name above'}
            </Text>
            {marker && (
              <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary }}>
                {address.trim() || `${marker.latitude.toFixed(5)}, ${marker.longitude.toFixed(5)}`}
              </Text>
            )}
          </View>
          <View style={{ borderRadius: 100, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: colors.tealLight, alignSelf: 'flex-start' }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.teal }}>Specific location · not the whole chain</Text>
          </View>
        </View>

        {/* Footer note */}
        <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, lineHeight: 18 }}>
          Pinning shares this branch with your household. Other {resolvedStoreName || 'store'} locations remain separate choices.
        </Text>

        {/* Primary save button */}
        <Pressable onPress={save} disabled={!marker || !resolvedStoreName || saving}
          style={{ borderRadius: 14, paddingVertical: 14, alignItems: 'center',
            backgroundColor: (!marker || !resolvedStoreName || saving) ? colors.surface : P,
            flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          {saving
            ? <ActivityIndicator color="#FFFFFF" size="small" />
            : <><Ionicons name="location" size={18} color="#FFFFFF" /><Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>{editingStore ? 'Save pin' : 'Pin It'}</Text></>}
        </Pressable>

        {editingStore ? (
          <Pressable onPress={() => resetForEditing('')}
            style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, alignItems: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: colors.teal }}>+ Pin a different store</Text>
          </Pressable>
        ) : null}

        {/* All pinned stores — tap a card to load it back into the form above for editing */}
        {otherPinnedEntries.length > 0 && (
          <View style={{ gap: 10, marginTop: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Pinned stores · {otherPinnedEntries.length}
            </Text>
            {otherPinnedEntries.map(([name, coords]) => (
              <Pressable key={name} onPress={() => resetForEditing(name)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
                  backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14 }}>
                <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: colors.primaryLight,
                  alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="location" size={18} color={P} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>{name}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '500', color: colors.textSecondary }} numberOfLines={1}>
                    {coords.address || `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`}
                  </Text>
                </View>
                <Pressable hitSlop={8} onPress={() => onUnpin(name)}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              </Pressable>
            ))}
          </View>
        )}

        {/* Back link */}
        <Pressable onPress={onClose}
          style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, alignItems: 'center' }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.teal }}>Back · keep store selection</Text>
        </Pressable>

      </ScrollView>
    </View>
  );
}
