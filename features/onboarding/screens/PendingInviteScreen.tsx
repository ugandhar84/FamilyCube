/**
 * PendingInviteScreen — shown instead of the create-family form when the
 * signed-in user's email has a pending member_invitations row waiting
 * (SetupFamilyScreen.tsx routes here rather than ever letting this account
 * create a second, disconnected family). Reuses the existing
 * accept-member-invite edge function — the same one a real email-link tap
 * would hit — with the token resolved server-side by SetupFamilyScreen's
 * own email lookup, never exposed for the user to guess.
 */
import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/ThemeContext';
import { showAlert } from '@/components/AppAlert';
import { AnimatedCubeMark } from '@/components/FamilyCubeLogo';
import { useFamilyStore } from '@/store/familyStore';
import { registerForPushNotifications } from '@/lib/notifications';
import { RADIUS, SPACING, TYPO } from '@/constants/theme';

interface InviteDetails {
  familyName: string;
  inviterName: string | null;
  role: string;
}

export default function PendingInviteScreen() {
  const { colors } = useTheme();
  const { token } = useLocalSearchParams<{ token: string }>();
  const [details, setDetails] = useState<InviteDetails | null>(null);
  const [loadError, setLoadError] = useState('');
  const [accepting, setAccepting] = useState(false);
  const s = makeStyles(colors);

  useEffect(() => {
    (async () => {
      if (!token) { setLoadError('Missing invite.'); return; }
      const { data: inv, error } = await supabase
        .from('member_invitations')
        .select('family_id, invited_by, role, status')
        .eq('token', token)
        .maybeSingle();
      if (error || !inv || inv.status !== 'pending') {
        setLoadError('This invite is no longer available.');
        return;
      }
      const [{ data: family }, { data: inviter }] = await Promise.all([
        supabase.from('families').select('name').eq('id', inv.family_id).maybeSingle(),
        supabase.from('members').select('name').eq('auth_user_id', inv.invited_by).maybeSingle(),
      ]);
      setDetails({
        familyName: family?.name ?? 'a family',
        inviterName: inviter?.name ?? null,
        role: inv.role,
      });
    })();
  }, [token]);

  const handleAccept = async () => {
    if (accepting) return;
    setAccepting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in');
      const expoPushToken = await registerForPushNotifications().catch(() => null);
      const { data, error } = await supabase.functions.invoke('accept-member-invite', {
        body: { token, avatar: '🧑', expoPushToken },
      });
      if (error || data?.error) throw new Error(data?.error ?? error?.message ?? 'Could not accept invite.');
      await useFamilyStore.getState().syncFromDB();
      router.replace('/(tabs)');
    } catch (e: any) {
      setAccepting(false);
      showAlert('Could not join', e.message ?? 'Something went wrong. Please try again.');
    }
  };

  if (loadError) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.content}>
          <Text style={s.title}>Invite unavailable</Text>
          <Text style={s.sub}>{loadError}</Text>
          <TouchableOpacity style={s.secondaryBtn} onPress={() => router.replace('/(auth)/login')}>
            <Text style={s.secondaryText}>Back to sign in</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!details) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.content}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.content}>
        <View style={s.header}>
          <AnimatedCubeMark size={80} />
          <Text style={s.title}>You've been invited!</Text>
          <Text style={s.sub}>
            {details.inviterName ? `${details.inviterName} invited you` : 'You were invited'} to join{' '}
            <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{details.familyName}</Text> as a {details.role}.
          </Text>
        </View>

        <TouchableOpacity style={s.submitBtn} onPress={handleAccept} disabled={accepting}>
          {accepting ? <ActivityIndicator color="#fff" /> : <Text style={s.submitText}>Accept & Join</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ReturnType<typeof import('@/lib/ThemeContext').useTheme>['colors']) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: SPACING.lg },
    header: { alignItems: 'center', marginBottom: SPACING.xl },
    title: { fontSize: TYPO.heading + 4, fontWeight: '800', color: colors.textPrimary, marginTop: SPACING.md, textAlign: 'center' },
    sub: { fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center', marginTop: SPACING.xs, paddingHorizontal: SPACING.sm },
    submitBtn: {
      backgroundColor: colors.primary, borderRadius: RADIUS.md, paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.xl, alignItems: 'center', width: '100%',
    },
    submitText: { color: '#fff', fontSize: TYPO.body, fontWeight: '700' },
    secondaryBtn: { marginTop: SPACING.md, paddingVertical: SPACING.sm },
    secondaryText: { color: colors.primary, fontSize: TYPO.body, fontWeight: '600' },
  });
