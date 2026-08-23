// MemberInviteScreen — accept a household member_invitations email invite.
// Modeled on features/social/screens/InviteScreen.tsx's load-then-gate
// structure, adapted to members/families: unlike that screen (which joins
// an existing profile to a pet's care team), accepting here CREATES a
// brand-new members row stamped with the accepting user's own real
// auth_user_id — a genuinely independent household login, distinct from
// the shared-session PIN-profile model every other member uses today.
import { showAlert } from '@/components/AppAlert';
import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { SPACING, RADIUS, TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';

interface InviteData {
  id: string;
  family_id: string;
  email: string;
  role: 'parent' | 'child' | 'teenager' | 'grandparent';
  status: string;
  message: string | null;
  expires_at: string;
  families?: { name: string };
}

const ROLE_LABEL: Record<string, string> = {
  parent: 'Parent', child: 'Kid', teenager: 'Teen', grandparent: 'Grandparent',
};

export default function MemberInviteScreen() {
  const { token: rawToken } = useLocalSearchParams<{ token: string | string[] }>();
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const setMembers = useFamilyStore(st => st.setMembers);
  const setActiveMember = useFamilyStore(st => st.setActiveMember);
  const members = useFamilyStore(st => st.members);

  const [invite, setInvite] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  useEffect(() => { if (token) loadInvite(); }, [token]);

  const loadInvite = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUserEmail(user?.email ?? null);

    const { data, error: err } = await supabase
      .from('member_invitations')
      .select('*, families(name)')
      .eq('token', token)
      .single();

    if (err || !data) {
      setError('This invitation link is invalid or has expired.');
      setLoading(false);
      return;
    }
    if (data.status === 'expired' || new Date(data.expires_at) < new Date()) {
      setError('This invitation has expired. Ask them for a new one.');
      setLoading(false);
      return;
    }
    if (data.status === 'revoked') {
      setError('This invitation was revoked.');
      setLoading(false);
      return;
    }
    if (data.status === 'accepted') {
      setError('This invitation has already been accepted.');
      setLoading(false);
      return;
    }

    setInvite(data as InviteData);
    setLoading(false);
  };

  const handleAccept = async () => {
    if (!invite) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !user.email) {
      showAlert(
        'Sign in required',
        'You need your own account with an email address to accept this invitation.',
        [
          { text: 'Sign in', onPress: () => router.replace('/(auth)/login') },
          { text: 'Create account', onPress: () => router.replace('/(auth)/signup') },
        ]
      );
      return;
    }

    if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
      showAlert(
        'Wrong account',
        `This invitation was sent to ${invite.email}. Please sign in with that email to accept it.`,
      );
      return;
    }

    setAccepting(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setAccepting(false);
      showAlert('Sign in required', 'Please sign in again to accept this invitation.');
      return;
    }

    // Prefill from account info — no second profile-setup wizard, matching
    // JoinFamilyScreen's philosophy but skipping its extra steps here.
    const displayName = (user.user_metadata?.full_name as string | undefined) || user.email.split('@')[0];

    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
    const anonKey     = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
    const res = await fetch(`${supabaseUrl}/functions/v1/accept-member-invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ token, name: displayName }),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json.ok) {
      setAccepting(false);
      showAlert('Error', json?.error ?? 'Could not join this family. Please try again.');
      return;
    }

    setAccepting(false);

    const newMember = {
      id: json.member.id, name: json.member.name, role:
        json.member.role === 'child' ? 'kid' : json.member.role === 'teenager' ? 'teen' : json.member.role === 'grandparent' ? 'senior' : 'parent',
      emoji: json.member.avatar, coins: json.member.coins ?? 0, mainCoins: json.member.coins ?? 0, gpCoins: 0,
      xp: json.member.xp ?? 0, streak: 0, level: json.member.level ?? 1,
      questsCompleted: 0, questsPending: 0, familyId: json.familyId, email: json.member.email,
    } as const;
    setMembers([...members.filter(m => m.id !== newMember.id), newMember as any]);
    setActiveMember(newMember.id);

    showAlert(
      `Welcome to ${invite.families?.name ?? 'the family'}! 🎉`,
      'You can now log in on your own device anytime — no PIN needed.',
      [{ text: "Let's go!", onPress: () => router.replace('/(tabs)') }]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <ActivityIndicator size="large" color={BRAND.purple} />
          <Text style={s.loadingText}>Loading invitation…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !invite) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <Text style={s.errorEmoji}>😕</Text>
          <Text style={s.errorTitle}>Invitation not found</Text>
          <Text style={s.errorText}>{error ?? 'Something went wrong.'}</Text>
          <TouchableOpacity style={s.homeBtn} onPress={() => router.replace('/(tabs)')}>
            <Text style={s.homeBtnText}>Go to Family Cube</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <Text style={s.logo}>🧩</Text>
        <Text style={s.appName}>Family Cube</Text>

        <View style={s.card}>
          <Text style={s.inviteTitle}>You're invited!</Text>
          <Text style={s.inviteDesc}>
            You've been invited to join{' '}
            <Text style={s.inviteHighlight}>{invite.families?.name ?? 'a family'}</Text>{' '}
            on Family Cube — with your own login, on your own device.
          </Text>

          {invite.message && (
            <View style={s.messageBox}>
              <Text style={s.messageLabel}>Personal message:</Text>
              <Text style={s.messageText}>"{invite.message}"</Text>
            </View>
          )}

          <View style={s.roleCard}>
            <Text style={s.roleEmoji}>👤</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.roleTitle}>Your role: {ROLE_LABEL[invite.role] ?? invite.role}</Text>
              <Text style={s.roleSub}>No PIN needed — just sign in with your own account anytime.</Text>
            </View>
          </View>

          {currentUserEmail && (
            <View style={s.emailRow}>
              <Text style={s.emailLabel}>Signing in as</Text>
              <Text style={s.emailValue}>{currentUserEmail}</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[s.acceptBtn, accepting && { opacity: 0.7 }]}
          onPress={handleAccept}
          disabled={accepting}
        >
          {accepting
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.acceptBtnText}>✅ Accept & join the family</Text>}
        </TouchableOpacity>

        {!currentUserEmail && (
          <Text style={s.signInHint}>
            You'll need to sign in or create a free account to accept.
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xxl },
  container: { flex: 1, padding: SPACING.xl, alignItems: 'center', justifyContent: 'center' },

  logo: { fontSize: 52, marginBottom: 4 },
  appName: { fontSize: TYPO.hero, fontWeight: '700', color: colors.primaryText ?? colors.primary, marginBottom: SPACING.xl, letterSpacing: -0.5 },

  card: { width: '100%', backgroundColor: colors.card, borderRadius: RADIUS.xl, padding: SPACING.xl, alignItems: 'center', gap: SPACING.md, borderWidth: 0.5, borderColor: colors.border, marginBottom: SPACING.xl },
  inviteTitle: { fontSize: TYPO.title, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.5 },
  inviteDesc: { fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  inviteHighlight: { color: colors.textPrimary, fontWeight: '600' },

  messageBox: { backgroundColor: colors.background, borderRadius: RADIUS.md, padding: SPACING.md, width: '100%' },
  messageLabel: { fontSize: TYPO.body, color: colors.textSecondary, fontWeight: '500', marginBottom: 4 },
  messageText: { fontSize: TYPO.body, color: colors.textSecondary, fontStyle: 'italic', lineHeight: 19 },

  roleCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: colors.primaryLight, borderRadius: RADIUS.md, padding: SPACING.md, width: '100%' },
  roleEmoji: { fontSize: TYPO.title, marginTop: 2 },
  roleTitle: { fontSize: TYPO.body, fontWeight: '600', color: colors.textPrimary },
  roleSub: { fontSize: TYPO.body, color: colors.textSecondary, marginTop: 4, lineHeight: 17 },

  emailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  emailLabel: { fontSize: TYPO.body, color: colors.textSecondary },
  emailValue: { fontSize: TYPO.body, fontWeight: '500', color: colors.textSecondary },

  acceptBtn: { width: '100%', height: 54, backgroundColor: BRAND.purple, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm, shadowColor: BRAND.purple, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  acceptBtnText: { color: '#fff', fontSize: TYPO.subheading, fontWeight: '700' },
  signInHint: { fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center', marginTop: SPACING.lg, lineHeight: 18 },

  loadingText: { fontSize: TYPO.body, color: colors.textSecondary, marginTop: SPACING.md },
  errorEmoji: { fontSize: 48, marginBottom: SPACING.md },
  errorTitle: { fontSize: TYPO.heading, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  errorText: { fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: SPACING.xl },
  homeBtn: { backgroundColor: BRAND.purple, paddingHorizontal: 32, paddingVertical: 12, borderRadius: RADIUS.md },
  homeBtnText: { color: '#fff', fontSize: TYPO.body, fontWeight: '600' },
});
