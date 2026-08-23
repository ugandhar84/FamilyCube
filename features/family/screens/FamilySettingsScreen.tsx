// FamilySettingsScreen — persistent, parent-only screen to manage household
// members anytime (not just once during onboarding). Two ways to add
// someone: email invite (they get their own real login) or the existing
// join code (PIN-only, no email, anonymous auth on their device).
//
// Onboarding's SetupFamilyScreen copy already promised "you can always find
// this code in Family Settings" — this screen is what makes that true.
import { showAlert } from '@/components/AppAlert';
import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore, type MemberRole } from '@/store/familyStore';
import { supabase } from '@/lib/supabase';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import AppBottomSheet from '@/components/AppBottomSheet';

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
}

const ROLE_OPTIONS: { value: 'parent' | 'child' | 'teenager' | 'grandparent'; label: string; emoji: string }[] = [
  { value: 'parent',      label: 'Parent',      emoji: '👩' },
  { value: 'child',       label: 'Kid',         emoji: '🧒' },
  { value: 'teenager',    label: 'Teen',        emoji: '🎧' },
  { value: 'grandparent', label: 'Grandparent', emoji: '👴' },
];

const ROLE_LABEL: Record<string, string> = {
  parent: 'Parent', child: 'Kid', teenager: 'Teen', grandparent: 'Grandparent',
};

export default function FamilySettingsScreen() {
  const { colors, isDark } = useTheme();
  const members = useFamilyStore(s => s.members);
  const activeMemberId = useFamilyStore(s => s.activeMemberId);
  const familyName = useFamilyStore(s => s.familyName);
  const activeMember = members.find(m => m.id === activeMemberId);
  const isParent = activeMember?.role === 'parent';

  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [showInviteSheet, setShowInviteSheet] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'parent' | 'child' | 'teenager' | 'grandparent'>('child');
  const [inviteMessage, setInviteMessage] = useState('');
  const [sending, setSending] = useState(false);

  const [showCodeSheet, setShowCodeSheet] = useState(false);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [loadingCode, setLoadingCode] = useState(false);

  const loadInvites = async () => {
    setLoadingInvites(true);
    const { data } = await supabase
      .from('member_invitations')
      .select('id, email, role, status, expires_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    setInvites(data ?? []);
    setLoadingInvites(false);
  };

  useEffect(() => { if (isParent) loadInvites(); }, [isParent]);

  const sendInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showAlert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    setSending(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setSending(false); showAlert('Not signed in'); return; }

    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
    const anonKey     = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
    const res = await fetch(`${supabaseUrl}/functions/v1/send-member-invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ email, role: inviteRole, message: inviteMessage.trim() || undefined }),
    });
    const json = await res.json().catch(() => ({}));
    setSending(false);

    if (!res.ok || !json.success) {
      showAlert('Could not send invite', json?.error ?? 'Something went wrong.');
      return;
    }
    setShowInviteSheet(false);
    setInviteEmail(''); setInviteMessage(''); setInviteRole('child');
    showAlert('Invite sent! 🎉', json.message ?? `Invitation sent to ${email}`);
    loadInvites();
  };

  const revokeInvite = async (id: string) => {
    const { error } = await supabase.from('member_invitations').update({ status: 'revoked' }).eq('id', id);
    if (error) { showAlert('Could not revoke', error.message); return; }
    loadInvites();
  };

  const openCodeSheet = async () => {
    setShowCodeSheet(true);
    if (joinCode) return;
    setLoadingCode(true);
    const { data: { session } } = await supabase.auth.getSession();
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
    const anonKey     = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
    const res = await fetch(`${supabaseUrl}/functions/v1/generate-invite-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'apikey': anonKey,
        ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ familyId: activeMember?.familyId, memberId: activeMemberId }),
    });
    const json = await res.json().catch(() => ({}));
    setLoadingCode(false);
    if (!json.ok) { showAlert('Could not generate code', json?.error ?? 'Try again.'); return; }
    setJoinCode(json.code);
  };

  const shareCode = async () => {
    if (!joinCode) return;
    try {
      await Share.share({
        message: `Join our family on FamilyCube! 🏠\n\nDownload the app, tap "Enter your invite code" on the login screen, and enter: ${joinCode}\n\nValid for 7 days.`,
      });
    } catch {}
  };

  if (!isParent) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 40, marginBottom: 12 }}>🔒</Text>
        <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center' }}>
          Ask a parent to manage family members.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={{ fontSize: TYPO.subheading, fontWeight: '900', color: colors.textPrimary }}>Family Settings</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 20 }}>
        {/* Members */}
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            {familyName ?? 'Your Family'} — {members.length} member{members.length === 1 ? '' : 's'}
          </Text>
          {members.map(m => (
            <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
              borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 12 }}>
              <Text style={{ fontSize: 28 }}>{m.emoji ?? '👤'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{m.name}</Text>
                <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 1 }}>
                  {m.role.charAt(0).toUpperCase() + m.role.slice(1)}
                  {m.email ? ' · Joined via invite' : ''}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Pending invitations */}
        {loadingInvites ? null : invites.length > 0 && (
          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Pending Invitations
            </Text>
            {invites.map(inv => (
              <View key={inv.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                borderRadius: 14, borderWidth: 1, borderColor: BRAND.amber + '50', backgroundColor: isDark ? BRAND.amber + '10' : '#FFFBEB', padding: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary }}>{inv.email}</Text>
                  <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 1 }}>
                    {ROLE_LABEL[inv.role] ?? inv.role} · expires {new Date(inv.expires_at).toLocaleDateString()}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => revokeInvite(inv.id)}
                  style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.danger + '18' }}>
                  <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.danger }}>Revoke</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Actions */}
        <View style={{ gap: 10, marginTop: 4 }}>
          <TouchableOpacity
            onPress={() => setShowInviteSheet(true)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 14,
              backgroundColor: BRAND.purple }}>
            <Ionicons name="mail" size={18} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#fff' }}>Invite by Email</Text>
              <Text style={{ fontSize: TYPO.micro, color: '#fff', opacity: 0.85, marginTop: 1 }}>
                They get their own login, on their own device
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={openCodeSheet}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 14,
              borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card }}>
            <Ionicons name="key" size={18} color={colors.textPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>Show Join Code</Text>
              <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 1 }}>
                No email needed — just a PIN on their device
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Invite by Email sheet */}
      <AppBottomSheet
        visible={showInviteSheet}
        onClose={() => setShowInviteSheet(false)}
        title="Invite by Email"
        subtitle="They'll sign up with their own account"
        accentColor={BRAND.purple}
        minHeight="55%"
        maxHeight="80%"
      >
        <View style={{ gap: 14 }}>
          <View>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>Email</Text>
            <TextInput
              value={inviteEmail}
              onChangeText={setInviteEmail}
              placeholder="name@example.com"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              keyboardType="email-address"
              style={{ borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderMed, backgroundColor: colors.surface,
                padding: 13, fontSize: TYPO.body, color: colors.textPrimary }}
            />
          </View>

          <View>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>Role</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {ROLE_OPTIONS.map(r => (
                <TouchableOpacity key={r.value} onPress={() => setInviteRole(r.value)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9,
                    borderRadius: 14, borderWidth: 1.5,
                    borderColor: inviteRole === r.value ? BRAND.purple : colors.border,
                    backgroundColor: inviteRole === r.value ? BRAND.purple + '18' : colors.surface }}>
                  <Text style={{ fontSize: 16 }}>{r.emoji}</Text>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: inviteRole === r.value ? BRAND.purple : colors.textSecondary }}>{r.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>
              Message <Text style={{ fontWeight: '400', color: colors.textTertiary }}>optional</Text>
            </Text>
            <TextInput
              value={inviteMessage}
              onChangeText={setInviteMessage}
              placeholder="Add a personal note…"
              placeholderTextColor={colors.textTertiary}
              multiline numberOfLines={3}
              style={{ borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderMed, backgroundColor: colors.surface,
                padding: 13, fontSize: TYPO.body, color: colors.textPrimary, minHeight: 72, textAlignVertical: 'top' }}
            />
          </View>

          <TouchableOpacity
            onPress={sendInvite}
            disabled={sending || !inviteEmail.trim()}
            style={{ borderRadius: 14, paddingVertical: 14, alignItems: 'center',
              backgroundColor: sending || !inviteEmail.trim() ? colors.border : BRAND.purple }}>
            {sending
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={{ color: '#fff', fontWeight: '900', fontSize: TYPO.body }}>Send Invite</Text>}
          </TouchableOpacity>
        </View>
      </AppBottomSheet>

      {/* Join Code sheet */}
      <AppBottomSheet
        visible={showCodeSheet}
        onClose={() => setShowCodeSheet(false)}
        title="Join Code"
        subtitle="Share this to add someone with just a PIN"
        accentColor={BRAND.purple}
        minHeight="35%"
        maxHeight="55%"
      >
        <View style={{ alignItems: 'center', gap: 16, paddingVertical: 8 }}>
          {loadingCode ? (
            <ActivityIndicator size="large" color={BRAND.purple} />
          ) : joinCode ? (
            <>
              <Text style={{ fontSize: 40, fontWeight: '900', letterSpacing: 6, color: BRAND.purple }}>{joinCode}</Text>
              <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, textAlign: 'center' }}>
                Valid for 7 days. They'll enter this on the login screen's "Enter your invite code" link.
              </Text>
              <TouchableOpacity onPress={shareCode}
                style={{ borderRadius: 14, paddingVertical: 13, paddingHorizontal: 28, backgroundColor: BRAND.purple }}>
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: TYPO.body }}>Share Code</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={{ color: colors.textTertiary }}>Could not load a code.</Text>
          )}
        </View>
      </AppBottomSheet>
    </SafeAreaView>
  );
}
