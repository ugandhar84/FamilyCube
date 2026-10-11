/**
 * AccountSection — Subscription + Sign Out + Delete account, as one inline
 * section on the Family tab (FamilyScreen.tsx). Moved here from
 * ProfileSettingsScreen.tsx in full, not duplicated — that screen no
 * longer renders any of this
 * [live-requested: "lets add the purchase here in the family tab one
 * section.. and the singout delete too.."]. All the real security-
 * sensitive gating (anonymous-session detection, PIN-switch vs real-owner
 * checks, 7-day soft-delete flows) is preserved exactly as it was —
 * see each comment inline for the original reasoning.
 *
 * Self-contained: pulls its own state from authStore/subscriptionStore/
 * familyStore, so the caller just drops <AccountSection colors isDark />
 * into its own scroll content.
 */
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Star, RefreshCw, LogOut, Lock, ShieldAlert, Link as LinkIcon, type LucideIcon } from 'lucide-react-native';
import { useAuthStore } from '@/store/authStore';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import { useFamilyStore } from '@/store/familyStore';
import { restorePurchases, isRevenueCatReady } from '@/lib/subscription';
import { usePaywallSheetStore } from '@/store/paywallSheetStore';
import { supabase } from '@/lib/supabase';
import { showAlert } from '@/components/AppAlert';
import { GEMINI } from '@/constants/geminiRhythm';

function TypeToConfirmRow({
  expected, value, onChange, colors, isDark,
}: { expected: string; value: string; onChange: (v: string) => void; colors: any; isDark: boolean }) {
  return (
    <View style={{ marginTop: 4, marginBottom: 14 }}>
      <Text style={{ fontSize: 13, color: isDark ? colors.textSecondary : GEMINI.bodyColor, marginBottom: 8 }}>
        Type <Text style={{ fontWeight: '800', color: isDark ? colors.textPrimary : GEMINI.titleColor }}>{expected}</Text> to confirm.
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={expected}
        placeholderTextColor={isDark ? colors.textTertiary : GEMINI.bodyColorLight}
        style={{
          borderWidth: 1.5, borderColor: isDark ? colors.border : GEMINI.border, borderRadius: 10,
          paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
          color: isDark ? colors.textPrimary : GEMINI.titleColor, backgroundColor: isDark ? colors.surface : GEMINI.surface,
        }}
      />
    </View>
  );
}

// Pastel icon-chip + label/subtitle row — same language as FamilyScreen's
// own ToolRow (white chip over a pastel card background, accent-colored
// icon) [live-requested: "add the pastel colors right.. ?"].
function Row({
  Icon, label, subtitle, onPress, danger, accentFg, colors, isDark,
}: {
  Icon: LucideIcon; label: string; subtitle?: string; onPress?: () => void; danger?: boolean; accentFg: string; colors: any; isDark: boolean;
}) {
  const fg = danger ? colors.danger : (isDark ? colors.textPrimary : GEMINI.titleColor);
  return (
    <TouchableOpacity onPress={onPress} disabled={!onPress} activeOpacity={0.7}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10 }}>
      <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: '#FFFFFF',
        alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
        <Icon size={18} color={danger ? colors.danger : accentFg} strokeWidth={2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: fg }}>{label}</Text>
        {subtitle ? (
          <Text style={{ fontSize: 13, color: isDark ? colors.textSecondary : GEMINI.bodyColor, marginTop: 2, lineHeight: 17 }}>{subtitle}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export function AccountSection({ colors, isDark }: { colors: any; isDark: boolean }) {
  const allMembers = useFamilyStore(s => s.members);
  const activeMemberId = useFamilyStore(s => s.activeMemberId);
  const removeMember = useFamilyStore(s => s.removeMember);
  const { signOut } = useAuthStore();
  const { tier, isTrial, trialDaysLeft } = useSubscriptionStore();
  const [restoringPurchase, setRestoringPurchase] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [showDangerConfirm, setShowDangerConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleRestorePurchases = async () => {
    const userId = useAuthStore.getState().session?.user?.id;
    if (!userId) return;
    if (!isRevenueCatReady()) {
      showAlert('Not available', 'Restore requires a TestFlight or App Store build.');
      return;
    }
    setRestoringPurchase(true);
    const result = await restorePurchases(userId);
    setRestoringPurchase(false);
    if (result.success && result.tier && result.tier !== 'free') {
      showAlert('Restored! 🎉', 'Your Family Plan subscription is active.', [{ text: 'Great!' }]);
    } else if (result.error) {
      showAlert('Restore failed', result.error);
    } else {
      showAlert('Nothing to restore', 'No active subscription found for this Apple ID.');
    }
  };

  const activeMember = allMembers.find(m => m.id === activeMemberId);
  const isAuthLinked = !!activeMember?.authUserId;
  const authUserId = useAuthStore(s => s.session?.user?.id);
  // Real Sign Out revokes this device's refresh token server-side. For a
  // real account that's fine. For an anonymous joiner (every kid/GP who
  // joined via invite code), there is NO credential to sign back in with —
  // hide the real Sign Out for an anonymous session and point at Lock
  // instead, which never revokes the session.
  const isAnonymousSession = useAuthStore(s => !!(s.session?.user as any)?.is_anonymous);
  const authOwnerMember = allMembers.find(m => m.authUserId === authUserId);
  const viewingOwnProfile = !!activeMember && activeMember.id === authOwnerMember?.id;
  // isRealOwnerParent: the REAL signed-in owner's role, not the currently-
  // active member's — when a parent PIN-switches into a kid's profile, the
  // active member IS the kid, so a naive isParent check would read false
  // even though the real owner is a parent.
  const isRealOwnerParent = authOwnerMember?.role === 'parent';

  // Apple-only parents/admins have no fallback credential to sign into the
  // same account from a non-Apple device (e.g. Android, where Sign in with
  // Apple goes through a web OAuth redirect that depends on Apple Developer
  // config matching exactly) — offer linking Google as a second path into
  // the SAME account, not a new one [live-requested: "i think we can give
  // the option to link the gmail also if they login to the apple only for
  // admins"]. supabase.auth.linkIdentity adds a second identity to the
  // CURRENT session's user row — distinct from signInWithOAuth, which
  // would start a brand-new sign-in/session instead of linking.
  const identities = useAuthStore(s => s.session?.user?.identities) ?? [];
  const hasAppleIdentity = identities.some((i: any) => i.provider === 'apple');
  const hasGoogleIdentity = identities.some((i: any) => i.provider === 'google');
  const [linkingGoogle, setLinkingGoogle] = useState(false);

  const handleLinkGoogle = async () => {
    setLinkingGoogle(true);
    try {
      const { data, error } = await supabase.auth.linkIdentity({
        provider: 'google',
        options: { redirectTo: 'familycube://auth/callback' },
      });
      if (error) {
        showAlert("Couldn't link Google", error.message);
        return;
      }
      // linkIdentity returns a URL to complete the OAuth flow in-browser,
      // same shape as signInWithOAuth — Supabase handles attaching the
      // resulting identity to THIS session's user once that flow
      // completes and the app's deep link handler picks up the redirect
      // (same familycube://auth/callback listener app/_layout.tsx already
      // has for sign-in).
      if (data?.url) {
        const WebBrowser = await import('expo-web-browser');
        await WebBrowser.openAuthSessionAsync(data.url, 'familycube://auth/callback');
      }
    } catch (e: any) {
      showAlert("Couldn't link Google", e?.message ?? 'Something went wrong.');
    } finally {
      setLinkingGoogle(false);
    }
  };

  if (!activeMember) return null;

  const expectedConfirmWord = (isAuthLinked && !isAnonymousSession) ? 'DELETE' : activeMember.name.toUpperCase();

  const handleDeleteProfile = async () => {
    setDeleting(true);
    try {
      await removeMember(activeMember.id);
      showAlert('Profile removed', `${activeMember.name}'s profile will be permanently deleted in 7 days unless restored via their PIN.`);
      setShowDangerConfirm(false);
      setConfirmText('');
    } catch (e: any) {
      showAlert('Could not remove profile', e?.message ?? 'Something went wrong.');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteAccount = async () => {
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

  // isAuthLinked alone doesn't mean "has a REAL account" — an anonymous
  // joiner has an auth_user_id too, just an anonymous one. Only a
  // genuinely real (non-anonymous) auth session, viewing their OWN
  // profile, gets the self-service "Delete account" path.
  const hasRealAccount = isAuthLinked && !isAnonymousSession && viewingOwnProfile;
  const dangerAction = hasRealAccount ? handleDeleteAccount : handleDeleteProfile;
  // Non-auth/anonymous "delete profile" is a PARENT-only action on
  // someone ELSE'S profile — gated on the REAL signed-in owner's role.
  const canShowDangerZone = hasRealAccount || (isRealOwnerParent && !viewingOwnProfile);
  // Link Google — parent/admin only, only when signed in via Apple and
  // Google isn't already linked (nothing to offer otherwise).
  const canLinkGoogle = hasRealAccount && isRealOwnerParent && hasAppleIdentity && !hasGoogleIdentity;

  // Pastel-tinted cards — same cycling-accent language as FamilyScreen's
  // own tool cards, instead of a flat white/dark card
  // [live-requested: "add the pastel colors right.. ?"]. Dark mode keeps
  // the app's own card/border tokens (pastel tints read poorly on dark
  // surfaces), light mode gets the tint.
  const cardStyle = (pastelBg: string) => ({
    borderRadius: 22, borderWidth: isDark ? 1 : 0, padding: 20,
    backgroundColor: isDark ? colors.card : pastelBg,
    borderColor: isDark ? colors.border : undefined,
  });

  return (
    <View style={{ gap: 14 }}>
      {/* Subscription — primary pastel */}
      <View style={cardStyle(colors.primaryLight)}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: isDark ? colors.textSecondary : GEMINI.bodyColor, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>
          Subscription
        </Text>
        <Row
          Icon={Star}
          accentFg={colors.primary}
          label={
            isTrial
              ? `Free Trial — ${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} left`
              : tier !== 'free'
                ? 'Family Plan — Active'
                : 'Free Plan'
          }
          subtitle={
            tier === 'free' && !isTrial
              ? 'Tap to unlock full access'
              : isTrial
                ? 'Full access until trial ends'
                : undefined
          }
          onPress={tier === 'free' && !isTrial ? () => usePaywallSheetStore.getState().show({ headline: 'Family Plan', body: 'Unlock full access for your whole family.' }) : undefined}
          colors={colors} isDark={isDark}
        />
        <Row
          Icon={RefreshCw}
          accentFg={colors.primary}
          label={restoringPurchase ? 'Restoring…' : 'Restore Purchases'}
          onPress={restoringPurchase ? undefined : handleRestorePurchases}
          colors={colors} isDark={isDark}
        />
      </View>

      {/* Link Google — Apple-only parents/admins have no fallback
          credential to reach this same account from a non-Apple device
          (Android's Sign in with Apple depends on Apple Developer config
          matching exactly, which isn't always guaranteed) — this gives
          them a second, independent way in
          [live-requested: "i think we can give the option to link the
          gmail also if they login to the apple only for admins"]. */}
      {canLinkGoogle && (
        <View style={cardStyle(colors.amberLight)}>
          <Row
            Icon={LinkIcon}
            accentFg={colors.amber}
            label={linkingGoogle ? 'Linking…' : 'Link Google Account'}
            subtitle="Sign in on Android or the web with Google too"
            onPress={linkingGoogle ? undefined : handleLinkGoogle}
            colors={colors} isDark={isDark}
          />
        </View>
      )}

      {/* Sign out — plain, reversible action, distinct from the danger
          zone's "Delete account" below (that's permanent; this just ends
          the device session). Only shown for an auth-linked, NON-
          anonymous member viewing their own profile. Teal pastel. */}
      {isAuthLinked && viewingOwnProfile && !isAnonymousSession && (
        <View style={cardStyle(colors.tealLight)}>
          <Row
            Icon={LogOut}
            accentFg={colors.teal}
            label="Sign Out"
            subtitle="You can sign back in anytime"
            onPress={async () => {
              try {
                await signOut();
              } catch (e: any) {
                console.error('[AccountSection] Sign Out failed:', e?.message, e);
              }
              router.replace('/(auth)/login?signedOut=1' as any);
            }}
            colors={colors} isDark={isDark}
          />
        </View>
      )}

      {/* Anonymous joiner's own profile — no real Sign Out (see the gate
          above); explain why and point at Lock instead. */}
      {isAuthLinked && viewingOwnProfile && isAnonymousSession && (
        <View style={[cardStyle(colors.tealLight), { gap: 6 }]}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: isDark ? colors.textPrimary : GEMINI.titleColor }}>
            No Sign Out here
          </Text>
          <Text style={{ fontSize: 13, color: isDark ? colors.textSecondary : GEMINI.bodyColor, lineHeight: 18 }}>
            You joined with an invite code, not an email — there's nothing to sign back in WITH if you sign out. If you're switching to someone else's profile, use the switcher instead. If you lose this device, ask a parent for a recovery code.
          </Text>
        </View>
      )}

      {/* PIN-switched into a sub-profile — never show a real Sign Out
          here; only a Lock/"Switch back" is safe. */}
      {!viewingOwnProfile && authOwnerMember && (
        <View style={cardStyle(colors.pinkLight)}>
          <Row
            Icon={Lock}
            accentFg={colors.pink ?? colors.accent}
            label="Lock & Switch Back"
            subtitle={`Return to ${authOwnerMember.name.split(' ')[0]}'s profile`}
            onPress={() => router.replace('/(auth)/profile-picker' as any)}
            colors={colors} isDark={isDark}
          />
        </View>
      )}

      {/* Danger zone — amber pastel card, red accents inside (the danger
          color itself still reads as the warning, the amber card just
          keeps this consistent with the rest of the pastel-card rhythm
          rather than a flat white box). */}
      {canShowDangerZone && (
        <View style={cardStyle(colors.amberLight)}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.danger, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>
            Danger Zone
          </Text>
          {!showDangerConfirm ? (
            <Row
              Icon={ShieldAlert}
              accentFg={colors.danger}
              label={hasRealAccount ? 'Delete account' : `Delete ${activeMember.name}'s profile`}
              subtitle={hasRealAccount
                ? 'Permanently deletes your account in 7 days'
                : 'Permanently deletes this profile in 7 days'}
              danger
              onPress={() => setShowDangerConfirm(true)}
              colors={colors} isDark={isDark}
            />
          ) : (
            <View style={{
              padding: 14, borderRadius: 12, backgroundColor: isDark ? colors.card : GEMINI.cardBg,
              borderWidth: 1.5, borderColor: colors.danger + '50',
            }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.danger, marginBottom: 6 }}>
                {hasRealAccount ? 'Delete your account?' : `Delete ${activeMember.name}'s profile?`}
              </Text>
              <Text style={{ fontSize: 13, color: isDark ? colors.textSecondary : GEMINI.bodyColor, marginBottom: 12, lineHeight: 18 }}>
                {hasRealAccount
                  ? `Your account, and everything tied to it, will be scheduled for permanent deletion. You have 7 days to change your mind — just log back in and everything is restored automatically. After 7 days this cannot be undone.`
                  : `${activeMember.name} will be removed from the family right away. Their profile is kept for 7 days in case you change your mind — entering their PIN again restores everything. After 7 days this cannot be undone.`}
              </Text>
              <TypeToConfirmRow
                expected={expectedConfirmWord}
                value={confirmText}
                onChange={setConfirmText}
                colors={colors}
                isDark={isDark}
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  onPress={() => { setShowDangerConfirm(false); setConfirmText(''); }}
                  style={{
                    flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center',
                    backgroundColor: isDark ? colors.surface : GEMINI.surface, borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border,
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: '700', color: isDark ? colors.textPrimary : GEMINI.titleColor }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={confirmText.trim().toUpperCase() !== expectedConfirmWord || deleting}
                  onPress={dangerAction}
                  style={{
                    flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center',
                    backgroundColor: colors.danger,
                    opacity: (confirmText.trim().toUpperCase() !== expectedConfirmWord || deleting) ? 0.4 : 1,
                  }}
                >
                  {deleting
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>Delete</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
