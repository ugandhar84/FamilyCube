/**
 * JoinFamilyScreen — Kid/grandparent enters invite code, picks their profile,
 * then sets a mandatory PIN. No Supabase Auth account required.
 */
import { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Image,
  ScrollView, Alert, ActivityIndicator, Dimensions, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO } from '@/constants/theme';
import { supabase, uploadMemberAvatar } from '@/lib/supabase';
import { useFamilyStore, RELATIONSHIPS_BY_ROLE, type MemberRole } from '@/store/familyStore';
import { registerForPushNotifications } from '@/lib/notifications';
import { AnimatedCubeMark } from '@/components/FamilyCubeLogo';
import { PhotoPickerSheet } from '@/features/vault/tabs/RosterTab';
import { showAlert } from '@/components/AppAlert';
import { showPickerLoading, hidePickerLoading } from '@/lib/pickerLoading';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

const { width } = Dimensions.get('window');

const AVATARS = ['🧒','👦','👧','🧑','👩','👨','🧓','👴','👵','🦸','🧙','🧜','🦊','🐶','🐱','⭐'];
// Member's own profile-color choice — a genuine swatch picker, not app
// chrome (CLAUDE.md's explicit exception). Built from useTheme() inside the
// component below so it leads with the actual current brand primary.
const ROLES   = [
  { value: 'kid',         label: 'Kid',          emoji: '🧒', desc: 'Complete quests & earn coins' },
  { value: 'parent',      label: 'Parent',        emoji: '👩', desc: 'Manage quests & approve tasks' },
  { value: 'grandparent', label: 'Grandparent',   emoji: '👴', desc: 'View & support the family' },
];

type Step = 'code' | 'invite-check' | 'profile' | 'pin' | 'confirm';

// ─── Invite-code step icon — an envelope holding a key, since this step is
// literally "someone handed you a key to their family." Sage (CONNECT).
function InviteCodeSvg({ colors }: { colors: any }) {
  return (
    <Svg width="88" height="88" viewBox="0 0 88 88">
      <Circle cx="44" cy="44" r="44" fill={colors.tealLight} />
      <Path d="M20 32 h48 a4 4 0 0 1 4 4 v20 a4 4 0 0 1 -4 4 h-48 a4 4 0 0 1 -4 -4 v-20 a4 4 0 0 1 4 -4 Z" fill={colors.teal} />
      <Path d="M18 34 L44 52 L70 34" stroke={colors.tealLight} strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="44" cy="26" r="8" fill={colors.amber} />
      <Rect x="42" y="26" width="10" height="4" rx="2" fill={colors.amber} />
      <Circle cx="44" cy="26" r="3.4" fill={colors.tealLight} />
    </Svg>
  );
}

// ─── PIN step icon — a padlock in the brand primary color, matched to the
// app's own PIN-entry treatment (components/PinEntryModal.tsx).
function PinLockSvg({ colors }: { colors: any }) {
  return (
    <Svg width="88" height="88" viewBox="0 0 88 88">
      <Circle cx="44" cy="44" r="44" fill={colors.primaryLight} />
      <Path d="M31 40 V32 a13 13 0 0 1 26 0 v8" stroke={colors.primary} strokeWidth="5" fill="none" strokeLinecap="round" />
      <Rect x="21" y="40" width="46" height="30" rx="8" fill={colors.primary} />
      <Circle cx="38" cy="55" r="3.4" fill="#fff" />
      <Circle cx="50" cy="55" r="3.4" fill="#fff" opacity="0.5" />
      <Circle cx="44" cy="55" r="3.4" fill="#fff" opacity="0.8" />
    </Svg>
  );
}

// ─── Profile-step avatar preview — reflects the picker's live avatar/color,
// not a static icon. Shows the picked photo in place of the emoji when set.
function ProfileSvg({ avatar, color, photoUri, onPress }: { avatar: string; color: string; photoUri?: string | null; onPress?: () => void }) {
  return (
    <TouchableOpacity disabled={!onPress} onPress={onPress} style={{ alignItems: 'center', justifyContent: 'center', width: 90, height: 90,
      borderRadius: 45, backgroundColor: color + '22', borderWidth: 3, borderColor: color, overflow: 'hidden' }}>
      {photoUri
        ? <Image source={{ uri: photoUri }} style={{ width: 90, height: 90 }} />
        : <Text style={{ fontSize: 44 }}>{avatar}</Text>}
    </TouchableOpacity>
  );
}

// ─── Step indicator ────────────────────────────────────────────────────────────
function StepDots({ step, colors }: { step: Step; colors: any }) {
  const steps: Step[] = ['code', 'profile', 'pin'];
  return (
    <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 28 }}>
      {steps.map((s, i) => (
        <View key={s} style={{
          width: s === step ? 24 : 8, height: 8, borderRadius: 4,
          backgroundColor: s === step ? colors.primary : steps.indexOf(step) > i ? colors.primaryLight : colors.border,
        }} />
      ))}
    </View>
  );
}

export default function JoinFamilyScreen() {
  const { colors, isDark } = useTheme();
  const COLORS = [colors.primary, colors.teal, colors.amber, colors.pink, colors.danger];
  const [step, setStep]         = useState<Step>('code');
  const [code, setCode]         = useState('');
  const [name, setName]         = useState('');
  const [avatar, setAvatar]     = useState('🧒');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [color, setColor]       = useState(colors.primary);
  const [role, setRole]         = useState<string>('kid');
  // Purely descriptive (shown on the family tree/roster card, same as
  // RosterTab's own relationship editor) — never a permission gate, role
  // alone drives that. Reset whenever role changes so a stale pick from a
  // different role's option list (e.g. "Mother" left over from Parent)
  // can't silently carry over to Kid.
  const [relationship, setRelationship] = useState<string | undefined>(undefined);
  const [pin, setPin]           = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinStage, setPinStage] = useState<'create' | 'confirm'>('create');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [familyName, setFamilyName] = useState('');

  const setMembers    = useFamilyStore(s => s.setMembers);
  const setActiveMem  = useFamilyStore(s => s.setActiveMember);

  const [checkingCode, setCheckingCode] = useState(false);
  const [pendingEmailHint, setPendingEmailHint] = useState<string | null>(null);

  // ── Step 1: Validate code ────────────────────────────────────────────────────
  const handleCodeNext = async () => {
    // 8 chars (3-letter family-name prefix + 5 random alphanumeric), but
    // don't hard-require exact length client-side — join-family's own
    // lookup is the real check, and codes generated before this format
    // change are still valid 6-digit ones until they expire (7-day TTL), so
    // an exact-length gate here would wrongly block someone using an older
    // code they were already given.
    if (code.trim().length < 6) { setError('Enter your invite code'); return; }
    setError('');

    // Pre-fill whatever the parent already entered (name/DOB/role/
    // relationship) when creating this pending member, instead of making
    // the invitee re-type it all from scratch (live-reported gap). Best-
    // effort — a peek failure (network hiccup, legacy code with no
    // pre-created row) just falls back to the old blank-form behavior
    // rather than blocking progress; the REAL validation still happens on
    // final submit via join-family's normal path.
    setCheckingCode(true);
    try {
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/join-family`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ code: code.trim(), peek: true }),
        }
      );
      const data = await res.json();
      if (res.ok && data.ok && data.member) {
        if (data.member.name) setName(data.member.name);
        if (data.member.role) setRole(data.member.role === 'child' ? 'kid' : data.member.role === 'grandparent' ? 'grandparent' : data.member.role);
        if (data.member.relationship) setRelationship(data.member.relationship);
        // date_of_birth isn't shown on THIS screen (deliberately deferred to
        // CompleteProfileScreen.tsx, see its own header comment) — it's
        // already on the DB row from addPendingMember and join-family's
        // claim update never touches it, so CompleteProfileScreen picks it
        // up automatically once the real member syncs in. Nothing to do
        // with it here.
      } else if (!res.ok) {
        // A genuinely invalid/expired code — surface it now rather than
        // waiting for the final submit to fail with the same message.
        setCheckingCode(false);
        setError(data.error ?? 'Invalid or expired invite code.');
        return;
      }
      // This family has a SEPARATE pending email invite outstanding
      // (join-family's peek response, see its own comment) — the code and
      // email-invite systems have no link between them, so this can't
      // confirm the person entering this code IS the one who was emailed,
      // only that someone was. Live-reported bug this catches: an
      // email-invited person instead joins anonymously via a family code,
      // never realizing they were actually meant to sign up with their
      // real email — later, signing up for real, they had no linked
      // identity and ended up creating a phantom duplicate family instead
      // of landing in the one they were invited to. Routes to a dedicated
      // 'invite-check' step (a real forced decision, not a dismissible
      // Alert — a plain Alert is too easy to tap through without actually
      // reading) rather than a hard block on the whole family: a genuine
      // second family member (a kid, say) joining by code while an
      // unrelated co-parent email invite happens to be pending must still
      // be able to proceed normally by answering "that's not me."
      // SetupFamilyScreen's own separate guard is the real backstop that
      // keeps a duplicate family from ever being created even if someone
      // answers this incorrectly.
      if (Array.isArray(data.pendingEmailHints) && data.pendingEmailHints.length > 0) {
        setCheckingCode(false);
        setPendingEmailHint(data.pendingEmailHints[0]);
        setStep('invite-check');
        return;
      }
    } catch {
      // Network hiccup — proceed with a blank form rather than blocking.
    }
    setCheckingCode(false);
    setStep('profile');
  };

  // ── Step 2: Profile complete ─────────────────────────────────────────────────
  // Deliberately minimal — name/role/relationship/avatar/color only. Photo
  // and date of birth are collected AFTER joining, via a one-time
  // "Complete your profile" prompt (features/onboarding/screens/
  // CompleteProfileScreen.tsx) — not blockers on the way into the app at
  // all, per explicit product decision: someone joining a family shouldn't
  // have to hand over a birth date and a photo before they've even seen
  // what they're joining.
  const handleProfileNext = () => {
    if (!name.trim()) { setError('Enter your name'); return; }
    setError('');
    setPinStage('create');
    setStep('pin');
  };

  // ── Step 3: Join with PIN ────────────────────────────────────────────────────
  const handleJoin = async () => {
    if (pin.length < 4) { setError('PIN must be at least 4 digits'); return; }
    if (pin !== pinConfirm) { setError('PINs do not match'); return; }
    setError('');
    setLoading(true);
    try {
      const expoPushToken = await registerForPushNotifications().catch(() => null);

      // This device needs SOME Supabase Auth session — pass its access
      // token so join-family can stamp auth_user_id on the new member row.
      // Without this, the member row has no auth_user_id and every RLS-
      // gated write they make (or that gets made on their behalf) fails
      // silently. See migration 20260818192700 for why this is the actual
      // identity RLS checks.
      //
      // Normally LoginScreen's "Enter your invite code" link already starts
      // an anonymous session before routing here — this is a defense-in-
      // depth fallback for anyone who reaches this screen another way (deep
      // link, etc). Anonymous, not the founding parent's session: this
      // device gets its OWN distinct auth_user_id, never shared with
      // whoever generated the code.
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { data: anonData, error: anonErr } = await supabase.auth.signInAnonymously();
        if (anonErr || !anonData.session) throw new Error('Could not start a session on this device.');
        session = anonData.session;
      }

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/join-family`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ code: code.trim(), name: name.trim(), role, avatar, color, expoPushToken }),
        }
      );
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Something went wrong. Check the code and try again.');
        return;
      }

      setFamilyName(data.familyName);

      // Save PIN and relationship — join-family itself doesn't accept
      // relationship, same pattern PIN already used: set locally right
      // after the row exists rather than threading one more field through
      // the edge function. If a photo was picked, upload it now (memberId/
      // familyId only exist after join-family returns) and let it win over
      // the emoji the edge function already stored.
      let avatarValue = data.member.avatar as string;
      if (photoUri) {
        try {
          avatarValue = await uploadMemberAvatar(data.familyId, data.member.id, photoUri);
        } catch (e: any) {
          console.warn('[JoinFamilyScreen] avatar upload failed, keeping emoji', e?.message);
        }
      }
      await supabase.from('members').update({
        pin, relationship: relationship ?? null,
        ...(photoUri && avatarValue !== data.member.avatar ? { avatar: avatarValue } : {}),
      }).eq('id', data.memberId);

      // Load member into familyStore and set active
      const isPhotoUrl = avatarValue.startsWith('http');
      const member = {
        id:         data.member.id,
        name:       data.member.name,
        role:       data.member.role as any,
        emoji:      isPhotoUrl ? undefined : avatarValue,
        avatarUrl:  isPhotoUrl ? avatarValue : undefined,
        color:      data.member.color,
        coins:           data.member.coins,
        mainCoins:       data.member.coins,
        gpCoins:         0,
        xp:              data.member.xp,
        level:           data.member.level,
        maxXp:           data.member.max_xp ?? 100,
        streak:          0,
        pin:             pin,
        pinEnabled:      true,
        familyId:        data.familyId,
        timezone:        'America/New_York',
        title:           'Explorer',
        questsCompleted: 0,
        questsPending:   0,
        relationship:    relationship,
      };
      // setMembers([member]) alone used to leave familyStore with a
      // ONE-PERSON array and loaded still false — every downstream screen
      // that gates its own initial fetch on `!loaded` (HubScreen, ChatScreen,
      // StoreScreen) independently raced its own catch-up syncFromDB() right
      // as the user landed, so for a window right after joining, the rest of
      // the family (parents, siblings, seniors) was simply missing from
      // every screen: no profile-switcher entries, no chat channels/DMs, no
      // group roster — live-reported (a freshly-joined member saw only
      // herself everywhere). Seed the store with this one member first (so
      // setActiveMember below has a target to resolve against immediately),
      // then run a full syncFromDB() — now that a real session + family_id
      // exist — so the complete roster is in the store, and `loaded` is
      // genuinely true, before this screen ever navigates away.
      setMembers([member]);
      setActiveMem(member.id);
      await useFamilyStore.getState().syncFromDB();

      setStep('confirm');
    } catch (e: any) {
      setError(e?.message ?? 'Network error. Try again.');
    } finally {
      setLoading(false);
    }
  };

  // Close the picker sheet fully before launching the native camera/library
  // UI — same deliberate ordering as ProfileSettingsScreen.tsx's own
  // pickPhoto (stacking a second native picker on a still-visible RN
  // <Modal> sheet is a known iOS freeze/deadlock).
  const pickPhoto = async (fromCamera: boolean) => {
    setShowPhotoPicker(false);
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      showAlert('Permission needed', `Allow ${fromCamera ? 'camera' : 'photo library'} access to set a profile photo.`);
      return;
    }
    try {
      await showPickerLoading(fromCamera ? 'Waiting for camera…' : 'Opening library…');
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      hidePickerLoading();
      if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
    } catch (e: any) {
      hidePickerLoading();
      showAlert(`Could not open ${fromCamera ? 'camera' : 'library'}`, e?.message);
    }
  };

  const bg = colors.background;
  const card = colors.card ?? colors.surface;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.root, { backgroundColor: bg }]}>
        <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

            {/* Back — omitted on 'invite-check': this is a forced decision
                (must explicitly answer whether the pending email invite is
                them), not a step to quietly back out of past. Both its own
                buttons are real, complete exits (either to signup or
                forward into the normal join flow), so no separate back
                affordance is needed. */}
            {step !== 'confirm' && step !== 'invite-check' && (
              <TouchableOpacity style={s.back} onPress={() => step === 'code' ? router.back() : setStep(step === 'pin' ? 'profile' : 'code')}>
                <Text style={[s.backText, { color: colors.textSecondary }]}>← Back</Text>
              </TouchableOpacity>
            )}

            {step !== 'confirm' && step !== 'invite-check' && <StepDots step={step} colors={colors} />}

            {/* ── STEP 1: Enter Code ─────────────────────────────────────────── */}
            {step === 'code' && (
              <View style={s.center}>
                <InviteCodeSvg colors={colors} />
                <Text style={[s.title, { color: colors.textPrimary }]}>Enter Invite Code</Text>
                <Text style={[s.subtitle, { color: colors.textSecondary }]}>
                  Ask a parent for the invite code shown in their Family Settings.
                </Text>
                <TextInput
                  style={[s.codeInput, { color: colors.textPrimary, backgroundColor: card, borderColor: code.length >= 8 ? '#10B981' : colors.border ?? '#E0E0E0', letterSpacing: 3 }]}
                  value={code}
                  onChangeText={t => { setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)); setError(''); }}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={8}
                  placeholder="ABC12345"
                  placeholderTextColor={colors.textSecondary}
                  textAlign="center"
                />
                {error ? <Text style={s.error}>{error}</Text> : null}
                <TouchableOpacity
                  style={[s.btn, { backgroundColor: code.length >= 6 ? '#10B981' : '#ccc' }]}
                  onPress={handleCodeNext}
                  disabled={code.length < 6 || checkingCode}
                >
                  {checkingCode
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={s.btnText}>Continue</Text>}
                </TouchableOpacity>
              </View>
            )}

            {/* ── Forced decision: does a pending email invite belong to
                whoever is entering this code? A required choice, not a
                dismissible Alert — an Alert is too easy to tap through
                without actually reading, which defeats the whole point of
                catching this before it becomes a duplicate-family bug. ── */}
            {step === 'invite-check' && (
              <View style={s.center}>
                <InviteCodeSvg colors={colors} />
                <Text style={[s.title, { color: colors.textPrimary }]}>Is this invite for you?</Text>
                <Text style={[s.subtitle, { color: colors.textSecondary }]}>
                  This family has a pending invite for{'\n'}
                  <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{pendingEmailHint}</Text>.
                  {'\n\n'}If that's your email, sign up there instead — it's already connected to this family.
                </Text>
                <TouchableOpacity
                  style={[s.btn, { backgroundColor: colors.primary, marginTop: 24 }]}
                  onPress={() => router.replace('/(auth)/signup')}
                >
                  <Text style={s.btnText}>Yes, that's me — take me to sign up</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.btn, { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.border ?? '#E0E0E0', marginTop: 10 }]}
                  onPress={() => setStep('profile')}
                >
                  <Text style={[s.btnText, { color: colors.textPrimary }]}>No, that's not me — continue joining</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── STEP 2: Pick Profile ───────────────────────────────────────── */}
            {step === 'profile' && (
              <View>
                <View style={s.center}>
                  <ProfileSvg avatar={avatar} color={color} photoUri={photoUri} onPress={() => setShowPhotoPicker(true)} />
                  <Text style={[s.title, { color: colors.textPrimary }]}>Create Your Profile</Text>
                  <TouchableOpacity onPress={() => setShowPhotoPicker(true)}>
                    <Text style={{ color: colors.primary, fontWeight: '700', fontSize: TYPO.caption, marginTop: -4, marginBottom: 8 }}>
                      📷 Use a photo instead
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Name */}
                <Text style={[s.label, { color: colors.textSecondary }]}>Your name</Text>
                <TextInput
                  style={[s.input, { color: colors.textPrimary, backgroundColor: card, borderColor: colors.border ?? '#E0E0E0' }]}
                  value={name}
                  onChangeText={t => { setName(t); setError(''); }}
                  placeholder="e.g. Emma"
                  placeholderTextColor={colors.textSecondary}
                  autoFocus
                />

                {/* Role */}
                <Text style={[s.label, { color: colors.textSecondary }]}>I am a…</Text>
                <View style={s.roleRow}>
                  {ROLES.map(r => (
                    <TouchableOpacity
                      key={r.value}
                      style={[s.roleCard, { backgroundColor: card, borderColor: role === r.value ? colors.primary : colors.border ?? '#E0E0E0', borderWidth: role === r.value ? 2 : 1 }]}
                      onPress={() => { setRole(r.value); setRelationship(undefined); }}
                    >
                      <Text style={{ fontSize: 22 }}>{r.emoji}</Text>
                      <Text style={[s.roleLabel, { color: colors.textPrimary }]}>{r.label}</Text>
                      <Text style={[s.roleDesc, { color: colors.textSecondary }]}>{r.desc}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Relationship — purely descriptive, scoped to options that
                    make sense for the role just picked above (same list
                    RosterTab's own editor uses, so a member's relationship
                    reads the same whether it was set here or edited later
                    in Family Settings). */}
                {(() => {
                  const relRole: MemberRole = role === 'grandparent' ? 'senior' : role === 'parent' ? 'parent' : 'kid';
                  const options = RELATIONSHIPS_BY_ROLE[relRole] ?? [];
                  if (options.length === 0) return null;
                  return (
                    <>
                      <Text style={[s.label, { color: colors.textSecondary }]}>Relationship <Text style={{ fontWeight: '400' }}>(optional)</Text></Text>
                      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                        {options.map(opt => {
                          const picked = relationship === opt;
                          return (
                            <TouchableOpacity key={opt} onPress={() => setRelationship(picked ? undefined : opt)}
                              style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1.5,
                                backgroundColor: picked ? colors.primary : card,
                                borderColor: picked ? colors.primary : colors.border ?? '#E0E0E0' }}>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: picked ? '#fff' : colors.textSecondary }}>{opt}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </>
                  );
                })()}

                {/* Avatar */}
                <Text style={[s.label, { color: colors.textSecondary }]}>Pick an avatar</Text>
                <View style={s.emojiGrid}>
                  {AVATARS.map(a => (
                    <TouchableOpacity
                      key={a}
                      style={[s.emojiBtn, avatar === a && { backgroundColor: color + '33', borderColor: color, borderWidth: 2 }]}
                      onPress={() => setAvatar(a)}
                    >
                      <Text style={{ fontSize: 26 }}>{a}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Color */}
                <Text style={[s.label, { color: colors.textSecondary }]}>Profile color</Text>
                <View style={s.colorRow}>
                  {COLORS.map(c => (
                    <TouchableOpacity
                      key={c}
                      style={[s.colorDot, { backgroundColor: c }, color === c && s.colorDotActive]}
                      onPress={() => setColor(c)}
                    />
                  ))}
                </View>

                {error ? <Text style={s.error}>{error}</Text> : null}
                <TouchableOpacity style={[s.btn, { backgroundColor: colors.primary }]} onPress={handleProfileNext}>
                  <Text style={s.btnText}>Next — Set Your PIN</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── STEP 3: Set PIN ────────────────────────────────────────────── */}
            {step === 'pin' && (
              <View style={s.center}>
                <PinLockSvg colors={colors} />
                <Text style={[s.title, { color: colors.textPrimary }]}>Set Your PIN</Text>
                <Text style={[s.subtitle, { color: colors.textSecondary }]}>
                  Your 4-digit PIN protects your profile when switching members on a shared device.
                </Text>
                {pinStage === 'create' ? (
                  <>
                    <Text style={[s.label, { color: colors.textSecondary }]}>Create PIN</Text>
                    <PinDots value={pin} colors={colors} />
                    <PinPad
                      value={pin}
                      colors={colors}
                      onChange={v => {
                        setPin(v);
                        if (v.length === 4) setPinStage('confirm');
                      }}
                    />
                  </>
                ) : (
                  <>
                    <Text style={[s.label, { color: colors.textSecondary }]}>Confirm PIN</Text>
                    <PinDots value={pinConfirm} colors={colors} />
                    <PinPad
                      value={pinConfirm}
                      colors={colors}
                      onChange={v => {
                        setPinConfirm(v);
                        if (v.length === 4) {
                          if (v !== pin) {
                            setError('PINs do not match — try again');
                            setPin('');
                            setPinConfirm('');
                            setPinStage('create');
                          } else {
                            setError('');
                          }
                        }
                      }}
                    />
                    <TouchableOpacity onPress={() => { setPinConfirm(''); setPinStage('create'); }}>
                      <Text style={[s.backText, { color: colors.textSecondary, marginTop: 12 }]}>← Re-enter PIN</Text>
                    </TouchableOpacity>
                  </>
                )}

                {error ? <Text style={s.error}>{error}</Text> : null}

                {pin.length === 4 && pinConfirm.length === 4 && pin === pinConfirm && (
                  <TouchableOpacity
                    style={[s.btn, { backgroundColor: colors.primary, marginTop: 20 }]}
                    onPress={handleJoin}
                    disabled={loading}
                  >
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Join Family!</Text>}
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* ── CONFIRM ────────────────────────────────────────────────────── */}
            {step === 'confirm' && (
              <View style={s.center}>
                <AnimatedCubeMark size={90} />
                <Text style={{ fontSize: 36, marginTop: -8, marginBottom: 4 }}>🎉</Text>
                <Text style={[s.title, { color: colors.textPrimary }]}>You're in!</Text>
                <Text style={[s.subtitle, { color: colors.textSecondary }]}>
                  Welcome to <Text style={{ color: colors.primary, fontWeight: '700' }}>{familyName}</Text>!{'\n'}
                  You joined as <Text style={{ fontWeight: '700' }}>{name}</Text> {avatar}
                </Text>
                <TouchableOpacity
                  style={[s.btn, { backgroundColor: colors.primary, marginTop: 32 }]}
                  onPress={() => router.replace('/onboarding/permissions')}
                >
                  <Text style={s.btnText}>Let's Go →</Text>
                </TouchableOpacity>
              </View>
            )}

          </ScrollView>
        </SafeAreaView>
      </View>
      <PhotoPickerSheet
        visible={showPhotoPicker} onClose={() => setShowPhotoPicker(false)}
        onTakePhoto={() => pickPhoto(true)} onChooseLibrary={() => pickPhoto(false)}
        onRemove={photoUri ? () => { setShowPhotoPicker(false); setPhotoUri(null); } : undefined}
        avatarUri={photoUri} avatarEmoji={avatar} name={name || undefined}
        colors={colors} isDark={isDark} />
    </KeyboardAvoidingView>
  );
}

// ─── PIN dot indicator ────────────────────────────────────────────────────────
function PinDots({ value, colors }: { value: string; colors: any }) {
  return (
    <View style={{ flexDirection: 'row', gap: 14, justifyContent: 'center', marginVertical: 14 }}>
      {[0, 1, 2, 3].map(i => (
        <View key={i} style={{
          width: 18, height: 18, borderRadius: 9,
          backgroundColor: i < value.length ? colors.primary : 'transparent',
          borderWidth: 2, borderColor: colors.primary,
        }} />
      ))}
    </View>
  );
}

// ─── PIN numpad ───────────────────────────────────────────────────────────────
function PinPad({ value, onChange, colors }: { value: string; onChange: (v: string) => void; colors: any }) {
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  return (
    <View style={s.pad}>
      {keys.map((k, i) => k === '' ? (
        <View key={i} style={s.padEmpty} />
      ) : (
        <TouchableOpacity
          key={i}
          style={[s.padKey, { backgroundColor: colors.primaryLight }]}
          onPress={() => {
            if (k === '⌫') onChange(value.slice(0, -1));
            else if (value.length < 4) onChange(value + k);
          }}
          disabled={value.length === 4 && k !== '⌫'}
        >
          <Text style={[s.padKeyText, { color: colors.primary }]}>{k}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  root:         { flex: 1 },
  safe:         { flex: 1 },
  scroll:       { paddingHorizontal: 22, paddingBottom: 40 },
  back:         { paddingTop: 10, paddingBottom: 4 },
  backText:     { fontSize: 15 },
  center:       { alignItems: 'center', marginBottom: 16 },
  title:        { fontSize: 26, fontWeight: '800', textAlign: 'center', marginTop: 16, marginBottom: 8 },
  subtitle:     { fontSize: TYPO.body, textAlign: 'center', lineHeight: 22, opacity: 0.75, marginBottom: 20 },
  label:        { fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 18, textTransform: 'uppercase', letterSpacing: 0.5 },
  codeInput:    { fontSize: 32, fontWeight: '800', letterSpacing: 12, borderRadius: 16, borderWidth: 2, padding: 18, width: 240, textAlign: 'center', marginVertical: 20 },
  input:        { borderRadius: 14, borderWidth: 1.5, padding: 14, fontSize: 16, marginBottom: 4 },
  roleRow:      { flexDirection: 'row', gap: 10, marginBottom: 8 },
  roleCard:     { flex: 1, borderRadius: 14, padding: 12, alignItems: 'center', gap: 4 },
  roleLabel:    { fontSize: 13, fontWeight: '700' },
  roleDesc:     { fontSize: 11, textAlign: 'center', opacity: 0.7 },
  emojiGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  emojiBtn:     { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  colorRow:     { flexDirection: 'row', gap: 12, marginBottom: 24 },
  colorDot:     { width: 32, height: 32, borderRadius: 16 },
  colorDotActive: { borderWidth: 3, borderColor: '#fff', transform: [{ scale: 1.15 }], shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4 },
  btn:          { borderRadius: 16, paddingVertical: 15, paddingHorizontal: 28, alignItems: 'center', marginTop: 12, minWidth: 200 },
  btnText:      { color: '#fff', fontSize: 16, fontWeight: '700' },
  error:        { color: '#EF4444', fontSize: 13, textAlign: 'center', marginTop: 8 },
  pad:          { flexDirection: 'row', flexWrap: 'wrap', width: 240, justifyContent: 'center', gap: 12, marginTop: 4 },
  padKey:       { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  padEmpty:     { width: 68, height: 68 },
  padKeyText:   { fontSize: 22, fontWeight: '700' },
});
