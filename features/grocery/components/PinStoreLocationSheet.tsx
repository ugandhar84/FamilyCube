/**
 * PinStoreLocationSheet — full-page store location picker.
 * Figma: "Pin store location" — search field (active border), map grid previews,
 * "Pin this exact branch" detail card, nickname field, footer note.
 */
import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet, Keyboard, ScrollView } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';
import { LocationAutocompleteInput } from '@/components/LocationAutocompleteInput';

export function PinStoreLocationSheet({ visible, store, onClose, onPin }: {
  visible: boolean;
  store: string;
  onClose: () => void;
  onPin: (lat: number, lng: number) => Promise<void> | void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState<{ latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null>(null);
  const [marker, setMarker] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [nickname, setNickname] = useState('');

  const P = colors.primary;

  useEffect(() => {
    if (!visible) return;
    setLocating(true);
    setNickname('');
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') { setLocating(false); return; }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
        const r = { latitude: pos.coords.latitude, longitude: pos.coords.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 };
        setRegion(r);
        setMarker({ latitude: r.latitude, longitude: r.longitude });
      } catch { /* fall back */ }
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

  if (!visible) return null;

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#0E0C13' : '#FFFFFF' }}>

      {/* Header — ReviewInbox pattern */}
      <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 16,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: isDark ? colors.border : 'rgba(223,97,60,0.08)',
        backgroundColor: isDark ? '#0E0C13' : '#FFFFFF', gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: colors.textSecondary }}>GROCERIES</Text>
        </View>
        <View style={{ gap: 4 }}>
          <Pressable onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: P }}>← Groceries</Text>
          </Pressable>
          <Text style={{ fontSize: 29, fontWeight: '700', lineHeight: 41, letterSpacing: -0.5, color: colors.textPrimary }}>
            Pin store location
          </Text>
        </View>
      </View>

      <ScrollView keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: insets.bottom + 48 }}>

        {/* Figma: search field with active blue border */}
        <View style={{ borderRadius: 14, borderWidth: 2, borderColor: P, backgroundColor: isDark ? colors.surface : '#FFFFFF',
          padding: 14, gap: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 2 }}>Find a store or address</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <LocationAutocompleteInput
                value={searchText}
                onChangeText={(t) => { setSearchText(t); setSearchError(null); }}
                placeholder={store || 'e.g. Tesco Riverside'}
                colors={colors}
                style={{ fontSize: 15, color: colors.textPrimary }}
              />
            </View>
            <Pressable onPress={searchAddress} disabled={!searchText.trim() || searching}
              style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                backgroundColor: (!searchText.trim() || searching) ? colors.surface : P }}>
              {searching
                ? <ActivityIndicator color="#FFFFFF" size="small" />
                : <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />}
            </Pressable>
          </View>
        </View>
        {searchError && (
          <Text style={{ fontSize: 12, color: colors.danger, marginTop: -8 }}>{searchError}</Text>
        )}

        {/* Figma: 2×2 map grid */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {/* Main map */}
          <View style={{ width: '48%', aspectRatio: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface }}>
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
          {/* Store name pin preview */}
          <View style={{ width: '48%', aspectRatio: 1, borderRadius: 14, backgroundColor: colors.surface,
            alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: P, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="location" size={20} color="#FFFFFF" />
            </View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: P, textAlign: 'center', paddingHorizontal: 8 }}>
              {store || 'Store'} · {marker ? 'Pinned' : 'Tap map'}
            </Text>
          </View>
          {/* Street label placeholder */}
          <View style={{ width: '48%', aspectRatio: 1, borderRadius: 14, backgroundColor: colors.surface, padding: 14, justifyContent: 'flex-end' }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary }}>
              {marker ? `${marker.latitude.toFixed(4)}, ${marker.longitude.toFixed(4)}` : 'No location yet'}
            </Text>
            <View style={{ height: 2, backgroundColor: P, marginTop: 4, width: '60%' }} />
            <Text style={{ fontSize: 11, fontWeight: '500', color: colors.textTertiary, marginTop: 6 }}>
              Schematic · illustrative location
            </Text>
          </View>
          {/* Empty placeholder */}
          <View style={{ width: '48%', aspectRatio: 1, borderRadius: 14, backgroundColor: colors.surface }} />
        </View>

        {/* Figma: "Pin this exact branch" detail card */}
        <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
          padding: 20, gap: 10,
          shadowColor: '#172337', shadowOpacity: isDark ? 0 : 0.05, shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 }, elevation: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPrimary }}>Pin this exact branch</Text>
          <View style={{ gap: 3 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary }}>{store || 'Store'}</Text>
            {marker && (
              <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary }}>
                {`${marker.latitude.toFixed(5)}, ${marker.longitude.toFixed(5)}`}
              </Text>
            )}
          </View>
          <View style={{ borderRadius: 100, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: colors.tealLight, alignSelf: 'flex-start' }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.teal }}>Specific location · not the whole chain</Text>
          </View>
        </View>

        {/* Figma: household nickname field */}
        <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 }}>Household store nickname</Text>
          <Text style={{ fontSize: 15, color: nickname ? colors.textPrimary : colors.textTertiary }}>
            {nickname || store || 'e.g. Riverside Tesco'}
          </Text>
        </View>

        {/* Figma: footer note */}
        <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, lineHeight: 18 }}>
          Pinning shares this branch with your household. Other {store || 'store'} locations remain separate choices.
        </Text>

        {/* Figma: "Back · keep store selection" link card */}
        <Pressable onPress={onClose}
          style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, alignItems: 'center' }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.teal }}>Back · keep store selection</Text>
        </Pressable>

        {/* Primary save button */}
        <Pressable onPress={save} disabled={!marker || saving}
          style={{ borderRadius: 14, paddingVertical: 14, alignItems: 'center',
            backgroundColor: (!marker || saving) ? colors.surface : P,
            flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          {saving
            ? <ActivityIndicator color="#FFFFFF" size="small" />
            : <><Ionicons name="location" size={18} color="#FFFFFF" /><Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>Pin It</Text></>}
        </Pressable>

      </ScrollView>
    </View>
  );
}
