import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Keyboard, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { getLocationAPI } from '@/lib/location';
import { TYPO } from '@/constants/theme';

interface Suggestion { id: string; name: string; address: string }

interface LocationAutocompleteInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  accent?: string;
  colors: any;
  autoDetect?: boolean;
  onLocationDetected?: (text: string, lat: number, lng: number) => void;
  maxLength?: number;
  style?: any;
  onBlur?: () => void;
}

export function LocationAutocompleteInput({
  value,
  onChangeText,
  placeholder = 'Address or place',
  accent,
  colors,
  autoDetect = false,
  onLocationDetected,
  maxLength = 150,
  style,
  onBlur,
}: LocationAutocompleteInputProps) {
  const ac = accent ?? colors.primary;
  const { height: screenH } = useWindowDimensions();

  const [suggestions,     setSuggestions]     = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [detecting,       setDetecting]       = useState(false);
  const [dropUp,          setDropUp]          = useState(false);
  // Once a value is picked/entered, show it as a compact read-only wrapped
  // label instead of a live single-line input — a real street address
  // doesn't fit on one line in a half-width column (e.g. side-by-side
  // Pickup/Drop fields) and previously just scrolled horizontally inside
  // the box, showing only a fragment with no way to read the rest. Tapping
  // the label (or the X-to-clear) goes back to the small editable search
  // box. Starts in edit mode whenever there's no value yet.
  const [editing, setEditing] = useState(!value);

  const acTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userCoords = useRef<{ lat: number; lng: number } | null>(null);
  const kbHeight   = useRef(0);
  const containerRef = useRef<View>(null);

  // Track keyboard height
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => { kbHeight.current = e.endCoordinates.height; });
    const hide = Keyboard.addListener('keyboardDidHide', () => { kbHeight.current = 0; });
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Always grab coords for search bias; also reverse-geocode when autoDetect=true
  useEffect(() => {
    (async () => {
      if (autoDetect) setDetecting(true);
      try {
        const Loc = getLocationAPI();
        if (!Loc) return;
        const { status } = await Loc.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Loc.getCurrentPositionAsync({ accuracy: Loc.Accuracy.Balanced });
        const { latitude: lat, longitude: lng } = loc.coords;
        userCoords.current = { lat, lng };
        if (autoDetect && onLocationDetected) {
          const [place] = await Loc.reverseGeocodeAsync({ latitude: lat, longitude: lng });
          const text = place
            ? [place.streetNumber, place.street, place.city, place.region].filter(Boolean).join(' ')
            : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          onLocationDetected(text, lat, lng);
        }
      } catch { /* ok */ } finally {
        if (autoDetect) setDetecting(false);
      }
    })();
  }, []);

  // Decide whether dropdown should open upward
  const measureDirection = useCallback(() => {
    containerRef.current?.measure((_x, _y, _w, h, _px, py) => {
      const availableBelow = screenH - kbHeight.current - (py + h);
      // Flip up if less than ~200px below the input
      setDropUp(availableBelow < 200);
    });
  }, [screenH]);

  const fetchSuggestions = useCallback((text: string) => {
    if (acTimer.current) clearTimeout(acTimer.current);
    if (text.length < 2) { setSuggestions([]); setShowSuggestions(false); return; }
    measureDirection();
    acTimer.current = setTimeout(async () => {
      try {
        const session = await supabase.auth.getSession();
        const token   = session.data.session?.access_token;
        if (!token) return;
        const base   = process.env.EXPO_PUBLIC_SUPABASE_URL;
        const coords = userCoords.current;
        const locQs  = coords ? `&lat=${coords.lat}&lng=${coords.lng}` : '';
        const url    = `${base}/functions/v1/maps-autocomplete?q=${encodeURIComponent(text)}${locQs}`;
        const res    = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const data   = await res.json();
        const list: Suggestion[] = data.suggestions ?? [];
        setSuggestions(list);
        setShowSuggestions(list.length > 0);
      } catch { /* ignore */ }
    }, 350);
  }, [measureDirection]);

  const pick = useCallback((s: Suggestion) => {
    const text = s.address ? `${s.name}, ${s.address}` : s.name;
    onChangeText(text);
    setSuggestions([]);
    setShowSuggestions(false);
    setEditing(false);
  }, [onChangeText]);

  const clear = useCallback(() => {
    onChangeText('');
    setSuggestions([]);
    setShowSuggestions(false);
    setEditing(true);
  }, [onChangeText]);

  const dropdown = showSuggestions ? (
    <View style={[
      styles.dropdown,
      { backgroundColor: colors.card, borderColor: colors.border },
      dropUp ? styles.dropdownUp : styles.dropdownDown,
    ]}>
      {suggestions.map((s, i) => (
        <TouchableOpacity
          key={s.id}
          onPress={() => pick(s)}
          style={[
            styles.suggestionRow,
            i < suggestions.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
          ]}
        >
          <Ionicons name="location" size={13} color={ac} style={{ marginTop: 1 }} />
          {/* Was numberOfLines={1} on both — fine in a full-width field, but
              this component is often placed in a narrow half-width column
              (e.g. side-by-side Pickup/Drop fields), where a real street
              address truncates to nearly nothing ("2036 Montgom…") with no
              way to read the rest before picking it. Wrap onto 2 lines
              instead of hard-truncating to 1. */}
          <View style={{ flex: 1 }}>
            <Text style={[styles.suggName, { color: colors.textPrimary }]} numberOfLines={2}>{s.name}</Text>
            {!!s.address && (
              <Text style={[styles.suggAddr, { color: colors.textSecondary }]} numberOfLines={2}>{s.address}</Text>
            )}
          </View>
        </TouchableOpacity>
      ))}
    </View>
  ) : null;

  return (
    <View ref={containerRef} style={style} collapsable={false}>
      {/* Dropdown above input */}
      {dropUp && dropdown}

      {editing ? (
        <View style={[
          styles.inputRow,
          { backgroundColor: colors.inputBg, borderColor: showSuggestions ? ac : colors.border },
        ]}>
          {detecting
            ? <Ionicons name="locate-outline" size={17} color={ac} style={{ marginRight: 4 }} />
            : <Ionicons name="location-outline" size={17} color={showSuggestions ? ac : colors.textTertiary} style={{ marginRight: 4 }} />
          }
          <TextInput
            style={[styles.textInput, { color: colors.textPrimary }]}
            placeholder={detecting ? 'Detecting location…' : placeholder}
            placeholderTextColor={colors.placeholder}
            value={value}
            onChangeText={text => { onChangeText(text); fetchSuggestions(text); }}
            onFocus={measureDirection}
            onBlur={() => { setTimeout(() => setShowSuggestions(false), 150); onBlur?.(); }}
            autoCorrect={false}
            returnKeyType="done"
            maxLength={maxLength}
            autoFocus
          />
          {value.length > 0 && (
            <TouchableOpacity onPress={clear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={17} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      ) : (
        // Committed value — read-only wrapped label instead of a live
        // single-line input, so a full street address is actually readable.
        // Tap the text to go back into edit mode; tap the X to clear it
        // entirely (also returns to edit mode, matching the empty-state box).
        <TouchableOpacity
          onPress={() => setEditing(true)}
          style={[styles.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border, alignItems: 'flex-start' }]}
        >
          <Ionicons name="location-outline" size={17} color={colors.textTertiary} style={{ marginRight: 4, marginTop: 2 }} />
          <Text style={[styles.textInput, { color: colors.textPrimary, paddingVertical: 0 }]}>{value}</Text>
          <TouchableOpacity onPress={clear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginTop: 2 }}>
            <Ionicons name="close-circle" size={17} color={colors.textTertiary} />
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {/* Dropdown below input */}
      {!dropUp && dropdown}
    </View>
  );
}

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  textInput:     { flex: 1, fontSize: TYPO.body },
  dropdown: {
    borderRadius: 12, borderWidth: 1, overflow: 'hidden',
  },
  dropdownDown:  { marginTop: 4 },
  dropdownUp:    { marginBottom: 4 },
  suggestionRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingHorizontal: 14, paddingVertical: 11,
  },
  suggName: { fontSize: TYPO.body },
  suggAddr: { fontSize: TYPO.caption, marginTop: 1 },
});
