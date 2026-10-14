/**
 * SecurityPasscodeScreen — optional onboarding step, shown once right
 * after a parent finishes creating a new family, before entering the app.
 * Generates this family's shared security code (lib/chatCrypto.ts's
 * generateFamilyKeyCode/setActiveFamilyKey) that encrypts chat and medical
 * records on every device. Unlike the old passcode-recovery design, this
 * code is NEVER sent to the server — it lives only in each device's local
 * SecureStore, installed here on the admin's device and then shared
 * out-of-band (text/WhatsApp/etc.) with the rest of the family, who each
 * type it into their own device once. Fully skippable: a family can set
 * this up later from Profile instead, and nothing else in onboarding
 * depends on it existing.
 */
import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, SPACING } from '@/constants/theme';
import { AnimatedCubeMark } from '@/components/FamilyCubeLogo';
import { showAlert } from '@/components/AppAlert';
import { generateFamilyKeyCode, normalizeFamilyKeyCode, setActiveFamilyKey } from '@/lib/chatCrypto';
import { supabase } from '@/lib/supabase';

export default function SecurityPasscodeScreen() {
  const { colors, isDark } = useTheme();
  const { familyId, memberId } = useLocalSearchParams<{ familyId: string; memberId: string }>();
  const [code, setCode] = useState('');
  const [customMode, setCustomMode] = useState(false);
  const [saving, setSaving] = useState(false);

  const s = makeStyles(colors, isDark);

  useEffect(() => {
    setCode(generateFamilyKeyCode());
  }, []);

  const proceed = () => router.replace('/onboarding/permissions');

  const handleShare = () => {
    Share.share({ message: `Family Cube security code for our family: ${code}\n\nEnter this on your device to see our encrypted chat and records.` }).catch(() => {});
  };

  const handleSetUp = async () => {
    let normalized: string;
    try {
      normalized = normalizeFamilyKeyCode(code);
    } catch (e: any) {
      showAlert('Invalid code', e?.message ?? 'Enter a valid 16-character code.');
      return;
    }
    if (!familyId || !memberId) { proceed(); return; } // params missing — don't block onboarding over it
    setSaving(true);
    try {
      await setActiveFamilyKey(familyId, normalized);
      await supabase.from('families').update({ key_generation: 1, key_rotated_at: new Date().toISOString(), key_rotated_by: memberId }).eq('id', familyId);
      showAlert(
        'Saved',
        'Share this code with the other adults in your family so everyone can see encrypted chat and records. You can rotate it anytime from Profile — but there is no way to recover a lost code, so keep it somewhere safe.',
      );
    } catch (e: any) {
      showAlert("Couldn't set this up right now", (e?.message ?? 'Something went wrong') + ' — you can try again anytime from Profile.');
    }
    setSaving(false);
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
              Chat messages and medical records are encrypted with one security code shared by your
              whole family. Nobody but your family — not even us — can read them. There's no way to
              recover a lost code, so share it somewhere safe.
            </Text>
          </View>

          <View style={{ gap: SPACING.md }}>
            <View>
              <Text style={s.label}>{customMode ? 'Enter your own code' : 'Your family security code'}</Text>
              <TextInput
                style={s.codeInput}
                value={code}
                onChangeText={setCode}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={customMode}
              />
            </View>

            {!customMode ? (
              <>
                <TouchableOpacity style={s.secondaryBtn} onPress={handleShare} activeOpacity={0.85}>
                  <Text style={s.secondaryBtnText}>Share with family</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.linkBtn} onPress={() => { setCustomMode(true); setCode(''); }}>
                  <Text style={s.linkText}>Use my own code instead</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={s.linkBtn} onPress={() => { setCustomMode(false); setCode(generateFamilyKeyCode()); }}>
                <Text style={s.linkText}>Generate one for me instead</Text>
              </TouchableOpacity>
            )}

            <Text style={s.hint}>
              Every other family member types this exact code into their own device, once, to unlock
              chat and records. Kids and teens don't need to set anything up themselves.
            </Text>

            <TouchableOpacity
              style={[s.btn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
              onPress={handleSetUp}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? <ActivityIndicator color={colors.textInverse} /> : <Text style={s.btnText}>Set Up This Code</Text>}
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
    codeInput: {
      borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 12, fontSize: TYPO.heading,
      fontWeight: '800', letterSpacing: 2, textAlign: 'center',
      color: colors.textPrimary, backgroundColor: colors.card,
    },
    hint: { fontSize: TYPO.micro, color: colors.textTertiary, lineHeight: 16, fontStyle: 'italic' },
    btn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: SPACING.sm },
    btnText: { color: colors.textInverse, fontSize: TYPO.body, fontWeight: '800' },
    secondaryBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', backgroundColor: colors.surface },
    secondaryBtnText: { color: colors.textPrimary, fontSize: TYPO.body, fontWeight: '700' },
    linkBtn: { alignItems: 'center', paddingVertical: SPACING.sm },
    linkText: { fontSize: TYPO.caption, color: colors.textSecondary, fontWeight: '600' },
  });
}
