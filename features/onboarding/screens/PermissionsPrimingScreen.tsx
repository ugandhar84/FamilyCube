/**
 * PermissionsPrimingScreen — one-time, one-screen explanation of every OS
 * permission Family Cube will ever ask for (camera/photos, location, mic),
 * shown once at the end of onboarding, BEFORE the real OS prompts fire.
 *
 * Previously every permission was requested cold, contextually, the first
 * moment a feature needed it (e.g. FindFam asking for location the instant
 * you open the GPS tab) — no upfront explanation of what's coming or why,
 * so the OS's own terse system copy was the only context a brand-new
 * member ever got (live-requested: "ask for the media access and the
 * location access, mic access right, with explaining how we are going to
 * use"). This screen doesn't replace those contextual requests — each
 * feature still calls its own request*PermissionsAsync() the first time
 * it's actually used, since a permission granted here can still need a
 * fresh in-context prompt later depending on OS version/settings changes.
 * It exists purely to prime the user with real context up front, using
 * "Continue" as the moment to fire all three real system prompts in
 * sequence while that context is fresh.
 *
 * Fully skippable — declining here doesn't block onboarding; the same
 * contextual re-prompt still happens later wherever that feature is used.
 */
import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { AudioModule } from 'expo-audio';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO } from '@/constants/theme';

type PermKey = 'media' | 'location' | 'mic';

const PERMISSIONS: { key: PermKey; icon: keyof typeof Ionicons.glyphMap; title: string; reason: string }[] = [
  {
    key: 'media', icon: 'images-outline', title: 'Photos & Camera',
    reason: 'For profile pictures, chore-completion proof photos, and posting family memories.',
  },
  {
    key: 'location', icon: 'location-outline', title: 'Location',
    reason: "For FindFam's family map, safe-zone arrival alerts, and store-proximity grocery reminders — only shared with your own family.",
  },
  {
    key: 'mic', icon: 'mic-outline', title: 'Microphone',
    reason: 'For voice notes and voice-to-text in Chat.',
  },
];

export default function PermissionsPrimingScreen() {
  const { colors, isDark } = useTheme();
  const [requesting, setRequesting] = useState(false);
  const [granted, setGranted] = useState<Partial<Record<PermKey, boolean>>>({});

  const requestAll = async () => {
    setRequesting(true);
    // Sequential, not parallel — iOS shows these as separate native
    // dialogs and stacking simultaneous requests is undefined behavior
    // (only one native permission alert can be on screen at a time).
    try {
      const media = await ImagePicker.requestMediaLibraryPermissionsAsync();
      setGranted(g => ({ ...g, media: media.status === 'granted' }));
    } catch { /* best-effort — a denied/failed request isn't fatal here */ }
    try {
      const location = await Location.requestForegroundPermissionsAsync();
      setGranted(g => ({ ...g, location: location.status === 'granted' }));
    } catch { /* best-effort */ }
    try {
      const mic = await AudioModule.requestRecordingPermissionsAsync();
      setGranted(g => ({ ...g, mic: !!mic?.granted }));
    } catch { /* best-effort */ }
    setRequesting(false);
    router.replace('/onboarding/complete-profile');
  };

  const skip = () => router.replace('/onboarding/complete-profile');

  const s = makeStyles(colors, isDark);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <View style={[s.headerIcon, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="shield-checkmark-outline" size={26} color={colors.primary} />
        </View>
        <Text style={s.title}>A few things we'll ask for</Text>
        <Text style={s.sub}>Your device will show the real permission prompts next — here's what each one is for.</Text>
      </View>

      <View style={s.list}>
        {PERMISSIONS.map(p => (
          <View key={p.key} style={s.row}>
            <View style={[s.iconChip, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name={p.icon} size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>{p.title}</Text>
              <Text style={s.rowReason}>{p.reason}</Text>
            </View>
            {granted[p.key] !== undefined && (
              <Ionicons
                name={granted[p.key] ? 'checkmark-circle' : 'close-circle'}
                size={20}
                color={granted[p.key] ? colors.success : colors.textTertiary}
              />
            )}
          </View>
        ))}
      </View>

      <Text style={s.footnote}>
        You can change any of these later in Settings — nothing here is required to use Family Cube.
      </Text>

      <View style={s.actions}>
        <TouchableOpacity style={[s.btn, { backgroundColor: colors.primary }]} onPress={requestAll} disabled={requesting}>
          {requesting ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>Continue</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={s.skipBtn} onPress={skip} disabled={requesting}>
          <Text style={[s.skipTxt, { color: colors.textSecondary }]}>Not now</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(colors: any, isDark: boolean) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 24 },
    header: { alignItems: 'center', marginTop: 32, marginBottom: 28, gap: 8 },
    headerIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    title: { fontSize: TYPO.title, fontWeight: '800', color: colors.textPrimary, textAlign: 'center', letterSpacing: -0.3 },
    sub: { fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: 8 },
    list: { gap: 14 },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 16,
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    iconChip: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    rowTitle: { fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, marginBottom: 3 },
    rowReason: { fontSize: TYPO.caption, color: colors.textSecondary, lineHeight: 17 },
    footnote: { fontSize: TYPO.caption, color: colors.textTertiary, textAlign: 'center', marginTop: 22, lineHeight: 17 },
    actions: { marginTop: 'auto', marginBottom: 24, gap: 10 },
    btn: { borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
    btnTxt: { fontSize: TYPO.subheading, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },
    skipBtn: { paddingVertical: 10, alignItems: 'center' },
    skipTxt: { fontSize: TYPO.body, fontWeight: '600' },
  });
}
