/**
 * PlaceEditorPage — full-page editor for a family place (Home, school, work,
 * other). Parent-only (enforced server-side by upsert_family_place). Pick a
 * kind, name it, search or move the map to set the pin, choose a radius and,
 * for schools/work, who it belongs to. Everything reports inline — no alerts.
 */
import { useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, Keyboard, StyleSheet } from 'react-native';
import MapView, { Circle, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LocateFixed, MapPin, Search, Trash2, Check, AlertTriangle } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { PageHeading } from '@/components/PageHeading';
import FamilyAvatar from '@/components/FamilyAvatar';
import { LocationAutocompleteInput } from '@/components/LocationAutocompleteInput';
import { useFamilyStore } from '@/store/familyStore';
import { usePlacesStore, type FamilyPlace, type PlaceKind } from '@/store/placesStore';
import { hasPlaceGeofencePermission, requestPlaceGeofencePermission } from '@/lib/placeGeofencing';
import { PLACE_KINDS, RADIUS_OPTIONS, placeKindMeta } from './placeKinds';

type Coord = { latitude: number; longitude: number };

export function PlaceEditorPage({ place, initialCenter, defaultKind = 'other', initialKind, onClose }: {
  place?: FamilyPlace | null;
  initialCenter?: Coord;
  defaultKind?: PlaceKind;
  initialKind?: PlaceKind;
  onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { members, activeMemberId } = useFamilyStore();
  const places = usePlacesStore(s => s.places);
  const mapRef = useRef<MapView>(null);

  const DEFAULT_CENTER: Coord = { latitude: 37.7749, longitude: -122.4194 };
  const [kind, setKind] = useState<PlaceKind>(place?.kind ?? initialKind ?? defaultKind);
  const [name, setName] = useState(place?.name ?? '');
  const [addressText, setAddressText] = useState(place?.address ?? '');
  const [coord, setCoord] = useState<Coord>(place ? { latitude: place.latitude, longitude: place.longitude } : (initialCenter ?? DEFAULT_CENTER));
  const [radiusM, setRadiusM] = useState(place?.radiusM ?? 200);
  const [memberIds, setMemberIds] = useState<string[]>(place?.memberIds ?? []);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const canvas = isDark ? '#0E0C13' : '#FFFFFF';
  const meta = placeKindMeta(kind, colors);
  // Use live store (re-fetched on save) so we always know if Home exists
  const existingHome = usePlacesStore(s => s.places.find(p => p.kind === 'home'));
  const fieldBg = isDark ? colors.surface : '#FFFFFF';
  const label = (text: string) => (
    <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: colors.textTertiary, textTransform: 'uppercase', marginTop: 20, marginBottom: 8 }}>{text}</Text>
  );

  const flyTo = (c: Coord, delta = 0.008) => {
    setCoord(c);
    mapRef.current?.animateToRegion({ ...c, latitudeDelta: delta, longitudeDelta: delta }, 450);
  };

  const findAddress = async () => {
    const q = addressText.trim();
    if (!q) return;
    Keyboard.dismiss(); setSearching(true); setNote(null);
    try {
      const res = await Location.geocodeAsync(q);
      if (res.length === 0) setNote({ kind: 'error', text: 'No location found for that address. Try adding the city.' });
      else flyTo({ latitude: res[0].latitude, longitude: res[0].longitude });
    } catch { setNote({ kind: 'error', text: "Couldn't search that address — check your connection." }); }
    setSearching(false);
  };

  const useMyLocation = async () => {
    setNote(null);
    try {
      const fg = await Location.requestForegroundPermissionsAsync();
      if (fg.status !== 'granted') { setNote({ kind: 'error', text: 'Allow location access to use your current position.' }); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      flyTo({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }, 0.004);
    } catch { setNote({ kind: 'error', text: "Couldn't get your current location." }); }
  };

  const toggleMember = (id: string) => setMemberIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const save = async () => {
    if (!activeMemberId || saving) return;
    const finalName = name.trim() || (kind === 'home' ? 'Home' : '');
    if (!finalName) { setNote({ kind: 'error', text: 'Give this place a name, like "Westlake High".' }); return; }
    setSaving(true); setNote(null);
    // Re-fetch places right before save so we always have the latest id —
    // avoids duplicate-key on Home when the store wasn't loaded before opening.
    const fam = useFamilyStore.getState().members.find(m => m.id === activeMemberId)?.familyId;
    if (fam) await usePlacesStore.getState().load(fam, activeMemberId);
    const freshHome = usePlacesStore.getState().places.find(p => p.kind === 'home');
    const res = await usePlacesStore.getState().save(activeMemberId, {
      id: place?.id ?? (kind === 'home' ? (freshHome?.id ?? null) : null),
      kind, name: finalName, address: addressText.trim() || null,
      latitude: coord.latitude, longitude: coord.longitude, radiusM,
      memberIds: kind === 'home' ? [] : memberIds,
    });
    if (!res.ok) { setSaving(false); setNote({ kind: 'error', text: res.error ?? "Couldn't save the place — please try again." }); console.error('[PlaceEditor] save failed:', res.error); return; }
    // Arrival check-ins need background location — ask now, from this user action.
    if (!(await hasPlaceGeofencePermission())) {
      const granted = await requestPlaceGeofencePermission();
      const fam = useFamilyStore.getState().members.find(m => m.id === activeMemberId)?.familyId;
      if (granted && fam) await usePlacesStore.getState().load(fam, activeMemberId);
    }
    setSaving(false);
    onClose();
  };

  const remove = async () => {
    if (!place || !activeMemberId) return;
    setSaving(true);
    const res = await usePlacesStore.getState().remove(activeMemberId, place.id);
    setSaving(false);
    if (!res.ok) { setNote({ kind: 'error', text: res.error ?? "Couldn't remove the place." }); setConfirmRemove(false); return; }
    onClose();
  };

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <View style={{ paddingTop: insets.top + 8, backgroundColor: canvas, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
        <Pressable onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ alignSelf: 'flex-start', paddingHorizontal: 20 }}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.teal }}>← Locations</Text>
        </Pressable>
        <PageHeading
          eyebrow="FAMILY CUBE · PLACES"
          title={place ? 'Edit place' : 'Add a place'}
          subtitle="Your family gets a check-in whenever someone arrives or leaves."
          accent={kind === 'home' ? 'teal' : kind === 'school' ? 'sky' : kind === 'work' ? 'amber' : 'pink'}
          Icon={meta.Icon}
        />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40 }}>
        {label('What kind of place')}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {PLACE_KINDS.map(k => {
            const m = placeKindMeta(k, colors);
            const on = k === kind;
            return (
              <Pressable key={k} onPress={() => { setKind(k); setNote(null); }}
                style={{ flex: 1, height: 78, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 6,
                  backgroundColor: m.bg, borderWidth: 2, borderColor: on ? m.fg : 'transparent', opacity: on ? 1 : 0.7 }}>
                <m.Icon size={24} color={m.fg} strokeWidth={2} />
                <Text style={{ fontSize: 12, fontWeight: on ? '800' : '600', color: m.fg }}>{m.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {kind === 'home' && existingHome && !place && (
          <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 8 }}>
            Your family already has a Home. Saving will move it to this pin.
          </Text>
        )}

        {label('Name')}
        <TextInput value={name} onChangeText={setName} placeholder={meta.namePlaceholder} placeholderTextColor={colors.textTertiary}
          maxLength={60}
          style={{ height: 50, borderRadius: 14, paddingHorizontal: 14, fontSize: 16, color: colors.textPrimary, backgroundColor: fieldBg, borderWidth: 1, borderColor: colors.border }} />

        {label('Address')}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1, borderRadius: 14, paddingHorizontal: 12, minHeight: 50, justifyContent: 'center', backgroundColor: fieldBg, borderWidth: 1, borderColor: colors.border }}>
            <LocationAutocompleteInput value={addressText} onChangeText={t => { setAddressText(t); setNote(null); }}
              placeholder="Search an address or place" colors={colors} style={{ fontSize: 15, color: colors.textPrimary }} />
          </View>
          <Pressable onPress={findAddress} disabled={!addressText.trim() || searching}
            style={{ width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: addressText.trim() ? colors.teal : colors.surface }}>
            {searching ? <ActivityIndicator color="#fff" size="small" /> : <Search size={20} color={addressText.trim() ? '#fff' : colors.textTertiary} />}
          </Pressable>
        </View>

        {label('Pin — move the map')}
        <View style={{ height: 240, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
          <MapView ref={mapRef} provider={PROVIDER_DEFAULT} style={StyleSheet.absoluteFill}
            initialRegion={{ ...coord, latitudeDelta: 0.008, longitudeDelta: 0.008 }}
            showsCompass={false} showsMyLocationButton={false}
            onRegionChangeComplete={r => setCoord({ latitude: r.latitude, longitude: r.longitude })}>
            <Circle center={coord} radius={radiusM} strokeColor={meta.fg} strokeWidth={2} fillColor={meta.fg + '26'} />
          </MapView>
          <View pointerEvents="none" style={{ ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ marginBottom: 34 }}>
              <MapPin size={38} color={meta.fg} fill={meta.fg + '55'} strokeWidth={2.2} />
            </View>
          </View>
          <Pressable onPress={useMyLocation}
            style={{ position: 'absolute', right: 12, top: 12, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
              backgroundColor: isDark ? colors.card : '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 }}>
            <LocateFixed size={20} color={colors.teal} />
          </Pressable>
        </View>

        {label('How close counts as "here"')}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {RADIUS_OPTIONS.map(o => {
            const on = o.m === radiusM;
            return (
              <Pressable key={o.m} onPress={() => setRadiusM(o.m)}
                style={{ flex: 1, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: on ? meta.fg : meta.bg }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: on ? '#FFFFFF' : meta.fg }}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {kind !== 'home' && (
          <>
            {label(kind === 'school' ? 'Who goes here? (optional)' : kind === 'work' ? 'Who works here? (optional)' : 'Who gets checked in? (optional)')}
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 10 }}>
              {memberIds.length === 0 ? 'Leave blank to check in everyone. Tap a person to limit it to them.' : 'Only the people you picked are checked in here. Tap again to remove.'}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {members.map(m => {
                const on = memberIds.includes(m.id);
                return (
                  <Pressable key={m.id} onPress={() => toggleMember(m.id)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingLeft: 6, paddingRight: 14, borderRadius: 100,
                      backgroundColor: on ? meta.bg : fieldBg, borderWidth: 1.5, borderColor: on ? meta.fg : colors.border }}>
                    <FamilyAvatar name={m.name} emoji={m.emoji} avatarUrl={m.avatarUrl} siblings={members.map(x => x.name)} size={28}
                      ringColor={on ? meta.fg : colors.border} ringWidth={0} bgColor={meta.bg} />
                    <Text style={{ fontSize: 14, fontWeight: on ? '700' : '500', color: on ? meta.fg : colors.textPrimary }}>{m.name.split(' ')[0]}</Text>
                    {on && <Check size={14} color={meta.fg} />}
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {note && (
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderRadius: 14, padding: 12, marginTop: 20,
            backgroundColor: note.kind === 'success' ? colors.tealLight : (isDark ? colors.danger + '22' : colors.danger + '14') }}>
            {note.kind === 'success' ? <Check size={16} color={colors.teal} /> : <AlertTriangle size={16} color={colors.danger} />}
            <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: note.kind === 'success' ? colors.teal : colors.danger }}>{note.text}</Text>
          </View>
        )}

        <Pressable onPress={save} disabled={saving}
          style={{ height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 24, backgroundColor: colors.tealLight, borderWidth: 1, borderColor: isDark ? colors.border : 'rgba(61,122,90,0.22)', opacity: saving ? 0.6 : 1 }}>
          {saving ? <ActivityIndicator color={colors.teal} /> : <Text style={{ fontSize: 16, fontWeight: '700', color: colors.teal }}>{place ? 'Save changes' : 'Save place'}</Text>}
        </Pressable>

        {place && !confirmRemove && (
          <Pressable onPress={() => setConfirmRemove(true)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 16 }}>
            <Trash2 size={15} color={colors.danger} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.danger }}>Remove this place</Text>
          </Pressable>
        )}
        {place && confirmRemove && (
          <View style={{ gap: 10, borderRadius: 16, padding: 14, marginTop: 14, backgroundColor: isDark ? colors.danger + '14' : colors.danger + '0D' }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>
              Remove "{place.name}"? Arrive and leave check-ins here will stop.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => setConfirmRemove(false)} style={{ flex: 1, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: fieldBg, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={remove} disabled={saving} style={{ flex: 1, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.danger, opacity: saving ? 0.6 : 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Remove</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
