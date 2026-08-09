import { showAlert } from '@/components/AppAlert';
import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { declineInvite } from '@/lib/db';
import { useTheme } from '@/lib/ThemeContext';
import { SPACING, RADIUS, TYPO} from '@/constants/theme';
import PawBondLoader from '@/components/PawBondLoader';

interface InviteData {
  id: string;
  pet_id: string;
  email: string;
  role: string;
  status: string;
  message: string | null;
  expires_at: string;
  pets?: { name: string; emoji: string; species: string };
  profiles?: { full_name: string | null };
}

export default function AcceptInviteScreen() {
  const { token: rawToken } = useLocalSearchParams<{ token: string | string[] }>();
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [invite, setInvite] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  useEffect(() => {
    if (token) loadInvite();
  }, [token]);

  const loadInvite = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUserEmail(user?.email ?? null);

    const { data, error: err } = await supabase
      .from('family_invitations')
      .select('*, pets(name, emoji, species), profiles!invited_by(full_name)')
      .eq('token', token)
      .single();

    if (err || !data) {
      setError('This invitation link is invalid or has expired.');
      setLoading(false);
      return;
    }

    if (data.status === 'expired' || new Date(data.expires_at) < new Date()) {
      setError('This invitation has expired. Ask their parent to send a new one.');
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
    if (!user) {
      showAlert(
        'Sign in required',
        'You need a PawBond account to accept this invitation.',
        [
          { text: 'Sign in', onPress: () => router.replace('/(auth)/login') },
          { text: 'Create account', onPress: () => router.replace('/(auth)/signup') },
        ]
      );
      return;
    }

    if (invite.email && user.email && invite.email.toLowerCase() !== user.email.toLowerCase()) {
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
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
    const anonKey     = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
    const res = await fetch(`${supabaseUrl}/functions/v1/accept-family-invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ token }),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setAccepting(false);
      showAlert('Error', json?.error ?? 'Could not join this pet\'s family. Please try again.');
      return;
    }

    setAccepting(false);
    showAlert(
      `Welcome to ${invite.pets?.name}'s family! 🎉`,
      `You can now see and log care for ${invite.pets?.name} in the PawBond app.`,
      [{ text: 'Let\'s go!', onPress: () => router.replace('/(tabs)') }]
    );
  };

  const handleDecline = async () => {
    if (!invite) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (invite.email && user?.email && invite.email.toLowerCase() !== user.email.toLowerCase()) {
      showAlert(
        'Wrong account',
        `This invitation was sent to ${invite.email}. Only that account can decline it.`,
      );
      return;
    }

    showAlert(
      'Decline invitation',
      `Are you sure you want to decline the invitation to care for ${invite.pets?.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            try {
              await declineInvite(invite.id);
            } catch (e: any) { showAlert('Could not decline', e.message); return; }
            router.replace('/(tabs)');
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <PawBondLoader size={56} />
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
            <Text style={s.homeBtnText}>Go to PawBond</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const inviterName = (invite as any).profiles?.handle ? `@${(invite as any).profiles.handle}` : 'A PawBond user';

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        {/* Logo */}
        <Text style={s.logo}>🐾</Text>
        <Text style={s.appName}>PawBond</Text>

        {/* Invitation card */}
        <View style={s.card}>
          <Text style={s.petEmoji}>{invite.pets?.emoji ?? '🐾'}</Text>
          <Text style={s.inviteTitle}>You're invited!</Text>
          <Text style={s.inviteDesc}>
            <Text style={s.inviteHighlight}>{inviterName}</Text> has invited you to help care for{' '}
            <Text style={s.inviteHighlight}>{invite.pets?.name ?? 'their pet'}</Text>.
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
              <Text style={s.roleTitle}>Your role: {invite.role.charAt(0).toUpperCase() + invite.role.slice(1)}</Text>
              <Text style={s.roleSub}>
                {invite.role === 'caretaker'
                  ? 'You\'ll be able to view and log daily care, mood, and health for ' + invite.pets?.name
                  : 'You\'ll have view-only access to ' + invite.pets?.name + '\'s profile'
                }
              </Text>
            </View>
          </View>

          {currentUserEmail && (
            <View style={s.emailRow}>
              <Text style={s.emailLabel}>Signing in as</Text>
              <Text style={s.emailValue}>{currentUserEmail}</Text>
            </View>
          )}
        </View>

        {/* Actions */}
        <TouchableOpacity
          style={[s.acceptBtn, accepting && { opacity: 0.7 }]}
          onPress={handleAccept}
          disabled={accepting}
        >
          {accepting
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.acceptBtnText}>✅ Accept & join the family</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity style={s.declineBtn} onPress={handleDecline}>
          <Text style={s.declineBtnText}>Decline invitation</Text>
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
  petEmoji: { fontSize: 64, marginBottom: 4 },
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

  acceptBtn: { width: '100%', height: 54, backgroundColor: colors.primary, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm, shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  acceptBtnText: { color: '#fff', fontSize: TYPO.subheading, fontWeight: '700' },
  declineBtn: { width: '100%', height: 50, borderWidth: 1.5, borderColor: colors.border, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  declineBtnText: { fontSize: TYPO.body, color: colors.textSecondary },
  signInHint: { fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center', marginTop: SPACING.lg, lineHeight: 18 },

  loadingText: { fontSize: TYPO.body, color: colors.textSecondary, marginTop: SPACING.md },
  errorEmoji: { fontSize: 48, marginBottom: SPACING.md },
  errorTitle: { fontSize: TYPO.heading, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  errorText: { fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: SPACING.xl },
  homeBtn: { backgroundColor: colors.primary, paddingHorizontal: 32, paddingVertical: 12, borderRadius: RADIUS.md },
  homeBtnText: { color: '#fff', fontSize: TYPO.body, fontWeight: '600' },
});
