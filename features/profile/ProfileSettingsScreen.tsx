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
import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch, ActivityIndicator, TextInput, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme, type ThemeMode } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import { useFamilyStore, type MemberRole } from '@/store/familyStore';
import { useChoreStore } from '@/store/choreStore';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import { showAlert } from '@/components/AppAlert';
import AppBottomSheet from '@/components/AppBottomSheet';
import {
  isBiometricAvailable, isBiometricEnabled, setBiometricEnabled, getBiometricLabel,
} from '@/lib/biometrics';

// Same category buckets family-notifier's own categoryFor() groups every
// real notification type into (supabase/functions/family-notifier/index.ts)
// — keep these two lists in sync if categories ever change on either side.
const NOTIF_CATEGORIES: { key: 'chores' | 'family' | 'chat' | 'rewards' | 'requests' | 'grocery'; label: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'chores',   label: 'Chores & Schedules', subtitle: 'Assignments, approvals, deadlines, bonuses', icon: 'checkbox-outline' },
  { key: 'family',   label: 'Family & Location',  subtitle: 'Arrivals, low battery, safety alerts',        icon: 'people-circle-outline' },
  { key: 'chat',     label: 'Chat',               subtitle: 'Mentions in family chat',                      icon: 'chatbubble-outline' },
  { key: 'rewards',  label: 'Rewards',             subtitle: 'Coins earned, redemption decisions',           icon: 'gift-outline' },
  { key: 'requests', label: 'Requests',            subtitle: 'Kid requests, help requests',                  icon: 'hand-left-outline' },
  { key: 'grocery',  label: 'Grocery',             subtitle: 'Shopping trips, store proximity',              icon: 'cart-outline' },
];

// A short, common list — not exhaustive ISO 4217, just enough that a
// parent picks their real currency instead of typing a code by hand.
const CURRENCIES: { code: string; symbol: string; label: string }[] = [
  { code: 'USD', symbol: '$', label: 'US Dollar' },
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'GBP', symbol: '£', label: 'British Pound' },
  { code: 'INR', symbol: '₹', label: 'Indian Rupee' },
  { code: 'CAD', symbol: 'CA$', label: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'AU$', label: 'Australian Dollar' },
  { code: 'JPY', symbol: '¥', label: 'Japanese Yen' },
  { code: 'MXN', symbol: 'MX$', label: 'Mexican Peso' },
];

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

// ─── Notifications sheet ────────────────────────────────────────────────────
// Was 6+ toggle rows sitting flat inline on the main page, pushing
// everything else down — collapsed into one summary row that opens this
// sheet instead, matching the app's existing "tap a row → bottom sheet with
// the full picker" pattern elsewhere (e.g. PillOrderSheet). Category
// toggles, quiet hours, and call alerts all live here together since
// they're all "how do I want to be notified", not separable concerns.

function fmt12Hour(hhmm: string | undefined): string {
  if (!hhmm) return '--:--';
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function NotificationsSheet({
  visible, onClose, activeMember, notifPrefs, setNotifPrefs,
  storeReminders, setStoreReminders, updateMember, colors, isDark,
}: {
  visible: boolean; onClose: () => void; activeMember: any;
  notifPrefs: Partial<Record<string, boolean>>;
  setNotifPrefs: (p: Partial<Record<string, boolean>>) => void;
  storeReminders: boolean; setStoreReminders: (v: boolean) => void;
  updateMember: (id: string, patch: any) => void;
  colors: any; isDark: boolean;
}) {
  const [quietEnabled, setQuietEnabled] = useState(activeMember.quietHoursEnabled ?? false);
  const [quietStart, setQuietStart] = useState(activeMember.quietHoursStart ?? '21:00');
  const [quietEnd, setQuietEnd] = useState(activeMember.quietHoursEnd ?? '07:00');
  const [callAlertsEnabled, setCallAlertsEnabled] = useState(activeMember.callAlertsEnabled ?? true);
  const [pickerTarget, setPickerTarget] = useState<'start' | 'end' | null>(null);

  const toTimeDate = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  };

  const onPickTime = (target: 'start' | 'end', date: Date | undefined) => {
    setPickerTarget(null);
    if (!date) return;
    const hhmm = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    // The picker shows this device's local clock — save the device's real
    // IANA zone alongside the HH:MM so family-notifier can convert its own
    // UTC clock into this member's actual local time, instead of the two
    // ends silently disagreeing about what "9 PM" means.
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (target === 'start') { setQuietStart(hhmm); updateMember(activeMember.id, { quietHoursStart: hhmm, timezone }); }
    else { setQuietEnd(hhmm); updateMember(activeMember.id, { quietHoursEnd: hhmm, timezone }); }
  };

  return (
    <AppBottomSheet visible={visible} onClose={onClose} title="Notifications"
      subtitle="Choose what you hear about, and when" minHeight="60%" maxHeight="90%">
      <SectionHeader label="Categories" colors={colors} />
      {NOTIF_CATEGORIES.map(cat => {
        const enabled = notifPrefs[cat.key] !== false;
        return (
          <Row
            key={cat.key}
            icon={cat.icon}
            label={cat.label}
            subtitle={cat.subtitle}
            colors={colors} isDark={isDark}
            right={
              <Switch
                value={enabled}
                onValueChange={(next) => {
                  const nextPrefs = { ...notifPrefs, [cat.key]: next };
                  setNotifPrefs(nextPrefs);
                  updateMember(activeMember.id, { notificationPrefs: nextPrefs });
                }}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#fff"
              />
            }
          />
        );
      })}
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

      <View style={{ marginTop: 18 }}>
        <SectionHeader label="Call Alerts" colors={colors} />
        <Row
          icon="call-outline"
          label="Call-style reminders"
          subtitle="Chores/events with a phone-call-style alert enabled"
          colors={colors} isDark={isDark}
          right={
            <Switch
              value={callAlertsEnabled}
              onValueChange={(next) => {
                setCallAlertsEnabled(next);
                updateMember(activeMember.id, { callAlertsEnabled: next });
              }}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          }
        />
      </View>

      <View style={{ marginTop: 18 }}>
        <SectionHeader label="Quiet Hours" colors={colors} />
        <Row
          icon="moon-outline"
          label="Enable quiet hours"
          subtitle="Pause push notifications during this window"
          colors={colors} isDark={isDark}
          right={
            <Switch
              value={quietEnabled}
              onValueChange={(next) => {
                setQuietEnabled(next);
                updateMember(activeMember.id, { quietHoursEnabled: next });
              }}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          }
        />
        {quietEnabled && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity onPress={() => setPickerTarget('start')} style={{
              flex: 1, paddingVertical: 12, borderRadius: RADIUS.md, backgroundColor: colors.card,
              borderWidth: 1, borderColor: colors.border, alignItems: 'center',
            }}>
              <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, marginBottom: 2 }}>From</Text>
              <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>{fmt12Hour(quietStart)}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPickerTarget('end')} style={{
              flex: 1, paddingVertical: 12, borderRadius: RADIUS.md, backgroundColor: colors.card,
              borderWidth: 1, borderColor: colors.border, alignItems: 'center',
            }}>
              <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, marginBottom: 2 }}>Until</Text>
              <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>{fmt12Hour(quietEnd)}</Text>
            </TouchableOpacity>
          </View>
        )}
        {pickerTarget && (
          <DateTimePicker
            value={toTimeDate(pickerTarget === 'start' ? quietStart : quietEnd)}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_e, date) => onPickTime(pickerTarget, date)}
          />
        )}
      </View>
    </AppBottomSheet>
  );
}

// ─── Currency sheet ─────────────────────────────────────────────────────────
// Parent-only (gated at the call site, isParent) — sets both which currency
// symbol is shown and the coins-per-unit ratio those wallet/cash-out
// screens already convert with. Reuses updateHouseholdSettings, the same
// real, working updater those screens' balances read from — this was only
// ever missing a UI, not backing logic.

function CurrencySheet({
  visible, onClose, householdSettings, updateHouseholdSettings, colors, isDark,
}: {
  visible: boolean; onClose: () => void;
  householdSettings: { currencyCode: string; currencySymbol: string; pointsToFiatRatio: number };
  updateHouseholdSettings: (updates: Partial<{ currencyCode: string; currencySymbol: string; pointsToFiatRatio: number }>) => void;
  colors: any; isDark: boolean;
}) {
  // 1 / ratio = coins per unit of currency — easier for a parent to reason
  // about ("100 coins per dollar") than the raw ratio (0.01) itself.
  const [coinsPerUnit, setCoinsPerUnit] = useState(
    String(householdSettings.pointsToFiatRatio > 0 ? Math.round(1 / householdSettings.pointsToFiatRatio) : 100)
  );

  const applyCoinsPerUnit = (text: string) => {
    setCoinsPerUnit(text);
    const n = parseInt(text, 10);
    if (n > 0) updateHouseholdSettings({ pointsToFiatRatio: 1 / n });
  };

  return (
    <AppBottomSheet visible={visible} onClose={onClose} title="Currency"
      subtitle="How coins convert to real money for the whole family" minHeight="55%" maxHeight="85%">
      <SectionHeader label="Currency" colors={colors} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        {CURRENCIES.map(c => {
          const active = householdSettings.currencyCode === c.code;
          return (
            <TouchableOpacity
              key={c.code}
              onPress={() => updateHouseholdSettings({ currencyCode: c.code, currencySymbol: c.symbol })}
              style={{
                paddingHorizontal: 12, paddingVertical: 9, borderRadius: RADIUS.md,
                backgroundColor: active ? colors.primary : colors.card,
                borderWidth: 1, borderColor: active ? colors.primary : colors.border,
              }}
            >
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: active ? '#fff' : colors.textPrimary }}>
                {c.symbol} {c.code}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <SectionHeader label="Conversion Rate" colors={colors} />
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14,
        borderRadius: RADIUS.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
      }}>
        <TextInput
          value={coinsPerUnit}
          onChangeText={applyCoinsPerUnit}
          keyboardType="number-pad"
          style={{
            flex: 1, fontSize: TYPO.heading, fontWeight: '800', color: colors.textPrimary,
            borderWidth: 1.5, borderColor: colors.border, borderRadius: RADIUS.sm,
            paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface,
          }}
        />
        <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>
          coins = 1 {householdSettings.currencySymbol}
        </Text>
      </View>
      <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, marginTop: 10 }}>
        Example: 250 coins = {householdSettings.currencySymbol}{(250 * householdSettings.pointsToFiatRatio).toFixed(2)}
      </Text>
    </AppBottomSheet>
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
  const { colors, isDark, mode, setMode } = useTheme();
  const { members, activeMemberId, updateMember, removeMember } = useFamilyStore();
  const { signOut } = useAuthStore();
  const householdSettings = useChoreStore(s => s.householdSettings);
  const updateHouseholdSettings = useChoreStore(s => s.updateHouseholdSettings);
  const [showCurrencySheet, setShowCurrencySheet] = useState(false);

  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const role: MemberRole = activeMember?.role ?? 'parent';
  const isParent = role === 'parent';
  const isAuthLinked = !!activeMember?.authUserId;

  const [storeReminders, setStoreReminders] = useState(activeMember?.storeProximityRemindersEnabled ?? true);
  const [notifPrefs, setNotifPrefs] = useState(activeMember?.notificationPrefs ?? {});
  const [showNotifSheet, setShowNotifSheet] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [showDangerConfirm, setShowDangerConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Biometric app-lock — real, already-wired-at-the-app-level preference
  // (app/_layout.tsx gates foreground/session-resume locking on this exact
  // stored value already); this screen just needed a UI for it.
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioLabel, setBioLabel] = useState('Biometrics');
  const [bioEnabled, setBioEnabled] = useState(false);
  useEffect(() => {
    isBiometricAvailable().then(setBioAvailable);
    getBiometricLabel().then(setBioLabel);
    isBiometricEnabled().then(setBioEnabled);
  }, []);

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

        {/* Notifications — was 6+ toggle rows sitting flat on this page;
            collapsed into one summary row that opens NotificationsSheet
            (categories, quiet hours, call alerts all together), same
            "tap a row → bottom sheet" pattern the app uses elsewhere. */}
        <View style={{ marginBottom: 24 }}>
          <SectionHeader label="Notifications" colors={colors} />
          <Row
            icon="notifications-outline"
            label="Notifications"
            subtitle={
              Object.values(notifPrefs).some(v => v === false)
                ? 'Some categories muted — tap to review'
                : 'All categories on · tap to customize'
            }
            onPress={() => setShowNotifSheet(true)}
            colors={colors} isDark={isDark}
          />
        </View>

        <NotificationsSheet
          visible={showNotifSheet}
          onClose={() => setShowNotifSheet(false)}
          activeMember={activeMember}
          notifPrefs={notifPrefs}
          setNotifPrefs={setNotifPrefs}
          storeReminders={storeReminders}
          setStoreReminders={setStoreReminders}
          updateMember={updateMember}
          colors={colors} isDark={isDark}
        />

        {/* Appearance */}
        <View style={{ marginBottom: 24 }}>
          <SectionHeader label="Appearance" colors={colors} />
          <View style={{
            flexDirection: 'row', borderRadius: RADIUS.md, backgroundColor: colors.card,
            borderWidth: 1, borderColor: colors.border, padding: 4, gap: 4,
          }}>
            {([
              { key: 'system', label: 'System', icon: 'phone-portrait-outline' },
              { key: 'light',  label: 'Light',  icon: 'sunny-outline' },
              { key: 'dark',   label: 'Dark',   icon: 'moon-outline' },
            ] as { key: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[]).map(opt => {
              const active = mode === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => setMode(opt.key)}
                  style={{
                    flex: 1, alignItems: 'center', gap: 4, paddingVertical: 10, borderRadius: RADIUS.sm,
                    backgroundColor: active ? colors.primary : 'transparent',
                  }}
                >
                  <Ionicons name={opt.icon} size={18} color={active ? '#fff' : colors.textSecondary} />
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: active ? '#fff' : colors.textSecondary }}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Security */}
        {bioAvailable && (
          <View style={{ marginBottom: 24 }}>
            <SectionHeader label="Security" colors={colors} />
            <Row
              icon="finger-print-outline"
              label={`Require ${bioLabel}`}
              subtitle="Lock the app when it's backgrounded or reopened"
              colors={colors} isDark={isDark}
              right={
                <Switch
                  value={bioEnabled}
                  onValueChange={async (next) => {
                    setBioEnabled(next);
                    await setBiometricEnabled(next);
                  }}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#fff"
                />
              }
            />
          </View>
        )}

        {/* Currency — the coins-to-real-money conversion every kid's wallet/
            cash-out screen already displays (StoreScreen, ChildChoreBoard,
            ParentReviewDeck) was hardcoded to a bare $ with no setting to
            change it at all. Parent-editable; everyone else sees the same
            row as read-only display, per explicit request. */}
        <View style={{ marginBottom: 24 }}>
          <SectionHeader label="Currency" colors={colors} />
          <Row
            icon="cash-outline"
            label={`${householdSettings.currencyCode} (${householdSettings.currencySymbol})`}
            subtitle={
              isParent
                ? `100 coins = ${householdSettings.currencySymbol}${(100 * householdSettings.pointsToFiatRatio).toFixed(2)} · tap to change`
                : `100 coins = ${householdSettings.currencySymbol}${(100 * householdSettings.pointsToFiatRatio).toFixed(2)}`
            }
            onPress={isParent ? () => setShowCurrencySheet(true) : undefined}
            colors={colors} isDark={isDark}
          />
        </View>

        {isParent && (
          <CurrencySheet
            visible={showCurrencySheet}
            onClose={() => setShowCurrencySheet(false)}
            householdSettings={householdSettings}
            updateHouseholdSettings={updateHouseholdSettings}
            colors={colors} isDark={isDark}
          />
        )}

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
