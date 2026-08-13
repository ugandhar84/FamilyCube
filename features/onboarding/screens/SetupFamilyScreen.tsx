/**
 * SetupFamilyScreen — Parent creates the family, sets their own profile + PIN,
 * then gets the 6-digit invite code to share with family members.
 */
import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Alert, Dimensions, KeyboardAvoidingView, Platform, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useFamilyStore } from '@/store/familyStore';
import { registerForPushNotifications } from '@/lib/notifications';
import Svg, { Circle, Path, Rect, Polygon, Ellipse, G } from 'react-native-svg';

const { width } = Dimensions.get('window');

const AVATARS = ['👩','👨','🧑','👩‍💼','👨‍💼','🦸‍♀️','🦸‍♂️','🧙‍♀️','🧙‍♂️','🧑‍🏫','🧑‍🍳','🌟'];
const COLORS  = ['#9261C7','#10B981','#F59E0B','#EF4444','#3B82F6','#EC4899','#14B8A6','#8B5CF6'];

type Step = 'family' | 'profile' | 'pin' | 'code';

function FamilySvg() {
  return (
    <Svg width="90" height="90" viewBox="0 0 90 90">
      <Circle cx="45" cy="45" r="45" fill="#F0E8FA" />
      <Polygon points="25,52 45,28 65,52" fill="#9261C7" />
      <Rect x="30" y="52" width="30" height="24" rx="3" fill="#C4A0EC" />
      <Rect x="39" y="62" width="12" height="14" rx="3" fill="#9261C7" />
      <Rect x="31" y="55" width="8" height="7" rx="2" fill="#F0E8FA" />
      <Rect x="51" y="55" width="8" height="7" rx="2" fill="#F0E8FA" />
    </Svg>
  );
}

function CodeRevealSvg({ code }: { code: string }) {
  return (
    <View style={{
      borderRadius: 20, backgroundColor: '#9261C7', paddingVertical: 20, paddingHorizontal: 28,
      alignItems: 'center', shadowColor: '#9261C7', shadowOpacity: 0.35, shadowRadius: 14,
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

function StepDots({ step }: { step: Step }) {
  const steps: Step[] = ['family', 'profile', 'pin', 'code'];
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

function PinPad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  return (
    <View style={ps.pad}>
      {keys.map((k, i) => k === '' ? (
        <View key={i} style={ps.padEmpty} />
      ) : (
        <TouchableOpacity
          key={i}
          style={ps.padKey}
          onPress={() => {
            if (k === '⌫') onChange(value.slice(0, -1));
            else if (value.length < 4) onChange(value + k);
          }}
          disabled={value.length === 4 && k !== '⌫'}
        >
          <Text style={ps.padKeyText}>{k}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function SetupFamilyScreen() {
  const { colors } = useTheme();
  const [step, setStep]             = useState<Step>('family');
  const [familyName, setFamilyName] = useState('');
  const [name, setName]             = useState('');
  const [avatar, setAvatar]         = useState('👩');
  const [color, setColor]           = useState('#9261C7');
  const [pin, setPin]               = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  const setMembers   = useFamilyStore(s => s.setMembers);
  const setActiveMem = useFamilyStore(s => s.setActiveMember);

  const handleFamilyNext = () => {
    if (!familyName.trim()) { setError('Enter a family name'); return; }
    if (!name.trim()) { setError('Enter your name'); return; }
    setError('');
    setStep('profile');
  };

  const handleProfileNext = () => {
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

      const expoPushToken = await registerForPushNotifications().catch(() => null);

      // 1. Create family
      const { data: family, error: famErr } = await supabase
        .from('families')
        .insert({ name: familyName.trim(), created_by: user.id })
        .select()
        .single();
      if (famErr || !family) throw new Error(famErr?.message ?? 'Failed to create family');

      // 2. Create parent member
      const memberId = crypto.randomUUID();
      const { error: memErr } = await supabase.from('members').insert({
        id:              memberId,
        name:            name.trim(),
        role:            'parent',
        avatar,
        color,
        family_id:       family.id,
        coins:           0, xp: 0, level: 1, max_xp: 100, streak: 0,
        pin,
        expo_push_token: expoPushToken ?? null,
        last_active:     new Date().toISOString(),
      });
      if (memErr) throw new Error(memErr.message);

      // 3. Generate invite code via edge function
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
      const anonKey     = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
      const codeRes = await fetch(`${supabaseUrl}/functions/v1/generate-invite-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': anonKey },
        body: JSON.stringify({ familyId: family.id, memberId }),
      });
      const codeData = await codeRes.json();
      if (!codeData.ok) throw new Error(codeData.error ?? 'Failed to generate code');

      setInviteCode(codeData.code);

      // 4. Load into store
      const member = {
        id: memberId, name: name.trim(), role: 'parent' as any,
        avatar, color, coins: 0, mainCoins: 0, gpCoins: 0, xp: 0, level: 1, maxXp: 100,
        streak: 0, pin, pinEnabled: true, familyId: family.id,
        timezone: 'America/New_York', title: 'Explorer',
        questsCompleted: 0, questsPending: 0,
      };
      setMembers([member]);
      setActiveMem(memberId);

      setStep('code');
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Join our family on FamilyCube! 🏠\n\nDownload the app and enter code: ${inviteCode}\n\nValid for 7 days.`,
      });
    } catch {}
  };

  const card = colors.card ?? colors.surface;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

            {step !== 'code' && (
              <TouchableOpacity style={s.back} onPress={() => {
                const prev: Record<Step, Step | null> = { family: null, profile: 'family', pin: 'profile', code: 'pin' };
                const p = prev[step];
                if (p) setStep(p); else router.back();
              }}>
                <Text style={[s.backText, { color: colors.textSecondary }]}>← Back</Text>
              </TouchableOpacity>
            )}

            {step !== 'code' && <StepDots step={step} />}

            {/* ── STEP 1: Family + name ──────────────────────────────────────── */}
            {step === 'family' && (
              <View style={s.center}>
                <FamilySvg />
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
                <TouchableOpacity style={[s.btn, { backgroundColor: '#9261C7' }]} onPress={handleFamilyNext}>
                  <Text style={s.btnText}>Next — Pick Avatar</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── STEP 2: Avatar + color ─────────────────────────────────────── */}
            {step === 'profile' && (
              <View>
                <View style={s.center}>
                  <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: color + '33', borderWidth: 3, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 38 }}>{avatar}</Text>
                  </View>
                  <Text style={[s.title, { color: colors.textPrimary }]}>Your Avatar</Text>
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
                <TouchableOpacity style={[s.btn, { backgroundColor: '#9261C7' }]} onPress={handleProfileNext}>
                  <Text style={s.btnText}>Next — Set PIN</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── STEP 3: PIN ────────────────────────────────────────────────── */}
            {step === 'pin' && (
              <View style={s.center}>
                <Text style={{ fontSize: 64, marginBottom: 4 }}>🔐</Text>
                <Text style={[s.title, { color: colors.textPrimary }]}>Set Your PIN</Text>
                <Text style={[s.subtitle, { color: colors.textSecondary }]}>
                  A 4-digit PIN lets you switch profiles securely on any device.
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
                  <TouchableOpacity style={[s.btn, { backgroundColor: '#9261C7', marginTop: 20 }]} onPress={handleCreate} disabled={loading}>
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Create Family 🏠</Text>}
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* ── STEP 4: Invite code ────────────────────────────────────────── */}
            {step === 'code' && (
              <View style={s.center}>
                <Text style={{ fontSize: 64, marginBottom: 8 }}>🎉</Text>
                <Text style={[s.title, { color: colors.textPrimary }]}>Family Created!</Text>
                <Text style={[s.subtitle, { color: colors.textSecondary }]}>
                  Share this code with your family members.{'\n'}They enter it when they first open the app.
                </Text>
                <CodeRevealSvg code={inviteCode} />
                <TouchableOpacity style={[s.btn, { backgroundColor: '#9261C7', marginTop: 24 }]} onPress={handleShare}>
                  <Text style={s.btnText}>📤 Share Code</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn, { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#9261C7', marginTop: 10 }]} onPress={() => router.replace('/(tabs)')}>
                  <Text style={[s.btnText, { color: '#9261C7' }]}>Enter App →</Text>
                </TouchableOpacity>
                <Text style={[{ color: colors.textSecondary, fontSize: 12, marginTop: 16, textAlign: 'center' }]}>
                  You can always find this code in Family Settings
                </Text>
              </View>
            )}

          </ScrollView>
        </SafeAreaView>
      </View>
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
  padKey:       { width: 68, height: 68, borderRadius: 34, backgroundColor: '#F0E8FA', alignItems: 'center', justifyContent: 'center' },
  padEmpty:     { width: 68, height: 68 },
  padKeyText:   { fontSize: 22, fontWeight: '700', color: '#9261C7' },
});
