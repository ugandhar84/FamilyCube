// ProfileSettingsScreen — Family Cube's dedicated account/settings screen.
// Reached via a gear icon on VaultScreen's header (features/vault/VaultScreen.tsx)
// — NOT the same thing as the "Profile" tab, which resolves to VaultScreen's
// own Apps grid and is left untouched. Sections, per explicit spec:
//   - Notification settings (store proximity reminders + push toggle)
//   - Danger zone (delete profile / delete account, gated on authUserId)
//   - Terms & privacy link
//   - Roster link
//
// Role-gating follows the same `roles: MemberRole[]` convention VaultScreen's
// own FEATURES array and Hub's role views already use — no new pattern.
import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import { useFamilyStore, type MemberRole } from '@/store/familyStore';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import { showAlert } from '@/components/AppAlert';

// ─── Small shared primitives (local — this screen's own chrome, matching
// FamilySettingsScreen/RosterTab's inline-style house convention rather
// than pulling in hub's SectionCard, which is tuned for Hub's specific
// collapsible/badge shape and would be fighting its own defaults here) ──────

function SectionHeader({ label, colors }: { label: string; colors: any }) {
  return (
    <Text style={{
      fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
      textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10,
    }}>
      {label}
    </Text>
  );
}

function Row({
  icon, label, subtitle, onPress, right, danger, colors, isDark,
}: {
  icon: keyof typeof Ionicons.glyphMap; label: string; subtitle?: string;
  onPress?: () => void; right?: React.ReactNode; danger?: boolean;
  colors: any; isDark: boolean;
}) {
  const tint = danger ? colors.danger : colors.textPrimary;
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingVertical: 13, paddingHorizontal: 14,
        borderRadius: RADIUS.md, backgroundColor: colors.card,
        borderWidth: 1, borderColor: danger ? colors.danger + '30' : colors.border,
        marginBottom: 8,
      }}
    >
      <View style={{
        width: 32, height: 32, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center',
        backgroundColor: danger ? colors.danger + '18' : colors.primaryLight,
      }}>
        <Ionicons name={icon} size={17} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: tint }}>{label}</Text>
        {subtitle ? (
          <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, marginTop: 1 }}>{subtitle}</Text>
        ) : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} /> : null)}
    </Wrapper>
  );
}

// ─── Delete flows ───────────────────────────────────────────────────────────

// Type-to-confirm — matches the "scary enough" bar the spec asks for, one
// notch past Roster's own two-step Alert (which is fine for removing
// someone else; this is a person removing themselves or a parent
// permanently affecting their own family, so it gets the stricter gate).
function TypeToConfirmRow({
  expected, value, onChange, colors,
}: { expected: string; value: string; onChange: (v: string) => void; colors: any }) {
  return (
    <View style={{ marginTop: 4, marginBottom: 14 }}>
      <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginBottom: 8 }}>
        Type <Text style={{ fontWeight: '800', color: colors.textPrimary }}>{expected}</Text> to confirm.
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={expected}
        placeholderTextColor={colors.textTertiary}
        style={{
          borderWidth: 1.5, borderColor: colors.border, borderRadius: RADIUS.sm,
          paddingHorizontal: 12, paddingVertical: 10, fontSize: TYPO.body,
          color: colors.textPrimary, backgroundColor: colors.surface,
        }}
      />
    </View>
  );
}

export default function ProfileSettingsScreen() {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, updateMember, removeMember } = useFamilyStore();
  const { signOut } = useAuthStore();

  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const role: MemberRole = activeMember?.role ?? 'parent';
  const isParent = role === 'parent';
  const isAuthLinked = !!activeMember?.authUserId;

  const [storeReminders, setStoreReminders] = useState(activeMember?.storeProximityRemindersEnabled ?? true);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [confirmText, setConfirmText] = useState('');
  const [showDangerConfirm, setShowDangerConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!activeMember) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  const expectedConfirmWord = isAuthLinked ? 'DELETE' : activeMember.name.toUpperCase();

  const handleDeleteProfile = async () => {
    // Non-auth member (kid/senior, PIN-only) — only a parent can trigger
    // this, and it's someone ELSE'S profile (or, if the active session is
    // itself a PIN-switched non-auth member, this screen wouldn't show
    // this button to them at all — see the isParent gate below).
    setDeleting(true);
    try {
      await removeMember(activeMember.id);
      showAlert('Profile removed', `${activeMember.name}'s profile will be permanently deleted in 7 days unless restored via their PIN.`);
      setShowDangerConfirm(false);
      setConfirmText('');
      router.back();
    } catch (e: any) {
      showAlert('Could not remove profile', e?.message ?? 'Something went wrong.');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteAccount = async () => {
    // Auth-linked member — self-service. Calls the delete-account edge
    // function (adapted from PawBond's own, see its header comment),
    // which soft-deletes profiles.deleted_at and notifies the rest of the
    // family, then we sign the device out locally.
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || !activeMember.authUserId) {
        showAlert('Not signed in', 'Please sign in again and retry.');
        setDeleting(false);
        return;
      }
      const { error } = await supabase.functions.invoke('delete-account', {
        body: { user_id: activeMember.authUserId },
      });
      if (error) throw error;
      showAlert('Account scheduled for deletion', 'Your account will be permanently deleted in 7 days. Log back in before then to restore it.');
      setShowDangerConfirm(false);
      setConfirmText('');
      await signOut();
      router.replace('/(auth)/login');
    } catch (e: any) {
      showAlert('Could not delete account', e?.message ?? 'Something went wrong.');
    } finally {
      setDeleting(false);
    }
  };

  const dangerAction = isAuthLinked ? handleDeleteAccount : handleDeleteProfile;
  // Non-auth "delete profile" is a PARENT action on a kid/senior's PIN-only
  // profile — a kid/senior themselves shouldn't be able to delete their own
  // non-auth profile from this screen (no real account to lose control of,
  // and it'd let a kid nuke themselves out of the family unsupervised).
  const canShowDangerZone = isAuthLinked || isParent;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={{ fontSize: TYPO.subheading, fontWeight: '900', color: colors.textPrimary }}>
          Profile & Settings
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>

        {/* Identity card */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16,
          borderRadius: RADIUS.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
          marginBottom: 24,
        }}>
          <View style={{
            width: 52, height: 52, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center',
            backgroundColor: role === 'parent' ? colors.parentLight : colors.kidLight,
          }}>
            <Text style={{ fontSize: 26 }}>{activeMember.emoji ?? '👤'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.heading, fontWeight: '800', color: colors.textPrimary }}>{activeMember.name}</Text>
            <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, marginTop: 2 }}>
              {role.charAt(0).toUpperCase() + role.slice(1)}
              {isAuthLinked ? ' · Signed in' : ' · PIN profile'}
            </Text>
          </View>
        </View>

        {/* Roster link */}
        <View style={{ marginBottom: 24 }}>
          <SectionHeader label="Family" colors={colors} />
          <Row
            icon="people-outline"
            label="Roster"
            subtitle="Manage everyone in your family"
            onPress={() => router.push('/(tabs)/profile?openFeature=roster')}
            colors={colors} isDark={isDark}
          />
        </View>

        {/* Notifications */}
        <View style={{ marginBottom: 24 }}>
          <SectionHeader label="Notifications" colors={colors} />
          <Row
            icon="notifications-outline"
            label="Push notifications"
            subtitle="Chores, chat, calendar, and family alerts"
            colors={colors} isDark={isDark}
            right={
              <Switch
                value={pushEnabled}
                onValueChange={setPushEnabled}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#fff"
              />
            }
          />
          <Row
            icon="navigate-outline"
            label="Store proximity reminders"
            subtitle="Nudge me when I'm near a store with pending items"
            colors={colors} isDark={isDark}
            right={
              <Switch
                value={storeReminders}
                onValueChange={(next) => {
                  setStoreReminders(next);
                  updateMember(activeMember.id, { storeProximityRemindersEnabled: next });
                }}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#fff"
              />
            }
          />
        </View>

        {/* Legal */}
        <View style={{ marginBottom: 24 }}>
          <SectionHeader label="Legal" colors={colors} />
          <Row
            icon="document-text-outline"
            label="Terms & Privacy"
            subtitle="Terms of service, privacy policy, AI disclosure"
            onPress={() => router.push('/profile-settings/terms')}
            colors={colors} isDark={isDark}
          />
        </View>

        {/* Danger zone */}
        {canShowDangerZone && (
          <View style={{ marginBottom: 24 }}>
            <SectionHeader label="Danger Zone" colors={colors} />
            {!showDangerConfirm ? (
              <Row
                icon="warning-outline"
                label={isAuthLinked ? 'Delete account' : `Delete ${activeMember.name}'s profile`}
                subtitle={isAuthLinked
                  ? 'Permanently deletes your account in 7 days'
                  : 'Permanently deletes this profile in 7 days'}
                danger
                onPress={() => setShowDangerConfirm(true)}
                colors={colors} isDark={isDark}
              />
            ) : (
              <View style={{
                padding: 14, borderRadius: RADIUS.md, backgroundColor: colors.card,
                borderWidth: 1.5, borderColor: colors.danger + '50',
              }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.danger, marginBottom: 6 }}>
                  {isAuthLinked ? 'Delete your account?' : `Delete ${activeMember.name}'s profile?`}
                </Text>
                <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginBottom: 12, lineHeight: 18 }}>
                  {isAuthLinked
                    ? `Your account, and everything tied to it, will be scheduled for permanent deletion. You have 7 days to change your mind — just log back in and everything is restored automatically. After 7 days this cannot be undone.`
                    : `${activeMember.name} will be removed from the family right away. Their profile is kept for 7 days in case you change your mind — entering their PIN again restores everything. After 7 days this cannot be undone.`}
                </Text>
                <TypeToConfirmRow
                  expected={expectedConfirmWord}
                  value={confirmText}
                  onChange={setConfirmText}
                  colors={colors}
                />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    onPress={() => { setShowDangerConfirm(false); setConfirmText(''); }}
                    style={{
                      flex: 1, paddingVertical: 11, borderRadius: RADIUS.sm, alignItems: 'center',
                      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
                    }}
                  >
                    <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={confirmText.trim().toUpperCase() !== expectedConfirmWord || deleting}
                    onPress={dangerAction}
                    style={{
                      flex: 1, paddingVertical: 11, borderRadius: RADIUS.sm, alignItems: 'center',
                      backgroundColor: colors.danger,
                      opacity: (confirmText.trim().toUpperCase() !== expectedConfirmWord || deleting) ? 0.4 : 1,
                    }}
                  >
                    {deleting
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#fff' }}>Delete</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
