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
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Share, Alert } from 'react-native';
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

// Offered exactly once, right after a passcode is successfully set or
// changed — same "shown once at the moment it's created, never re-shown"
// principle the OS itself uses for a newly generated password. The
// passcode is NEVER stored anywhere in plaintext (see chatCrypto.ts's
// recovery-key design) precisely so a lost/stolen device or a database
// breach can't recover the family's chat/location/medical history without
// actually knowing the passcode — this share prompt is the one deliberate,
// user-initiated moment that plaintext ever leaves the device, and only
// because the user themselves chose to share it just now.
function offerToSharePasscode(newPasscode: string) {
  Alert.alert(
    'Share with your family?',
    'Anyone who has this passcode can recover your family’s chat, location, and medical record history on a new device. Share it now with the other parent so it isn’t forgotten — it won’t be shown again after this.',
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Share', onPress: () => {
        Share.share({ message: `Our Family Cube security passcode is: ${newPasscode}\n\nKeep this somewhere safe — anyone with it can recover our family's chat, location, and medical records on a new device.` }).catch(() => {});
      }},
    ],
  );
}

// Multi-family membership — a grandparent belonging to more than one
// family (see familyStore.ts's myFamilies) needs to see AND recover each
// of their OTHER families' passcodes too, not just whichever is currently
// active (the card above already covers the active one). Per the same
// live product decision restricting setup/change to parents, this is
// deliberately VIEW + RECOVER only — no setup/change section, regardless
// of which family. Self-contained (its own status/passcode/saving state)
// so each family's card is fully independent of the others and of the
// active-family card above.
function OtherFamilyRecoveryCard({ family, memberId, colors, s }: {
  family: { id: string; name: string; memberId: string };
  memberId: string;
  colors: any;
  s: ReturnType<typeof styles>;
}) {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [passcode, setPasscode] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    familyHasRecoveryKey(family.id).then(setHasKey);
  }, [family.id]);

  const handleRecover = async () => {
    if (!passcode) { showAlert('Enter the family passcode', `Ask a parent in ${family.name} for their security passcode.`); return; }
    setSaving(true);
    const result = await recoverWithFamilyPasscode(family.id, memberId, passcode);
    setSaving(false);
    if (!result.ok) { showAlert("Couldn't recover", result.error); return; }
    setPasscode('');
    showAlert('Recovered', `This device can now access ${family.name}'s chat, location, and medical records history.`);
  };

  return (
    <View style={s.card}>
      <View style={s.rowBetween}>
        <Text style={s.cardTitle}>{family.name}</Text>
        {hasKey != null && (
          <View style={[s.badge, !hasKey && { backgroundColor: colors.border }]}>
            {hasKey && <Ionicons name="checkmark-circle" size={14} color={colors.success} />}
            <Text style={[s.badgeText, { color: hasKey ? colors.success : colors.textTertiary }]}>
              {hasKey ? 'Set up' : 'Not set up'}
            </Text>
          </View>
        )}
      </View>
      <Text style={s.cardSub}>
        {hasKey
          ? "If this device isn't seeing old history for this family, enter its passcode to recover it."
          : `${family.name} hasn't set up a recovery passcode yet — ask a parent there to set one up from their own device.`}
      </Text>
      {hasKey && (
        <>
          <TextInput
            style={s.input}
            value={passcode}
            onChangeText={setPasscode}
            placeholder={`${family.name} passcode`}
            placeholderTextColor={colors.textTertiary}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={[s.btn, { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary, opacity: saving ? 0.7 : 1 }]} onPress={handleRecover} disabled={saving}>
            {saving ? <ActivityIndicator color={colors.primary} /> : <Text style={[s.btnText, { color: colors.primary }]}>Recover This Device</Text>}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

export default function DataRecoveryScreen() {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, myFamilies, activeFamilyId } = useFamilyStore();
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const familyId = activeMember?.familyId ?? '';
  const isParent = activeMember?.role === 'parent';
  // Multi-family membership — every OTHER family this grandparent belongs
  // to (myFamilies is already scoped to grandparent-role, real-login-only
  // sessions — see familyStore.ts). Excludes whichever family is currently
  // active since that one is already fully covered by the cards above.
  const otherFamilies = myFamilies.filter(f => f.id !== (activeFamilyId ?? familyId));

  const [mode, setMode] = useState<Mode>('loading');
  const [hasKey, setHasKey] = useState(false);
  // "Change passcode" and "Recover this device" render as two SEPARATE
  // cards simultaneously once a key exists — they need their own current-
  // passcode field each. Sharing one `current` state between them meant
  // typing in one card silently populated the other's field too, and
  // submitting either handler could send whichever card's value happened
  // to be typed last, regardless of which button was actually tapped.
  const [currentForChange, setCurrentForChange] = useState('');
  const [currentForRecover, setCurrentForRecover] = useState('');
  const [passcode, setPasscode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  // "Forgot the current passcode entirely" escape hatch — resets are a
  // separate flow from Change (which requires the current passcode to
  // prove you actually know it). Own passcode/confirm fields so switching
  // into reset mode doesn't inherit whatever was half-typed into Change's
  // fields, and vice versa.
  const [resetMode, setResetMode] = useState(false);
  const [resetPasscode, setResetPasscode] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');

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
    const justSet = passcode;
    setPasscode(''); setConfirm('');
    setHasKey(true);
    setMode('change');
    offerToSharePasscode(justSet);
  };

  const handleChange = async () => {
    if (!currentForChange) { showAlert('Enter your current passcode', 'You need the current passcode to set a new one.'); return; }
    if (passcode.length < 6) { showAlert('Make it longer', 'Use at least 6 characters so it’s hard to guess.'); return; }
    if (passcode !== confirm) { showAlert('Passcodes don’t match', 'Enter the same passcode both times.'); return; }
    if (!familyId) return;
    setSaving(true);
    const result = await changeFamilyRecoveryPasscode(familyId, currentForChange, passcode);
    setSaving(false);
    if (!result.ok) { showAlert("Couldn't change the passcode", result.error); return; }
    const justSet = passcode;
    setCurrentForChange(''); setPasscode(''); setConfirm('');
    offerToSharePasscode(justSet);
  };

  // For when nobody remembers the current passcode at all — setUpFamilyRecoveryKey
  // generates a brand-new recovery key pair + passcode from scratch and
  // overwrites the family's existing one (it doesn't require or check the
  // old passcode), so calling it again IS the reset. Confirmed via a
  // native Alert (not the lighter showAlert) specifically because of what
  // it costs: any device that's lost/wiped/never-registered-again from
  // this point forward can only be recovered with the NEW passcode — the
  // old one stops working immediately. Devices currently active and in use
  // are unaffected (their own local keys still work fine); this only
  // resets the RECOVERY path for a future lost device.
  const handleReset = () => {
    if (resetPasscode.length < 6) { showAlert('Make it longer', 'Use at least 6 characters so it’s hard to guess.'); return; }
    if (resetPasscode !== resetConfirm) { showAlert('Passcodes don’t match', 'Enter the same passcode both times.'); return; }
    if (!familyId || !activeMemberId) return;
    Alert.alert(
      'Reset the family passcode?',
      'The old passcode will stop working right away. Any device that\'s currently lost, wiped, or hasn\'t opened the app since this reset will only be recoverable with the NEW passcode — devices in active use today are not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: async () => {
          setSaving(true);
          const result = await setUpFamilyRecoveryKey(familyId, activeMemberId, resetPasscode);
          setSaving(false);
          if (!result.ok) { showAlert("Couldn't reset", result.error); return; }
          const justSet = resetPasscode;
          setResetPasscode(''); setResetConfirm(''); setResetMode(false);
          offerToSharePasscode(justSet);
        }},
      ],
    );
  };

  const handleRecover = async () => {
    if (!currentForRecover) { showAlert('Enter the family passcode', 'Ask a parent for the family security passcode.'); return; }
    if (!familyId || !activeMemberId) return;
    setSaving(true);
    const result = await recoverWithFamilyPasscode(familyId, activeMemberId, currentForRecover);
    setSaving(false);
    if (!result.ok) { showAlert("Couldn't recover", result.error); return; }
    setCurrentForRecover('');
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
                <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                <Text style={[s.badgeText, { color: colors.success }]}>Set up</Text>
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
              {saving ? <ActivityIndicator color={colors.textInverse} /> : <Text style={s.btnText}>Set Up Passcode</Text>}
            </TouchableOpacity>
          </View>
        )}

        {!hasKey && !isParent && (
          <View style={s.card}>
            <Text style={s.cardSub}>Ask a parent to set up a family recovery passcode from their own Profile.</Text>
          </View>
        )}

        {hasKey && isParent && !resetMode && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Change passcode</Text>
            <Text style={s.cardSub}>Requires the current passcode. Existing chat, location, and record history is unaffected.</Text>
            <TextInput
              style={s.input}
              value={currentForChange}
              onChangeText={setCurrentForChange}
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
              {saving ? <ActivityIndicator color={colors.textInverse} /> : <Text style={s.btnText}>Change Passcode</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setCurrentForChange(''); setPasscode(''); setConfirm(''); setResetMode(true); }} style={{ alignSelf: 'center', marginTop: 2 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary, textDecorationLine: 'underline' }}>
                Forgot the current passcode?
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {hasKey && isParent && resetMode && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Reset passcode</Text>
            <Text style={s.cardSub}>
              For when nobody remembers the current passcode. The old one stops working right away — any device
              that's lost, wiped, or hasn't opened the app since this reset can only be recovered with the new
              one. Devices in active use today aren't affected.
            </Text>
            <TextInput
              style={s.input}
              value={resetPasscode}
              onChangeText={setResetPasscode}
              placeholder="New passcode"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={s.input}
              value={resetConfirm}
              onChangeText={setResetConfirm}
              placeholder="Confirm new passcode"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={[s.btn, { backgroundColor: colors.danger, opacity: saving ? 0.7 : 1 }]} onPress={handleReset} disabled={saving}>
              {saving ? <ActivityIndicator color={colors.textInverse} /> : <Text style={s.btnText}>Reset Passcode</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setResetPasscode(''); setResetConfirm(''); setResetMode(false); }} style={{ alignSelf: 'center', marginTop: 2 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary, textDecorationLine: 'underline' }}>
                Actually, I remember it
              </Text>
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
              value={currentForRecover}
              onChangeText={setCurrentForRecover}
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

        {/* Multi-family membership — a grandparent's OTHER families, each
            with their own independent passcode status + recover action.
            View + recover only, no setup/change (see OtherFamilyRecoveryCard's
            own comment) — matches the live product decision that setup/
            change stays parent-only even in this multi-family view. */}
        {otherFamilies.length > 0 && (
          <>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }}>
              Your other families
            </Text>
            {otherFamilies.map(f => (
              <OtherFamilyRecoveryCard key={f.id} family={f} memberId={f.memberId} colors={colors} s={s} />
            ))}
          </>
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
    badge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: colors.success + '18' },
    badgeText: { fontSize: TYPO.micro, fontWeight: '800' as const },
    input: {
      borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 12, fontSize: TYPO.body,
      color: colors.textPrimary, backgroundColor: colors.surface,
    },
    btn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' as const, backgroundColor: colors.primary, marginTop: 4 },
    btnText: { color: colors.textInverse, fontSize: TYPO.body, fontWeight: '800' as const },
  };
}
