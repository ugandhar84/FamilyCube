/**
 * JoinFamilyScreen — Kid/grandparent enters invite code, picks their profile,
 * then sets a mandatory PIN. No Supabase Auth account required.
 */
import { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert, ActivityIndicator, Dimensions, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useFamilyStore } from '@/store/familyStore';
import { registerForPushNotifications } from '@/lib/notifications';
import Svg, { Circle, Path, Rect, G, Polygon, Ellipse } from 'react-native-svg';

const { width } = Dimensions.get('window');

const AVATARS = ['🧒','👦','👧','🧑','👩','👨','🧓','👴','👵','🦸','🧙','🧜','🦊','🐶','🐱','⭐'];
const COLORS  = ['#9261C7','#10B981','#F59E0B','#EF4444','#3B82F6','#EC4899','#14B8A6','#8B5CF6'];
const ROLES   = [
  { value: 'kid',         label: 'Kid',          emoji: '🧒', desc: 'Complete quests & earn coins' },
  { value: 'parent',      label: 'Parent',        emoji: '👩', desc: 'Manage quests & approve tasks' },
  { value: 'grandparent', label: 'Grandparent',   emoji: '👴', desc: 'View & support the family' },
];

type Step = 'code' | 'profile' | 'pin' | 'confirm';

// ─── Step SVGs ────────────────────────────────────────────────────────────────
function CodeSvg() {
  return (
    <Svg width="90" height="90" viewBox="0 0 90 90">
      <Circle cx="45" cy="45" r="45" fill="#E8F5E9" />
      <Rect x="20" y="30" width="50" height="36" rx="7" fill="#10B981" />
      <Rect x="28" y="40" width="10" height="10" rx="3" fill="#fff" />
      <Rect x="40" y="40" width="10" height="10" rx="3" fill="#fff" />
      <Rect x="52" y="40" width="10" height="10" rx="3" fill="#fff" />
      <Rect x="28" y="53" width="34" height="4" rx="2" fill="rgba(255,255,255,0.4)" />
    </Svg>
  );
}

function ProfileSvg({ avatar, color }: { avatar: string; color: string }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: 90, height: 90,
      borderRadius: 45, backgroundColor: color + '22', borderWidth: 3, borderColor: color }}>
      <Text style={{ fontSize: 44 }}>{avatar}</Text>
    </View>
  );
}

function PinSvg() {
  return (
    <Svg width="90" height="90" viewBox="0 0 90 90">
      <Circle cx="45" cy="45" r="45" fill="#F0E8FA" />
      <Rect x="22" y="42" width="46" height="30" rx="7" fill="#9261C7" />
      <Path d="M32 42 V34 A13 13 0 0 1 58 34 V42" stroke="#9261C7" strokeWidth="5" fill="none" strokeLinecap="round" />
      <Circle cx="45" cy="57" r="5" fill="#fff" opacity="0.9" />
      <Rect x="43" y="57" width="4" height="7" rx="2" fill="#fff" opacity="0.6" />
    </Svg>
  );
}

// ─── Step indicator ────────────────────────────────────────────────────────────
function StepDots({ step }: { step: Step }) {
  const steps: Step[] = ['code', 'profile', 'pin'];
  return (
    <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 28 }}>
      {steps.map((s, i) => (
        <View key={s} style={{
          width: s === step ? 24 : 8, height: 8, borderRadius: 4,
          backgroundColor: s === step ? '#9261C7' : steps.indexOf(step) > i ? '#C4A0EC' : '#E0E0E0',
        }} />
      ))}
    </View>
  );
}

export default function JoinFamilyScreen() {
  const { colors, isDark } = useTheme();
  const [step, setStep]         = useState<Step>('code');
  const [code, setCode]         = useState('');
  const [name, setName]         = useState('');
  const [avatar, setAvatar]     = useState('🧒');
  const [color, setColor]       = useState('#9261C7');
  const [role, setRole]         = useState<string>('kid');
  const [pin, setPin]           = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [familyName, setFamilyName] = useState('');

  const setMembers    = useFamilyStore(s => s.setMembers);
  const setActiveMem  = useFamilyStore(s => s.setActiveMember);

  // ── Step 1: Validate code ────────────────────────────────────────────────────
  const handleCodeNext = () => {
    if (code.trim().length !== 6) { setError('Enter the 6-digit code'); return; }
    setError('');
    setStep('profile');
  };

  // ── Step 2: Profile complete ─────────────────────────────────────────────────
  const handleProfileNext = () => {
    if (!name.trim()) { setError('Enter your name'); return; }
    setError('');
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

      // This device already has a real Supabase Auth session (app/_layout.tsx
      // gates onboarding on it) — pass its access token so join-family can
      // stamp auth_user_id on the new member row. Without this, the member
      // row has no auth_user_id and every RLS-gated write they make (or that
      // gets made on their behalf) fails silently. See migration
      // 20260818192700 for why this is the actual identity RLS checks.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in');

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

      // Save PIN on the member row
      await supabase.from('members').update({ pin }).eq('id', data.memberId);

      // Load member into familyStore and set active
      const member = {
        id:         data.member.id,
        name:       data.member.name,
        role:       data.member.role as any,
        avatar:     data.member.avatar,
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
      };
      setMembers([member]);
      setActiveMem(member.id);

      setStep('confirm');
    } catch (e: any) {
      setError(e?.message ?? 'Network error. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const bg = colors.background;
  const card = colors.card ?? colors.surface;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.root, { backgroundColor: bg }]}>
        <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

            {/* Back */}
            {step !== 'confirm' && (
              <TouchableOpacity style={s.back} onPress={() => step === 'code' ? router.back() : setStep(step === 'pin' ? 'profile' : 'code')}>
                <Text style={[s.backText, { color: colors.textSecondary }]}>← Back</Text>
              </TouchableOpacity>
            )}

            {step !== 'confirm' && <StepDots step={step} />}

            {/* ── STEP 1: Enter Code ─────────────────────────────────────────── */}
            {step === 'code' && (
              <View style={s.center}>
                <CodeSvg />
                <Text style={[s.title, { color: colors.textPrimary }]}>Enter Invite Code</Text>
                <Text style={[s.subtitle, { color: colors.textSecondary }]}>
                  Ask a parent for the 6-digit code shown in their Family Settings.
                </Text>
                <TextInput
                  style={[s.codeInput, { color: colors.textPrimary, backgroundColor: card, borderColor: code.length === 6 ? '#10B981' : colors.border ?? '#E0E0E0' }]}
                  value={code}
                  onChangeText={t => { setCode(t.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="— — — — — —"
                  placeholderTextColor={colors.textSecondary}
                  textAlign="center"
                />
                {error ? <Text style={s.error}>{error}</Text> : null}
                <TouchableOpacity
                  style={[s.btn, { backgroundColor: code.length === 6 ? '#10B981' : '#ccc' }]}
                  onPress={handleCodeNext}
                  disabled={code.length !== 6}
                >
                  <Text style={s.btnText}>Continue</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── STEP 2: Pick Profile ───────────────────────────────────────── */}
            {step === 'profile' && (
              <View>
                <View style={s.center}>
                  <ProfileSvg avatar={avatar} color={color} />
                  <Text style={[s.title, { color: colors.textPrimary }]}>Create Your Profile</Text>
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
                      style={[s.roleCard, { backgroundColor: card, borderColor: role === r.value ? '#9261C7' : colors.border ?? '#E0E0E0', borderWidth: role === r.value ? 2 : 1 }]}
                      onPress={() => setRole(r.value)}
                    >
                      <Text style={{ fontSize: 22 }}>{r.emoji}</Text>
                      <Text style={[s.roleLabel, { color: colors.textPrimary }]}>{r.label}</Text>
                      <Text style={[s.roleDesc, { color: colors.textSecondary }]}>{r.desc}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

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
                <TouchableOpacity style={[s.btn, { backgroundColor: '#9261C7' }]} onPress={handleProfileNext}>
                  <Text style={s.btnText}>Next — Set Your PIN</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── STEP 3: Set PIN ────────────────────────────────────────────── */}
            {step === 'pin' && (
              <View style={s.center}>
                <PinSvg />
                <Text style={[s.title, { color: colors.textPrimary }]}>Set Your PIN</Text>
                <Text style={[s.subtitle, { color: colors.textSecondary }]}>
                  Your 4-digit PIN protects your profile when switching members on a shared device.
                </Text>
                <Text style={[s.label, { color: colors.textSecondary }]}>Create PIN</Text>
                <PinDots value={pin} />
                <PinPad value={pin} onChange={setPin} />

                {pin.length === 4 && (
                  <>
                    <Text style={[s.label, { color: colors.textSecondary, marginTop: 20 }]}>Confirm PIN</Text>
                    <PinDots value={pinConfirm} />
                    <PinPad value={pinConfirm} onChange={setPinConfirm} />
                  </>
                )}

                {error ? <Text style={s.error}>{error}</Text> : null}

                {pin.length === 4 && pinConfirm.length === 4 && (
                  <TouchableOpacity
                    style={[s.btn, { backgroundColor: '#9261C7', marginTop: 20 }]}
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
                <Text style={{ fontSize: 72, marginBottom: 12 }}>🎉</Text>
                <Text style={[s.title, { color: colors.textPrimary }]}>You're in!</Text>
                <Text style={[s.subtitle, { color: colors.textSecondary }]}>
                  Welcome to <Text style={{ color: '#9261C7', fontWeight: '700' }}>{familyName}</Text>!{'\n'}
                  You joined as <Text style={{ fontWeight: '700' }}>{name}</Text> {avatar}
                </Text>
                <TouchableOpacity
                  style={[s.btn, { backgroundColor: '#9261C7', marginTop: 32 }]}
                  onPress={() => router.replace('/(tabs)')}
                >
                  <Text style={s.btnText}>Let's Go →</Text>
                </TouchableOpacity>
              </View>
            )}

          </ScrollView>
        </SafeAreaView>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── PIN dot indicator ────────────────────────────────────────────────────────
function PinDots({ value }: { value: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 14, justifyContent: 'center', marginVertical: 14 }}>
      {[0, 1, 2, 3].map(i => (
        <View key={i} style={{
          width: 18, height: 18, borderRadius: 9,
          backgroundColor: i < value.length ? '#9261C7' : 'transparent',
          borderWidth: 2, borderColor: '#9261C7',
        }} />
      ))}
    </View>
  );
}

// ─── PIN numpad ───────────────────────────────────────────────────────────────
function PinPad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  return (
    <View style={s.pad}>
      {keys.map((k, i) => k === '' ? (
        <View key={i} style={s.padEmpty} />
      ) : (
        <TouchableOpacity
          key={i}
          style={s.padKey}
          onPress={() => {
            if (k === '⌫') onChange(value.slice(0, -1));
            else if (value.length < 4) onChange(value + k);
          }}
          disabled={value.length === 4 && k !== '⌫'}
        >
          <Text style={s.padKeyText}>{k}</Text>
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
  padKey:       { width: 68, height: 68, borderRadius: 34, backgroundColor: '#F0E8FA', alignItems: 'center', justifyContent: 'center' },
  padEmpty:     { width: 68, height: 68 },
  padKeyText:   { fontSize: 22, fontWeight: '700', color: '#9261C7' },
});
