/**
 * DataRecoveryScreen — Profile's "Data Recovery" section. Lets a parent
 * set up, change, or (on a device that needs it) recover the family
 * security passcode that protects chat/location/medical-records
 * encryption from permanent loss when a device is lost, wiped, or
 * reinstalled. See lib/chatCrypto.ts's "Family recovery key" section for
 * the full design, and lib/deviceRegistry.ts for the setup/change/recover
 * functions this screen calls.
 *
 * Same entry point covers the optional onboarding step
 * (features/onboarding/screens/SecurityPasscodeScreen.tsx) skipped —
 * a family that skipped it, or wants to change/verify it later, lands
 * here from Profile > Security > Data Recovery.
 */
import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import { useFamilyStore } from '@/store/familyStore';
import { showAlert } from '@/components/AppAlert';
import {
  familyHasRecoveryKey, setUpFamilyRecoveryKey,
  changeFamilyRecoveryPasscode, recoverWithFamilyPasscode,
} from '@/lib/deviceRegistry';

type Mode = 'loading' | 'setup' | 'change' | 'recover';

export default function DataRecoveryScreen() {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId } = useFamilyStore();
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const familyId = activeMember?.familyId ?? '';
  const isParent = activeMember?.role === 'parent';

  const [mode, setMode] = useState<Mode>('loading');
  const [hasKey, setHasKey] = useState(false);
  const [current, setCurrent] = useState('');
  const [passcode, setPasscode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!familyId) { setMode('setup'); return; }
    familyHasRecoveryKey(familyId).then(exists => {
      setHasKey(exists);
      setMode(exists ? 'change' : 'setup');
    });
  }, [familyId]);

  const s = styles(colors, isDark);

  const handleSetUp = async () => {
    if (passcode.length < 6) { showAlert('Make it longer', 'Use at least 6 characters so it’s hard to guess.'); return; }
    if (passcode !== confirm) { showAlert('Passcodes don’t match', 'Enter the same passcode both times.'); return; }
    if (!familyId || !activeMemberId) return;
    setSaving(true);
    const result = await setUpFamilyRecoveryKey(familyId, activeMemberId, passcode);
    setSaving(false);
    if (!result.ok) { showAlert("Couldn't set this up", result.error); return; }
    setPasscode(''); setConfirm('');
    setHasKey(true);
    setMode('change');
    showAlert('Saved', 'Share this passcode with the other adults in your family — anyone who has it can recover access on a new device.');
  };

  const handleChange = async () => {
    if (!current) { showAlert('Enter your current passcode', 'You need the current passcode to set a new one.'); return; }
    if (passcode.length < 6) { showAlert('Make it longer', 'Use at least 6 characters so it’s hard to guess.'); return; }
    if (passcode !== confirm) { showAlert('Passcodes don’t match', 'Enter the same passcode both times.'); return; }
    if (!familyId) return;
    setSaving(true);
    const result = await changeFamilyRecoveryPasscode(familyId, current, passcode);
    setSaving(false);
    if (!result.ok) { showAlert("Couldn't change the passcode", result.error); return; }
    setCurrent(''); setPasscode(''); setConfirm('');
    showAlert('Updated', 'The family passcode has been changed. Share the new one with anyone who might need to recover a device.');
  };

  const handleRecover = async () => {
    if (!current) { showAlert('Enter the family passcode', 'Ask a parent for the family security passcode.'); return; }
    if (!familyId || !activeMemberId) return;
    setSaving(true);
    const result = await recoverWithFamilyPasscode(familyId, activeMemberId, current);
    setSaving(false);
    if (!result.ok) { showAlert("Couldn't recover", result.error); return; }
    setCurrent('');
    showAlert('Recovered', 'This device can now access your family’s chat, location, and medical records history.');
  };

  if (mode === 'loading') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Data Recovery</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        <View style={s.infoCard}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
          <Text style={s.infoText}>
            Chat messages, location, and medical records are encrypted on your devices. A family security
            passcode lets anyone with it recover that data on a new device if one is ever lost, broken, or
            replaced — otherwise that history is gone for good on that device.
          </Text>
        </View>

        {hasKey && (
          <View style={s.card}>
            <View style={s.rowBetween}>
              <Text style={s.cardTitle}>Status</Text>
              <View style={s.badge}>
                <Ionicons name="checkmark-circle" size={14} color={colors.success ?? '#3D7A5A'} />
                <Text style={[s.badgeText, { color: colors.success ?? '#3D7A5A' }]}>Set up</Text>
              </View>
            </View>
            <Text style={s.cardSub}>
              Your family has a recovery passcode. Anyone who knows it can recover data on a new device.
            </Text>
          </View>
        )}

        {!hasKey && isParent && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Set up a recovery passcode</Text>
            <Text style={s.cardSub}>
              Kids, teens, and grandparents don't need their own — a parent shares this same passcode with
              them if they ever need to recover a device.
            </Text>
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
            <TextInput
              style={s.input}
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Confirm passcode"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={[s.btn, { opacity: saving ? 0.7 : 1 }]} onPress={handleSetUp} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Set Up Passcode</Text>}
            </TouchableOpacity>
          </View>
        )}

        {!hasKey && !isParent && (
          <View style={s.card}>
            <Text style={s.cardSub}>Ask a parent to set up a family recovery passcode from their own Profile.</Text>
          </View>
        )}

        {hasKey && isParent && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Change passcode</Text>
            <Text style={s.cardSub}>Requires the current passcode. Existing chat, location, and record history is unaffected.</Text>
            <TextInput
              style={s.input}
              value={current}
              onChangeText={setCurrent}
              placeholder="Current passcode"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={s.input}
              value={passcode}
              onChangeText={setPasscode}
              placeholder="New passcode"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={s.input}
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Confirm new passcode"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={[s.btn, { opacity: saving ? 0.7 : 1 }]} onPress={handleChange} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Change Passcode</Text>}
            </TouchableOpacity>
          </View>
        )}

        {hasKey && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Recover this device</Text>
            <Text style={s.cardSub}>
              If this device just got a fresh install, or you're not seeing old chat/location/record history,
              enter the family passcode to recover it.
            </Text>
            <TextInput
              style={s.input}
              value={current}
              onChangeText={setCurrent}
              placeholder="Family passcode"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={[s.btn, { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary, opacity: saving ? 0.7 : 1 }]} onPress={handleRecover} disabled={saving}>
              {saving ? <ActivityIndicator color={colors.primary} /> : <Text style={[s.btnText, { color: colors.primary }]}>Recover This Device</Text>}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function styles(colors: any, isDark: boolean) {
  return {
    safe: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 16, paddingVertical: 12 },
    headerTitle: { fontSize: TYPO.subheading, fontWeight: '800' as const, color: colors.textPrimary },
    infoCard: {
      flexDirection: 'row' as const, gap: 10, padding: 14, borderRadius: RADIUS.md,
      backgroundColor: isDark ? colors.primary + '16' : colors.primary + '10',
      borderWidth: 1, borderColor: colors.primary + '30',
    },
    infoText: { flex: 1, fontSize: TYPO.caption, color: colors.textSecondary, lineHeight: 18 },
    card: { padding: 16, borderRadius: RADIUS.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, gap: 10 },
    cardTitle: { fontSize: TYPO.body, fontWeight: '800' as const, color: colors.textPrimary },
    cardSub: { fontSize: TYPO.caption, color: colors.textSecondary, lineHeight: 18 },
    rowBetween: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
    badge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: (colors.success ?? '#3D7A5A') + '18' },
    badgeText: { fontSize: TYPO.micro, fontWeight: '800' as const },
    input: {
      borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 12, fontSize: TYPO.body,
      color: colors.textPrimary, backgroundColor: colors.surface,
    },
    btn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' as const, backgroundColor: colors.primary, marginTop: 4 },
    btnText: { color: '#fff', fontSize: TYPO.body, fontWeight: '800' as const },
  };
}
