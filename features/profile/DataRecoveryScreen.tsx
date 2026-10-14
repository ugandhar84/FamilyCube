/**
 * DataRecoveryScreen — Profile's "Data Recovery" section. Manages the
 * family's shared security code that encrypts chat and medical records
 * (lib/chatCrypto.ts's shared-key section, lib/familyKeyRotation.ts for
 * rotation). The code itself is NEVER sent to the server — only a
 * non-secret rotation generation counter + who/when ever reach Supabase
 * (families.key_generation/key_rotated_at/key_rotated_by). There is no
 * "forgot the code" recovery flow by design: if every copy of a code is
 * lost, content encrypted under it is permanently unreadable on a device
 * that never had it. This screen lets a parent rotate to a new code
 * (rate-limited to once per 30 days) and lets any device — new or behind —
 * enter the current code, plus any older codes still known, to unlock as
 * much history as possible.
 *
 * Same entry point covers the optional onboarding step
 * (features/onboarding/screens/SecurityPasscodeScreen.tsx) skipped — a
 * family that skipped it, or wants to rotate/enter it later, lands here
 * from Profile > Security > Data Recovery.
 */
import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Share, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import { useFamilyStore } from '@/store/familyStore';
import { supabase } from '@/lib/supabase';
import { fmtDateTime } from '@/lib/dates';
import { showAlert } from '@/components/AppAlert';
import {
  generateFamilyKeyCode, normalizeFamilyKeyCode,
  getActiveFamilyKey, setActiveFamilyKey, addPreviousFamilyKeyFromCode,
} from '@/lib/chatCrypto';
import { rotateFamilyKey, RotationTooSoonError, isFamilyKeyStale, ROTATION_COOLDOWN_DAYS } from '@/lib/familyKeyRotation';

type Mode = 'loading' | 'setup' | 'manage';

function yieldToUI(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

function offerToShareCode(code: string) {
  Alert.alert(
    'Share with your family?',
    'Anyone who has this code can see your family’s encrypted chat and medical records on their own device. Share it now with the other adults so it isn’t forgotten — it won’t be shown again after this.',
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Share', onPress: () => {
        Share.share({ message: `Our Family Cube security code is: ${code}\n\nEnter this on your device to see our encrypted chat and medical records.` }).catch(() => {});
      }},
    ],
  );
}

export default function DataRecoveryScreen({ hideChrome = false }: {
  /** Kiosk-only — suppresses this screen's own SafeAreaView/back-header
   * chrome so it can be mounted as the body of a KioskFormDrawer side
   * sheet instead of a pushed full-screen route. */
  hideChrome?: boolean;
} = {}) {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId } = useFamilyStore();
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const familyId = activeMember?.familyId ?? '';
  const isParent = activeMember?.role === 'parent';
  const managingParentNames = members.filter(m => m.role === 'parent').map(m => m.name);

  const [mode, setMode] = useState<Mode>('loading');
  const [hasKey, setHasKey] = useState(false);
  const [stale, setStale] = useState(false);

  // Setup (no key on this device yet)
  const [setupCode, setSetupCode] = useState('');
  const [customMode, setCustomMode] = useState(false);
  const [saving, setSaving] = useState(false);

  // Enter code (new/behind device already has the family's key generation)
  const [entryCode, setEntryCode] = useState('');
  const [olderCode, setOlderCode] = useState('');
  const [showOlderField, setShowOlderField] = useState(false);
  const [savingEntry, setSavingEntry] = useState(false);
  const [savingOlder, setSavingOlder] = useState(false);

  // Rotate (parent-only)
  const [rotateMode, setRotateMode] = useState(false);
  const [rotateCode, setRotateCode] = useState('');
  const [rotating, setRotating] = useState(false);
  const [rotateBlockedUntil, setRotateBlockedUntil] = useState<Date | null>(null);

  const [keyGeneration, setKeyGeneration] = useState<number | null>(null);
  const [rotatedByMemberId, setRotatedByMemberId] = useState<string | null>(null);
  const [rotatedAt, setRotatedAt] = useState<string | null>(null);
  const rotatedByName = members.find(m => m.id === rotatedByMemberId)?.name ?? null;

  const s = styles(colors, isDark);

  const refreshFamilyMeta = async (fid: string) => {
    const { data } = await supabase.from('families').select('key_generation, key_rotated_at, key_rotated_by').eq('id', fid).maybeSingle();
    setKeyGeneration(data?.key_generation ?? 0);
    setRotatedByMemberId(data?.key_rotated_by ?? null);
    setRotatedAt(data?.key_rotated_at ?? null);
  };

  useEffect(() => {
    if (!familyId) { setMode('setup'); return; }
    (async () => {
      const [key, isStale] = await Promise.all([getActiveFamilyKey(familyId), isFamilyKeyStale(familyId)]);
      setHasKey(!!key);
      setStale(isStale);
      setMode(key ? 'manage' : 'setup');
      setSetupCode(generateFamilyKeyCode());
      await refreshFamilyMeta(familyId);
    })();
  }, [familyId]);

  const handleShareSetup = () => {
    Share.share({ message: `Family Cube security code for our family: ${setupCode}\n\nEnter this on your device to see our encrypted chat and medical records.` }).catch(() => {});
  };

  const handleSetUp = async () => {
    let normalized: string;
    try {
      normalized = normalizeFamilyKeyCode(setupCode);
    } catch (e: any) {
      showAlert('Invalid code', e?.message ?? 'Enter a valid 16-character code.');
      return;
    }
    if (!familyId || !activeMemberId) return;
    setSaving(true);
    await yieldToUI();
    try {
      await setActiveFamilyKey(familyId, normalized);
      await supabase.from('families').update({
        key_generation: 1, key_rotated_at: new Date().toISOString(), key_rotated_by: activeMemberId,
      }).eq('id', familyId);
      const justSet = normalized;
      setHasKey(true);
      setStale(false);
      setMode('manage');
      await refreshFamilyMeta(familyId);
      offerToShareCode(justSet);
    } catch (e: any) {
      showAlert("Couldn't set this up", e?.message ?? 'Something went wrong. Try again.');
    }
    setSaving(false);
  };

  const handleEnterCode = async () => {
    let normalized: string;
    try {
      normalized = normalizeFamilyKeyCode(entryCode);
    } catch (e: any) {
      showAlert('Invalid code', e?.message ?? 'Enter a valid 16-character code.');
      return;
    }
    if (!familyId) return;
    setSavingEntry(true);
    await yieldToUI();
    try {
      await setActiveFamilyKey(familyId, normalized);
      setEntryCode('');
      setHasKey(true);
      setStale(false);
      setMode('manage');
      await refreshFamilyMeta(familyId);
      // Re-decrypt anything already loaded in memory with the newly-entered key.
      try {
        const { useChatStore } = await import('@/store/chatStore');
        const openChannelIds = Object.keys(useChatStore.getState().channels);
        await Promise.all(openChannelIds.map(id => useChatStore.getState().loadChannel(id)));
      } catch (e) {
        console.warn('[DataRecoveryScreen] chat re-decrypt after key entry failed:', e);
      }
      showAlert('Saved', 'This device can now see your family’s encrypted chat and medical records.');
    } catch (e: any) {
      showAlert("Couldn't save this code", e?.message ?? 'Something went wrong. Try again.');
    }
    setSavingEntry(false);
  };

  const handleAddOlderCode = async () => {
    let normalized: string;
    try {
      normalized = normalizeFamilyKeyCode(olderCode);
    } catch (e: any) {
      showAlert('Invalid code', e?.message ?? 'Enter a valid 16-character code.');
      return;
    }
    if (!familyId) return;
    setSavingOlder(true);
    await yieldToUI();
    try {
      await addPreviousFamilyKeyFromCode(familyId, normalized);
      setOlderCode('');
      setShowOlderField(false);
      try {
        const { useChatStore } = await import('@/store/chatStore');
        const openChannelIds = Object.keys(useChatStore.getState().channels);
        await Promise.all(openChannelIds.map(id => useChatStore.getState().loadChannel(id)));
      } catch (e) {
        console.warn('[DataRecoveryScreen] chat re-decrypt after older-code entry failed:', e);
      }
      showAlert('Added', 'This device will now try that code too when it can’t read older history.');
    } catch (e: any) {
      showAlert("Couldn't save this code", e?.message ?? 'Something went wrong. Try again.');
    }
    setSavingOlder(false);
  };

  const handleRotate = async () => {
    let normalized: string;
    try {
      normalized = normalizeFamilyKeyCode(rotateCode);
    } catch (e: any) {
      showAlert('Invalid code', e?.message ?? 'Enter a valid 16-character code.');
      return;
    }
    if (!familyId || !activeMemberId) return;
    Alert.alert(
      'Rotate the family security code?',
      'Every other device will be blocked from chat and medical records until someone enters the new code there. This device will re-encrypt your family’s existing history in the background — don’t force-quit the app until that finishes. If anyone loses the old code afterward, anything encrypted under it stays unreadable on a device that never had it.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Rotate', style: 'destructive', onPress: async () => {
          setRotating(true);
          await yieldToUI();
          try {
            await rotateFamilyKey(familyId, normalized, activeMemberId);
            setRotateCode('');
            setRotateMode(false);
            setStale(false);
            await refreshFamilyMeta(familyId);
            offerToShareCode(normalized);
            showAlert('Rotating', 'The new code is active on this device. Existing history is being re-encrypted in the background — share the new code with the rest of your family now.');
          } catch (e: any) {
            if (e instanceof RotationTooSoonError) {
              setRotateBlockedUntil(e.nextEligibleDate);
              showAlert('Too soon', `You can rotate again on ${fmtDateTime(e.nextEligibleDate.toISOString())}.`);
            } else {
              showAlert("Couldn't rotate", e?.message ?? 'Something went wrong. Try again.');
            }
          }
          setRotating(false);
        }},
      ],
    );
  };

  if (mode === 'loading') {
    const loadingBody = (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
    return hideChrome ? loadingBody : <SafeAreaView style={s.safe}>{loadingBody}</SafeAreaView>;
  }

  const body = (
    <>
      {!hideChrome && (
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Data Recovery</Text>
          <View style={{ width: 24 }} />
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        <View style={s.infoCard}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
          <Text style={s.infoText}>
            Chat messages and medical records are encrypted with one security code shared by your whole
            family. The code lives only on your devices — not on our servers — so there's no "forgot code"
            reset. If every copy is lost, that history can't be recovered on a device that never had it.
          </Text>
        </View>

        {!hasKey && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Set up this device</Text>
            <Text style={s.cardSub}>
              Enter your family's security code, or set a new one if this is the first device in your family
              to set this up.
            </Text>
            <TextInput
              style={s.codeInput}
              value={entryCode}
              onChangeText={setEntryCode}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TouchableOpacity style={[s.btn, { opacity: savingEntry ? 0.7 : 1 }]} onPress={handleEnterCode} disabled={savingEntry}>
              {savingEntry ? <ActivityIndicator color={colors.textInverse} /> : <Text style={s.btnText}>Save Code</Text>}
            </TouchableOpacity>

            {isParent && (
              <>
                <View style={[s.warnCard, { backgroundColor: colors.danger + '12', borderColor: colors.danger + '40', marginTop: 4 }]}>
                  <Ionicons name="warning-outline" size={16} color={colors.danger} />
                  <Text style={[s.cardSub, { color: colors.danger, flex: 1 }]}>
                    If this is the first device setting this up, generate a brand-new code below instead.
                    Write it down somewhere safe — if everyone loses it, this history can never be read
                    again, not even by us.
                  </Text>
                </View>
                <Text style={[s.label, { marginTop: 4 }]}>{customMode ? 'Enter your own code' : 'New family security code'}</Text>
                <TextInput
                  style={s.codeInput}
                  value={setupCode}
                  onChangeText={setSetupCode}
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={customMode}
                />
                {!customMode ? (
                  <TouchableOpacity onPress={() => { setCustomMode(true); setSetupCode(''); }} style={{ alignSelf: 'center', marginTop: 2 }}>
                    <Text style={s.linkText}>Use my own code instead</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => { setCustomMode(false); setSetupCode(generateFamilyKeyCode()); }} style={{ alignSelf: 'center', marginTop: 2 }}>
                    <Text style={s.linkText}>Generate one for me instead</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[s.btn, { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary, opacity: saving ? 0.7 : 1 }]} onPress={handleShareSetup}>
                  <Text style={[s.btnText, { color: colors.primary }]}>Share This Code</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn, { opacity: saving ? 0.7 : 1 }]} onPress={handleSetUp} disabled={saving}>
                  {saving ? <ActivityIndicator color={colors.textInverse} /> : <Text style={s.btnText}>Create & Set Up This Code</Text>}
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {hasKey && (
          <View style={s.card}>
            <View style={s.rowBetween}>
              <Text style={s.cardTitle}>Status</Text>
              <View style={[s.badge, stale && { backgroundColor: colors.danger + '18' }]}>
                <Ionicons name={stale ? 'alert-circle' : 'checkmark-circle'} size={14} color={stale ? colors.danger : colors.success} />
                <Text style={[s.badgeText, { color: stale ? colors.danger : colors.success }]}>
                  {stale ? 'Out of date' : 'Up to date'}
                </Text>
              </View>
            </View>
            <Text style={s.cardSub}>
              {stale
                ? 'Your family’s code was rotated and this device hasn’t gotten the new one yet. Ask a parent for the current code below.'
                : 'This device has the current family security code.'}
            </Text>
            {(rotatedByName || rotatedAt) && (
              <Text style={[s.cardSub, { color: colors.textTertiary }]}>
                {rotatedByName ? `Last rotated by ${rotatedByName}` : 'Last rotated'}
                {rotatedAt ? ` on ${fmtDateTime(rotatedAt)}` : ''}
                {keyGeneration != null ? ` · generation ${keyGeneration}` : ''}
              </Text>
            )}
            {managingParentNames.length > 0 && (
              <Text style={[s.cardSub, { color: colors.textTertiary }]}>
                Can be managed by: {managingParentNames.join(', ')}
              </Text>
            )}
          </View>
        )}

        {hasKey && stale && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Enter the current code</Text>
            <Text style={s.cardSub}>Ask a parent for the family's current security code.</Text>
            <TextInput
              style={s.codeInput}
              value={entryCode}
              onChangeText={setEntryCode}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TouchableOpacity style={[s.btn, { opacity: savingEntry ? 0.7 : 1 }]} onPress={handleEnterCode} disabled={savingEntry}>
              {savingEntry ? <ActivityIndicator color={colors.textInverse} /> : <Text style={s.btnText}>Save Code</Text>}
            </TouchableOpacity>
          </View>
        )}

        {hasKey && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Have an older code too?</Text>
            <Text style={s.cardSub}>
              If this device is missing history from before a rotation, enter any older code you still
              have — this is additive and won't affect sending new messages. Skip a code and lose it later,
              and anything encrypted under it stays unreadable on this device for good.
            </Text>
            {showOlderField ? (
              <>
                <TextInput
                  style={s.codeInput}
                  value={olderCode}
                  onChangeText={setOlderCode}
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                <TouchableOpacity style={[s.btn, { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary, opacity: savingOlder ? 0.7 : 1 }]} onPress={handleAddOlderCode} disabled={savingOlder}>
                  {savingOlder ? <ActivityIndicator color={colors.primary} /> : <Text style={[s.btnText, { color: colors.primary }]}>Add Older Code</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setShowOlderField(false); setOlderCode(''); }} style={{ alignSelf: 'center', marginTop: 2 }}>
                  <Text style={s.linkText}>Never mind</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={[s.btn, { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary }]} onPress={() => setShowOlderField(true)}>
                <Text style={[s.btnText, { color: colors.primary }]}>I Also Have an Older Code</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {hasKey && isParent && !rotateMode && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Rotate security code</Text>
            <Text style={s.cardSub}>
              Replaces the family's code with a new one. Can only be done once every {ROTATION_COOLDOWN_DAYS} days.
              Every other device is blocked from chat and medical records until the new code is entered
              there — this device re-encrypts existing history in the background.
            </Text>
            <TouchableOpacity style={[s.btn, { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary }]} onPress={() => { setRotateCode(generateFamilyKeyCode()); setRotateMode(true); }}>
              <Text style={[s.btnText, { color: colors.primary }]}>Rotate Code</Text>
            </TouchableOpacity>
            {rotateBlockedUntil && (
              <Text style={[s.cardSub, { color: colors.textTertiary }]}>
                You can rotate again on {fmtDateTime(rotateBlockedUntil.toISOString())}.
              </Text>
            )}
          </View>
        )}

        {hasKey && isParent && rotateMode && (
          <View style={s.card}>
            <Text style={s.cardTitle}>New security code</Text>
            <View style={[s.warnCard, { backgroundColor: colors.danger + '12', borderColor: colors.danger + '40' }]}>
              <Ionicons name="warning-outline" size={16} color={colors.danger} />
              <Text style={[s.cardSub, { color: colors.danger, flex: 1 }]}>
                Anyone who loses the OLD code after this can no longer read anything encrypted under it on a
                device that never had it. Share the new code with your family right away.
              </Text>
            </View>
            <TextInput
              style={s.codeInput}
              value={rotateCode}
              onChangeText={setRotateCode}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TouchableOpacity style={[s.btn, { backgroundColor: colors.danger, opacity: rotating ? 0.7 : 1 }]} onPress={handleRotate} disabled={rotating}>
              {rotating ? <ActivityIndicator color={colors.textInverse} /> : <Text style={s.btnText}>Rotate Now</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setRotateCode(''); setRotateMode(false); }} style={{ alignSelf: 'center', marginTop: 2 }} disabled={rotating}>
              <Text style={s.linkText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </>
  );

  return hideChrome ? body : <SafeAreaView style={s.safe}>{body}</SafeAreaView>;
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
    warnCard: { flexDirection: 'row' as const, gap: 8, padding: 10, borderRadius: RADIUS.sm, borderWidth: 1 },
    cardTitle: { fontSize: TYPO.body, fontWeight: '800' as const, color: colors.textPrimary },
    cardSub: { fontSize: TYPO.caption, color: colors.textSecondary, lineHeight: 18 },
    rowBetween: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
    badge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: colors.success + '18' },
    badgeText: { fontSize: TYPO.micro, fontWeight: '800' as const },
    label: { fontSize: TYPO.caption, fontWeight: '700' as const, color: colors.textSecondary },
    codeInput: {
      borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 12, fontSize: TYPO.body, fontWeight: '800' as const,
      letterSpacing: 1.5, textAlign: 'center' as const,
      color: colors.textPrimary, backgroundColor: colors.surface,
    },
    btn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' as const, backgroundColor: colors.primary, marginTop: 4 },
    btnText: { color: colors.textInverse, fontSize: TYPO.body, fontWeight: '800' as const },
    linkText: { fontSize: TYPO.caption, fontWeight: '700' as const, color: colors.textSecondary, textDecorationLine: 'underline' as const },
  };
}
