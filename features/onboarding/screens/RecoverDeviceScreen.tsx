/**
 * RecoverDeviceScreen — re-links a NEW/wiped device to an ALREADY-ACTIVE
 * member's EXISTING profile, via a parent-generated recovery code + that
 * member's own PIN. Distinct from JoinFamilyScreen (first-time join, which
 * creates a fresh anonymous session + a brand-new profile): this screen
 * never creates a new profile or a new auth identity — recover-device
 * re-authenticates the SAME auth.users row the member already had, so
 * coins/xp/streak/history are all untouched.
 */
import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO } from '@/constants/theme';
import { SPACING } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useFamilyStore } from '@/store/familyStore';
import { AnimatedCubeMark } from '@/components/FamilyCubeLogo';
import { showAlert } from '@/components/AppAlert';

export default function RecoverDeviceScreen() {
  const { colors, isDark } = useTheme();
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const setMembers = useFamilyStore(s => s.setMembers);
  const setActiveMem = useFamilyStore(s => s.setActiveMember);

  const s = makeStyles(colors, isDark);

  const handleRecover = async () => {
    if (code.trim().length < 6) { showAlert('Enter your code', 'Recovery codes are at least 6 characters.'); return; }
    if (pin.length < 4) { showAlert('Enter your PIN', 'Enter the same PIN you used before on your old device.'); return; }
    setLoading(true);
    try {
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/recover-device`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ code: code.trim(), pin }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showAlert("Couldn't recover this profile", data.error ?? 'Something went wrong. Please try again.');
        setLoading(false);
        return;
      }

      const { error: sessionErr } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      if (sessionErr) {
        showAlert("Couldn't finish recovery", sessionErr.message);
        setLoading(false);
        return;
      }

      // Same pattern as JoinFamilyScreen's own success path — sync the
      // real family data now that this device has a valid session, then
      // land on the recovered member's own profile.
      await useFamilyStore.getState().syncFromDB();
      setActiveMem(data.memberId);
      router.replace('/(tabs)');
    } catch (e: any) {
      showAlert('Network error', e?.message ?? 'Please check your connection and try again.');
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.logoWrap}>
            <AnimatedCubeMark size={80} />
            <Text style={s.title}>Recover your profile</Text>
            <Text style={s.sub}>
              Lost or wiped your device? Ask the parent who set you up for a recovery code, then enter it with your PIN below.
            </Text>
          </View>

          <View style={{ gap: SPACING.md }}>
            <View>
              <Text style={s.label}>Recovery code</Text>
              <TextInput
                style={s.input}
                value={code}
                onChangeText={t => setCode(t.toUpperCase())}
                placeholder="e.g. FAM4X7Q"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={12}
              />
            </View>
            <View>
              <Text style={s.label}>Your PIN</Text>
              <TextInput
                style={s.input}
                value={pin}
                onChangeText={t => setPin(t.replace(/[^0-9]/g, ''))}
                placeholder="****"
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
              />
            </View>

            <TouchableOpacity
              style={[s.btn, { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1 }]}
              onPress={handleRecover}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Recover my profile</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={s.linkBtn} onPress={() => router.back()}>
              <Text style={s.linkText}>Back</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(colors: any, isDark: boolean) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    scroll: { flexGrow: 1, padding: SPACING.lg, justifyContent: 'center' },
    logoWrap: { alignItems: 'center', marginBottom: SPACING.xl },
    title: { fontSize: TYPO.heading, fontWeight: '800', color: colors.textPrimary, marginTop: SPACING.md, textAlign: 'center' },
    sub: { fontSize: TYPO.caption, color: colors.textSecondary, textAlign: 'center', marginTop: SPACING.xs, lineHeight: 19, paddingHorizontal: SPACING.md },
    label: { fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 },
    input: {
      borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 12, fontSize: TYPO.body,
      color: colors.textPrimary, backgroundColor: colors.card,
    },
    btn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: SPACING.sm },
    btnText: { color: '#fff', fontSize: TYPO.body, fontWeight: '800' },
    linkBtn: { alignItems: 'center', paddingVertical: SPACING.sm },
    linkText: { fontSize: TYPO.caption, color: colors.textSecondary, fontWeight: '600' },
  });
}
