/**
 * SecurityPasscodeScreen — optional onboarding step, shown once right
 * after a parent finishes creating a new family, before entering the app.
 * Sets up the family-wide recovery passcode (lib/deviceRegistry.ts's
 * setUpFamilyRecoveryKey) that protects chat, location, and medical
 * records encryption from permanent loss on a lost/wiped/reinstalled
 * device — see chatCrypto.ts's "Family recovery key" section for the full
 * design. Fully skippable: a family can set this up later from Profile
 * (ProfileSettingsScreen's Security section) instead, and nothing else in
 * onboarding depends on it existing.
 */
import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, SPACING } from '@/constants/theme';
import { AnimatedCubeMark } from '@/components/FamilyCubeLogo';
import { showAlert } from '@/components/AppAlert';
import { setUpFamilyRecoveryKey } from '@/lib/deviceRegistry';

export default function SecurityPasscodeScreen() {
  const { colors, isDark } = useTheme();
  const { familyId, memberId } = useLocalSearchParams<{ familyId: string; memberId: string }>();
  const [passcode, setPasscode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const s = makeStyles(colors, isDark);

  const proceed = () => router.replace('/onboarding/permissions');

  const handleSetUp = async () => {
    if (passcode.length < 6) { showAlert('Make it longer', 'Use at least 6 characters so it’s hard to guess.'); return; }
    if (passcode !== confirm) { showAlert('Passcodes don’t match', 'Enter the same passcode both times.'); return; }
    if (!familyId || !memberId) { proceed(); return; } // params missing — don't block onboarding over it
    setSaving(true);
    const result = await setUpFamilyRecoveryKey(familyId, memberId, passcode);
    setSaving(false);
    if (!result.ok) {
      showAlert("Couldn't set this up right now", result.error + ' — you can try again anytime from Profile.');
      proceed();
      return;
    }
    showAlert(
      'Saved',
      'Share this passcode with the other adults in your family so everyone can recover access if a device is ever lost. You can change it anytime from Profile.',
    );
    proceed();
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.logoWrap}>
            <AnimatedCubeMark size={80} />
            <Text style={s.title}>Protect your family's data</Text>
            <Text style={s.sub}>
              Chat messages, location, and medical records are encrypted on your devices. Set a family
              security passcode so nobody permanently loses access if a phone is ever lost, broken, or
              replaced — anyone with the passcode can recover everything on a new device.
            </Text>
          </View>

          <View style={{ gap: SPACING.md }}>
            <View>
              <Text style={s.label}>Family passcode</Text>
              <TextInput
                style={s.input}
                value={passcode}
                onChangeText={setPasscode}
                placeholder="At least 6 characters"
                placeholderTextColor={colors.textTertiary}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <View>
              <Text style={s.label}>Confirm passcode</Text>
              <TextInput
                style={s.input}
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Enter it again"
                placeholderTextColor={colors.textTertiary}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <Text style={s.hint}>
              Kids, teens, and grandparents don't need their own passcode — a parent shares this same one
              with them if they ever need to recover a lost device.
            </Text>

            <TouchableOpacity
              style={[s.btn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
              onPress={handleSetUp}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? <ActivityIndicator color={colors.textInverse} /> : <Text style={s.btnText}>Set Up Passcode</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={s.linkBtn} onPress={proceed} disabled={saving}>
              <Text style={s.linkText}>Skip for now — I'll do this later from Profile</Text>
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
    hint: { fontSize: TYPO.micro, color: colors.textTertiary, lineHeight: 16, fontStyle: 'italic' },
    btn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: SPACING.sm },
    btnText: { color: colors.textInverse, fontSize: TYPO.body, fontWeight: '800' },
    linkBtn: { alignItems: 'center', paddingVertical: SPACING.sm },
    linkText: { fontSize: TYPO.caption, color: colors.textSecondary, fontWeight: '600' },
  });
}
