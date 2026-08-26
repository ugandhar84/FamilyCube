import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';

function cityName(tz: string): string {
  // "America/New_York" → "New York", "Europe/London" → "London"
  const parts = tz.split('/');
  return (parts[parts.length - 1] ?? tz).replace(/_/g, ' ');
}

function dismissKey(travelTz: string) {
  return `travel_banner_dismissed_${travelTz}`;
}

export default function TravelBanner() {
  const { colors } = useTheme();
  const { user }   = useAuthStore();
  const [homeTz,    setHomeTz]    = useState<string | null>(null);
  const [currentTz, setCurrentTz] = useState<string | null>(null);
  const [visible,   setVisible]   = useState(false);
  const [updating,  setUpdating]  = useState(false);
  const slideY = useState(() => new Animated.Value(-60))[0];

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    (async () => {
      const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

      const { data } = await supabase
        .from('profiles')
        .select('home_timezone, current_timezone')
        .eq('id', user.id)
        .maybeSingle();

      if (cancelled || !data) return;

      const home = data.home_timezone ?? data.current_timezone ?? deviceTz;
      setHomeTz(home);
      setCurrentTz(deviceTz);

      if (home === deviceTz) return;

      const dismissed = await AsyncStorage.getItem(dismissKey(deviceTz));
      if (dismissed === '1') return;

      if (!cancelled) {
        setVisible(true);
        Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 120, friction: 14 }).start();
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id]);

  const dismiss = async () => {
    if (currentTz) await AsyncStorage.setItem(dismissKey(currentTz), '1');
    Animated.timing(slideY, { toValue: -80, duration: 220, useNativeDriver: true }).start(() => setVisible(false));
  };

  const updateReminders = async () => {
    if (!user?.id || !currentTz || updating) return;
    setUpdating(true);
    await supabase
      .from('profiles')
      .update({ home_timezone: currentTz, timezone: currentTz })
      .eq('id', user.id);
    setUpdating(false);
    // Clear dismiss key so banner shows again if they travel again
    if (currentTz) await AsyncStorage.removeItem(dismissKey(currentTz));
    Animated.timing(slideY, { toValue: -80, duration: 220, useNativeDriver: true }).start(() => setVisible(false));
  };

  if (!visible || !homeTz || !currentTz) return null;

  return (
    <Animated.View style={[s.banner, { backgroundColor: colors.card, borderColor: colors.border, transform: [{ translateY: slideY }] }]}>
      <Ionicons name="airplane" size={16} color="#7C5CBF" style={{ marginRight: 8, marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={[s.title, { color: colors.textPrimary }]}>
          Travelling? Reminders are set for {cityName(homeTz)}.
        </Text>
        <View style={s.actions}>
          <TouchableOpacity onPress={updateReminders} disabled={updating} style={[s.btn, { backgroundColor: '#7C5CBF' }]}>
            <Text style={s.btnText}>{updating ? 'Updating…' : `Switch to ${cityName(currentTz)}`}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={dismiss} style={s.dismiss}>
            <Text style={[s.dismissText, { color: colors.textSecondary }]}>Keep {cityName(homeTz)}</Text>
          </TouchableOpacity>
        </View>
      </View>
      <TouchableOpacity onPress={dismiss} hitSlop={12} style={{ padding: 4 }}>
        <Ionicons name="close" size={16} color={colors.textSecondary} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    paddingHorizontal: 14,
    paddingVertical:   10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 100,
  },
  title:       { fontSize: 14, fontWeight: '600', lineHeight: 18, marginBottom: 6 },
  actions:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  btn:         { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  btnText:     { fontSize: 14, fontWeight: '700', color: '#fff' },
  dismiss:     { paddingVertical: 5 },
  dismissText: { fontSize: 14, fontWeight: '500' },
});
