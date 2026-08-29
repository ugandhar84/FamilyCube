/**
 * SetupFamilyScreen — Parent creates the family, sets their own profile + PIN,
 * then gets the invite code to share with family members.
 */
import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Image,
  ScrollView, ActivityIndicator, Alert, Dimensions, KeyboardAvoidingView, Platform, Share,
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

const AVATARS = ['👩','👨','🧑','👩‍💼','👨‍💼','🦸‍♀️','🦸‍♂️','🧙‍♀️','🧙‍♂️','🧑‍🏫','🧑‍🍳','🌟'];
// Member's own profile-color choice — a genuine swatch picker, not app
// chrome (CLAUDE.md's explicit exception). Built from useTheme() below so
// it leads with the actual current brand primary rather than a fixed list.

type Step = 'family' | 'profile' | 'pin' | 'invite' | 'code';

// Matches ProfileSettingsScreen.tsx's own INVITE_ROLES exactly — same role
// vocabulary every other invite entry point in the app uses.
const INVITE_ROLES: { value: MemberRole; label: string; emoji: string }[] = [
  { value: 'kid',    label: 'Kid',         emoji: '🧒' },
  { value: 'teen',   label: 'Teen',        emoji: '🧑' },
  { value: 'parent', label: 'Parent',      emoji: '👤' },
  { value: 'senior', label: 'Grandparent', emoji: '🧓' },
];

// ─── Family-creation step icon — a house with a "+" being planted, since this
// step is literally "start a new family space from scratch."
function NewFamilySvg({ colors }: { colors: any }) {
  return (
    <Svg width="88" height="88" viewBox="0 0 88 88">
      <Circle cx="44" cy="44" r="44" fill={colors.primaryLight} />
      <Path d="M44 20 L68 40 H60 V64 H28 V40 H20 Z" fill={colors.primary} />
      <Rect x="38" y="48" width="12" height="16" rx="2" fill={colors.primaryLight} />
      <Circle cx="60" cy="26" r="11" fill={colors.amber} />
      <Rect x="55" y="24.5" width="10" height="3" rx="1.5" fill="#fff" />
      <Rect x="58.5" y="21" width="3" height="10" rx="1.5" fill="#fff" />
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

function CodeRevealSvg({ code, colors }: { code: string; colors: any }) {
  return (
    <View style={{
      borderRadius: 20, backgroundColor: colors.primary, paddingVertical: 20, paddingHorizontal: 28,
      alignItems: 'center', shadowColor: colors.primary, shadowOpacity: 0.35, shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 }, elevation: 8,
    }}>
      <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>
        Family Invite Code
      </Text>
      <Text style={{ color: '#fff', fontSize: 42, fontWeight: '900', letterSpacing: 14, fontVariant: ['tabular-nums'] }}>
        {code}
      </Text>
      <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 10 }}>
        Valid for 7 days · Share with family
      </Text>
    </View>
  );
}

function StepDots({ step, colors }: { step: Step; colors: any }) {
  const steps: Step[] = ['family', 'profile', 'pin', 'invite', 'code'];
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

function PinPad({ value, onChange, colors }: { value: string; onChange: (v: string) => void; colors: any }) {
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  return (
    <View style={ps.pad}>
      {keys.map((k, i) => k === '' ? (
        <View key={i} style={ps.padEmpty} />
      ) : (
        <TouchableOpacity
          key={i}
          style={[ps.padKey, { backgroundColor: colors.primaryLight }]}
          onPress={() => {
            if (k === '⌫') onChange(value.slice(0, -1));
            else if (value.length < 4) onChange(value + k);
          }}
          disabled={value.length === 4 && k !== '⌫'}
        >
          <Text style={[ps.padKeyText, { color: colors.primary }]}>{k}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function SetupFamilyScreen() {
  const { colors, isDark } = useTheme();
  const COLORS = [colors.primary, colors.teal, colors.amber, colors.pink, colors.danger];
  const [step, setStep]             = useState<Step>('family');
  const [familyName, setFamilyName] = useState('');
  const [name, setName]             = useState('');
  const [avatar, setAvatar]         = useState('👩');
  const [photoUri, setPhotoUri]     = useState<string | null>(null);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [color, setColor]           = useState(colors.primary);
  const [pin, setPin]               = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinStage, setPinStage]     = useState<'create' | 'confirm'>('create');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  // ── Invite-first-member step state (per-invitee codes, matching
  // InviteMemberSheet's pattern in ProfileSettingsScreen.tsx — see that
  // file's own comment for why a code must be scoped to a specific
  // pre-created member row, not the parent's own row).
  const [inviteName, setInviteName]           = useState('');
  const [inviteRole, setInviteRole]           = useState<MemberRole>('kid');
  const [inviteRelationship, setInviteRelationship] = useState<string | undefined>(undefined);
  const [inviteError, setInviteError]         = useState('');
  const [invitingMember, setInvitingMember]   = useState(false);
  const [invitedName, setInvitedName]         = useState('');
  // Reaching this screen at all is only supposed to mean "this auth
  // account has never set up a family" — but a redirect glitch (a stale
  // profiles.onboarding_completed read, or any future routing bug) could
  // land an account HERE that already owns a real family. Without this
  // check, tapping through would silently insert a second `families` row
  // and a second `members` row under the same auth_user_id — the real
  // family becomes an orphaned duplicate the person can no longer reach.
  // Checked once on mount before any input is even shown; while it's
  // running the create-family form stays hidden behind a spinner so
  // there's no window to tap "Create" before the check resolves.
  const [checkingExisting, setCheckingExisting] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setCheckingExisting(false); return; }
        const { data: existing, error: checkErr } = await supabase
          .from('members')
          .select('id')
          .eq('auth_user_id', user.id)
          .limit(1)
          .maybeSingle();
        if (checkErr) {
          console.warn('[SetupFamilyScreen] existing-family check failed', checkErr.message);
          setCheckingExisting(false);
          return;
        }
        if (existing) {
          // Already has a family under this auth account — load the real
          // one instead of ever showing the create-family form, and skip
          // straight into the app.
          await useFamilyStore.getState().syncFromDB();
          router.replace('/(tabs)');
          return;
        }

        // No members row under this auth account, BUT if this exact email
        // was already invited to an existing family (member_invitations,
        // send-member-invite/accept-member-invite — a separate system from
        // the family_invites code path), this must NEVER fall through to
        // "create a new family." Live-reported: someone invited by email
        // instead joined a different family anonymously via code first
        // (JoinFamilyScreen's own soft warning for this now exists, but
        // isn't a hard block — a dismissed warning, or simply never having
        // seen the invite email at all, both land here the same way), then
        // signed up for real with the invited email and — without this
        // check — this screen let her create a brand-new, disconnected
        // second family instead of routing her into the one she was
        // actually invited to.
        if (user.email) {
          const { data: pendingInvite } = await supabase
            .from('member_invitations')
            .select('id, token, family_id, role')
            .eq('email', user.email.toLowerCase())
            .eq('status', 'pending')
            .limit(1)
            .maybeSingle();
          if (pendingInvite) {
            router.replace({ pathname: '/onboarding/pending-invite', params: { token: pendingInvite.token } });
            return;
          }
        }
      } catch (e: any) {
        console.warn('[SetupFamilyScreen] existing-family check exception', e?.message);
      }
      setCheckingExisting(false);
    })();
  }, []);

  const setMembers   = useFamilyStore(s => s.setMembers);
  const setActiveMem = useFamilyStore(s => s.setActiveMember);

  const handleFamilyNext = () => {
    if (!familyName.trim()) { setError('Enter a family name'); return; }
    if (!name.trim()) { setError('Enter your name'); return; }
    setError('');
    setStep('profile');
  };

  const handleProfileNext = () => {
    setPinStage('create');
    setStep('pin');
  };

  const handleCreate = async () => {
    if (pin.length < 4) { setError('PIN must be 4 digits'); return; }
    if (pin !== pinConfirm) { setError('PINs do not match'); return; }
    setError('');
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');

      // Re-check right before writing — the mount-time check above closes
      // the common case, but this is the actual point of no return (the
      // families/members inserts below), so it's worth one more guard
      // immediately before it rather than trusting a check that ran
      // however long ago the screen mounted.
      const { data: existing } = await supabase
        .from('members')
        .select('id')
        .eq('auth_user_id', user.id)
        .limit(1)
        .maybeSingle();
      if (existing) {
        await useFamilyStore.getState().syncFromDB();
        router.replace('/(tabs)');
        return;
      }
      if (user.email) {
        const { data: pendingInvite } = await supabase
          .from('member_invitations')
          .select('id, token')
          .eq('email', user.email.toLowerCase())
          .eq('status', 'pending')
          .limit(1)
          .maybeSingle();
        if (pendingInvite) {
          setLoading(false);
          router.replace({ pathname: '/onboarding/pending-invite', params: { token: pendingInvite.token } });
          return;
        }
      }

      const expoPushToken = await registerForPushNotifications().catch(() => null);

      // 1. Create family
      const { data: family, error: famErr } = await supabase
        .from('families')
        .insert({ name: familyName.trim(), created_by: user.id })
        .select()
        .single();
      if (famErr || !family) throw new Error(famErr?.message ?? 'Failed to create family');

      // 2. Create parent member — auth_user_id ties this row to the device's
      // real Supabase Auth session, which is what every RLS policy actually
      // checks (see migration 20260818192700). Without this, every write
      // this parent makes afterward silently fails RLS.
      const memberId = crypto.randomUUID();
      const { error: memErr } = await supabase.from('members').insert({
        id:              memberId,
        name:            name.trim(),
        role:            'parent',
        avatar,
        color,
        family_id:       family.id,
        auth_user_id:    user.id,
        coins:           0, xp: 0, level: 1, max_xp: 100, streak: 0,
        pin,
        expo_push_token: expoPushToken ?? null,
        last_active:     new Date().toISOString(),
      });
      if (memErr) throw new Error(memErr.message);

      // 2b. Upload the photo (if picked) now that the member row exists —
      // family-media's storage RLS resolves the uploader's family via
      // current_user_family_id(), which reads the members row for this
      // auth user (see migration 20260924070000). Uploading before the
      // member row exists gets rejected with "new row violates row-level
      // security policy" — confirmed live. Update the row's avatar column
      // afterward rather than trying to include the URL in the insert above.
      let avatarValue = avatar;
      if (photoUri) {
        try {
          avatarValue = await uploadMemberAvatar(family.id, memberId, photoUri);
          const { error: avatarErr } = await supabase.from('members').update({ avatar: avatarValue }).eq('id', memberId);
          if (avatarErr) throw avatarErr;
        } catch (e: any) {
          avatarValue = avatar;
          console.warn('[SetupFamilyScreen] avatar upload failed, falling back to emoji', e?.message);
        }
      }

      // 3. Load the parent into the store. No invite code is generated for
      // the parent's own row — per-invitee codes (generate-invite-code's
      // targetMemberId) are for CLAIMING a specific pre-created member row,
      // and the parent's row is already claimed (they just created it).
      // The next step lets them add their first real family member, which
      // is what actually needs a code — see handleInvite below.
      const isPhotoUrl = avatarValue.startsWith('http');
      const member = {
        id: memberId, name: name.trim(), role: 'parent' as any,
        emoji: isPhotoUrl ? undefined : avatarValue,
        avatarUrl: isPhotoUrl ? avatarValue : undefined,
        color, coins: 0, mainCoins: 0, gpCoins: 0, xp: 0, level: 1, maxXp: 100,
        streak: 0, pin, pinEnabled: true, familyId: family.id,
        timezone: 'America/New_York', title: 'Explorer',
        questsCompleted: 0, questsPending: 0,
      };
      setMembers([member]);
      setActiveMem(memberId);

      setStep('invite');
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  // Pre-create the invitee's own member row (invite_status: 'pending'),
  // then generate a code scoped to THAT row's id (targetMemberId) — not the
  // parent's. Redeeming this code claims this exact pending row (join-
  // family), matching the pattern ProfileSettingsScreen.tsx's
  // InviteMemberSheet already uses for every invite generated after this
  // first one.
  const handleInvite = async () => {
    if (!inviteName.trim()) { setInviteError('Enter their name'); return; }
    setInviteError('');
    setInvitingMember(true);
    try {
      const created = await useFamilyStore.getState().addPendingMember(inviteName, inviteRole, inviteRelationship);
      if (!created) throw new Error("Couldn't add family member — try again.");

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
      const anonKey     = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
      const { data: { session } } = await supabase.auth.getSession();
      const familyId = useFamilyStore.getState().members.find(m => m.id === useFamilyStore.getState().activeMemberId)?.familyId;
      const codeRes = await fetch(`${supabaseUrl}/functions/v1/generate-invite-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', 'apikey': anonKey,
          ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ familyId, memberId: useFamilyStore.getState().activeMemberId, targetMemberId: created.id }),
      });
      const codeData = await codeRes.json();
      if (!codeData.ok) throw new Error(codeData.error ?? 'Failed to generate code');

      setInvitedName(inviteName.trim());
      setInviteCode(codeData.code);
      setStep('code');
    } catch (e: any) {
      setInviteError(e?.message ?? 'Something went wrong');
    } finally {
      setInvitingMember(false);
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Join our family on Family Cube! Use invite code ${inviteCode} to set up ${invitedName || 'your'} profile.\n\nValid for 7 days.`,
      });
    } catch {}
  };

  // Close the picker sheet fully before launching the native camera/library
  // UI — stacking a second native picker on top of a still-visible RN
  // <Modal> sheet is a known iOS freeze/deadlock (same ordering
  // ProfileSettingsScreen.tsx's own pickPhoto uses).
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

  const card = colors.card ?? colors.surface;

  if (checkingExisting) {
    return (
      <View style={[s.root, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

            {/* No back button/gesture past 'pin' — the family + parent
                member already exist in the DB by the time 'invite'/'code'
                render (handleCreate already ran), so "going back" to
                Family/Profile/PIN would be re-editing state that's already
                committed, not actually undoing anything. Matches the
                gestureEnabled:false set on this route in app/_layout.tsx. */}
            {step !== 'invite' && step !== 'code' && (
              <TouchableOpacity style={s.back} onPress={() => {
                const prev: Record<Step, Step | null> = { family: null, profile: 'family', pin: 'profile', invite: null, code: null };
                const p = prev[step];
                if (p) setStep(p); else router.back();
              }}>
                <Text style={[s.backText, { color: colors.textSecondary }]}>← Back</Text>
              </TouchableOpacity>
            )}

            {step !== 'invite' && step !== 'code' && <StepDots step={step} colors={colors} />}

            {/* ── STEP 1: Family + name ──────────────────────────────────────── */}
            {step === 'family' && (
              <View style={s.center}>
                <NewFamilySvg colors={colors} />
                <Text style={[s.title, { color: colors.textPrimary }]}>Create Your Family</Text>
                <Text style={[s.subtitle, { color: colors.textSecondary }]}>
                  Set up your family space. You'll get a code to invite everyone else.
                </Text>
                <Text style={[s.label, { color: colors.textSecondary }]}>Family name</Text>
                <TextInput
                  style={[s.input, { color: colors.textPrimary, backgroundColor: card, borderColor: colors.border ?? '#E0E0E0' }]}
                  value={familyName}
                  onChangeText={t => { setFamilyName(t); setError(''); }}
                  placeholder="e.g. The Johnson Family"
                  placeholderTextColor={colors.textSecondary}
                  autoFocus
                />
                <Text style={[s.label, { color: colors.textSecondary }]}>Your name</Text>
                <TextInput
                  style={[s.input, { color: colors.textPrimary, backgroundColor: card, borderColor: colors.border ?? '#E0E0E0' }]}
                  value={name}
                  onChangeText={t => { setName(t); setError(''); }}
                  placeholder="e.g. Sarah"
                  placeholderTextColor={colors.textSecondary}
                />
                {error ? <Text style={s.error}>{error}</Text> : null}
                <TouchableOpacity style={[s.btn, { backgroundColor: colors.primary }]} onPress={handleFamilyNext}>
                  <Text style={s.btnText}>Next — Pick Avatar</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── STEP 2: Avatar + color ─────────────────────────────────────── */}
            {step === 'profile' && (
              <View>
                <View style={s.center}>
                  <TouchableOpacity
                    onPress={() => setShowPhotoPicker(true)}
                    style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: color + '33', borderWidth: 3, borderColor: color, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
                  >
                    {photoUri
                      ? <Image source={{ uri: photoUri }} style={{ width: 80, height: 80 }} />
                      : <Text style={{ fontSize: 38 }}>{avatar}</Text>}
                  </TouchableOpacity>
                  <Text style={[s.title, { color: colors.textPrimary }]}>Your Avatar</Text>
                  <TouchableOpacity onPress={() => setShowPhotoPicker(true)}>
                    <Text style={{ color: colors.primary, fontWeight: '700', fontSize: TYPO.caption, marginTop: -4, marginBottom: 8 }}>
                      📷 Use a photo instead
                    </Text>
                  </TouchableOpacity>
                </View>
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
                <Text style={[s.label, { color: colors.textSecondary }]}>Profile color</Text>
                <View style={s.colorRow}>
                  {COLORS.map(c => (
                    <TouchableOpacity key={c} style={[s.colorDot, { backgroundColor: c }, color === c && s.colorDotActive]} onPress={() => setColor(c)} />
                  ))}
                </View>
                <TouchableOpacity style={[s.btn, { backgroundColor: colors.primary }]} onPress={handleProfileNext}>
                  <Text style={s.btnText}>Next — Set PIN</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── STEP 3: PIN ────────────────────────────────────────────────── */}
            {step === 'pin' && (
              <View style={s.center}>
                <PinLockSvg colors={colors} />
                <Text style={[s.title, { color: colors.textPrimary }]}>Set Your PIN</Text>
                <Text style={[s.subtitle, { color: colors.textSecondary }]}>
                  A 4-digit PIN lets you switch profiles securely on any device.
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
                  <TouchableOpacity style={[s.btn, { backgroundColor: colors.primary, marginTop: 20 }]} onPress={handleCreate} disabled={loading}>
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Create Family 🏠</Text>}
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* ── STEP 4: Invite your first family member ─────────────────────── */}
            {step === 'invite' && (
              <View style={s.center}>
                <AnimatedCubeMark size={84} />
                <Text style={[s.title, { color: colors.textPrimary }]}>Family Created!</Text>
                <Text style={[s.subtitle, { color: colors.textSecondary }]}>
                  Add one family member now to get their invite code — you can add more later from Profile.
                </Text>
                <Text style={[s.label, { color: colors.textSecondary }]}>Their name</Text>
                <TextInput
                  style={[s.input, { color: colors.textPrimary, backgroundColor: card, borderColor: colors.border ?? '#E0E0E0' }]}
                  value={inviteName}
                  onChangeText={t => { setInviteName(t); setInviteError(''); }}
                  placeholder="e.g. Emma"
                  placeholderTextColor={colors.textSecondary}
                  autoFocus
                />
                <Text style={[s.label, { color: colors.textSecondary }]}>They are a…</Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  {INVITE_ROLES.map(r => (
                    <TouchableOpacity
                      key={r.value}
                      onPress={() => { setInviteRole(r.value); setInviteRelationship(undefined); }}
                      style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1.5,
                        backgroundColor: inviteRole === r.value ? colors.primary : card,
                        borderColor: inviteRole === r.value ? colors.primary : colors.border ?? '#E0E0E0' }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: inviteRole === r.value ? '#fff' : colors.textSecondary }}>
                        {r.emoji} {r.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {(RELATIONSHIPS_BY_ROLE[inviteRole] ?? []).length > 0 && (
                  <>
                    <Text style={[s.label, { color: colors.textSecondary }]}>Relationship <Text style={{ fontWeight: '400' }}>(optional)</Text></Text>
                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                      {(RELATIONSHIPS_BY_ROLE[inviteRole] ?? []).map(opt => {
                        const picked = inviteRelationship === opt;
                        return (
                          <TouchableOpacity key={opt} onPress={() => setInviteRelationship(picked ? undefined : opt)}
                            style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1.5,
                              backgroundColor: picked ? colors.primary : card,
                              borderColor: picked ? colors.primary : colors.border ?? '#E0E0E0' }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: picked ? '#fff' : colors.textSecondary }}>{opt}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                )}
                {inviteError ? <Text style={s.error}>{inviteError}</Text> : null}
                <TouchableOpacity style={[s.btn, { backgroundColor: colors.primary, marginTop: 12 }]} onPress={handleInvite} disabled={invitingMember}>
                  {invitingMember ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Get Their Invite Code →</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={{ marginTop: 14 }} onPress={() => router.replace('/onboarding/complete-profile')}>
                  <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: TYPO.caption }}>Skip for now — I'll invite people later</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── STEP 5: Invite code ────────────────────────────────────────── */}
            {step === 'code' && (
              <View style={s.center}>
                <AnimatedCubeMark size={84} />
                <Text style={[s.title, { color: colors.textPrimary }]}>Code Ready!</Text>
                <Text style={[s.subtitle, { color: colors.textSecondary }]}>
                  Send this to {invitedName || 'them'} — they'll enter it to set up their own profile.
                </Text>
                <CodeRevealSvg code={inviteCode} colors={colors} />
                <TouchableOpacity style={[s.btn, { backgroundColor: colors.primary, marginTop: 24 }]} onPress={handleShare}>
                  <Text style={s.btnText}>📤 Share Code</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn, { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.primary, marginTop: 10 }]} onPress={() => router.replace('/onboarding/complete-profile')}>
                  <Text style={[s.btnText, { color: colors.primary }]}>Enter App →</Text>
                </TouchableOpacity>
                <Text style={[{ color: colors.textSecondary, fontSize: 12, marginTop: 16, textAlign: 'center' }]}>
                  You can invite more people anytime from Profile
                </Text>
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

const s = StyleSheet.create({
  root:         { flex: 1 },
  safe:         { flex: 1 },
  scroll:       { paddingHorizontal: 22, paddingBottom: 40 },
  back:         { paddingTop: 10, paddingBottom: 4 },
  backText:     { fontSize: 15 },
  center:       { alignItems: 'center', marginBottom: 16 },
  title:        { fontSize: 26, fontWeight: '800', textAlign: 'center', marginTop: 16, marginBottom: 8 },
  subtitle:     { fontSize: TYPO.body, textAlign: 'center', lineHeight: 22, opacity: 0.75, marginBottom: 20 },
  label:        { fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 18, textTransform: 'uppercase', letterSpacing: 0.5, alignSelf: 'flex-start' },
  input:        { borderRadius: 14, borderWidth: 1.5, padding: 14, fontSize: 16, width: '100%', marginBottom: 4 },
  emojiGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  emojiBtn:     { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  colorRow:     { flexDirection: 'row', gap: 12, marginBottom: 24 },
  colorDot:     { width: 32, height: 32, borderRadius: 16 },
  colorDotActive: { borderWidth: 3, borderColor: '#fff', transform: [{ scale: 1.15 }], shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4 },
  btn:          { borderRadius: 16, paddingVertical: 15, paddingHorizontal: 28, alignItems: 'center', marginTop: 12, minWidth: 220 },
  btnText:      { color: '#fff', fontSize: 16, fontWeight: '700' },
  error:        { color: '#EF4444', fontSize: 13, textAlign: 'center', marginTop: 8 },
});

const ps = StyleSheet.create({
  pad:          { flexDirection: 'row', flexWrap: 'wrap', width: 240, justifyContent: 'center', gap: 12, marginTop: 4 },
  padKey:       { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  padEmpty:     { width: 68, height: 68 },
  padKeyText:   { fontSize: 22, fontWeight: '700' },
});
