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
import { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch, ActivityIndicator, TextInput, Platform, Share, Image, InteractionManager, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme, type ThemeMode } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import { useFamilyStore, RELATIONSHIPS_BY_ROLE, type MemberRole, type FamilyMember } from '@/store/familyStore';
import { useChoreStore } from '@/store/choreStore';
import { useAuthStore } from '@/store/authStore';
import { supabase, uploadMemberAvatar } from '@/lib/supabase';
import { showAlert } from '@/components/AppAlert';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import { restorePurchases, isRevenueCatReady } from '@/lib/subscription';
import { usePaywallSheetStore } from '@/store/paywallSheetStore';
import AppBottomSheet from '@/components/AppBottomSheet';
import {
  isBiometricAvailable, isBiometricEnabled, setBiometricEnabled, getBiometricLabel,
} from '@/lib/biometrics';
import PinEntryModal from '@/components/PinEntryModal';
import { CarouselMemberCard } from '@/features/vault/tabs/MemberCard';
import { FamilyTreeView } from '@/features/vault/tabs/FamilyTreeView';
import { MemberProfileSheet } from '@/features/vault/tabs/MemberProfileSheet';
import { PhotoPickerSheet } from '@/features/vault/tabs/RosterTab';
import { saveMemberEdit } from '@/features/vault/tabs/memberActions';
import { localDateStr, fmtDate } from '@/lib/dates';
import { showPickerLoading, hidePickerLoading } from '@/lib/pickerLoading';
import { useIsAppAdmin } from '@/lib/hooks/useIsAppAdmin';

// Same category buckets family-notifier's own categoryFor() groups every
// real notification type into (supabase/functions/family-notifier/index.ts)
// — keep these two lists in sync if categories ever change on either side.
// 'mentions' split out from 'chat' — live-requested: a person should be
// able to choose whether @mentions ping them independently from general
// chat message notifications (e.g. mute a busy group channel but still get
// pinged when actually @mentioned). See family-notifier's chat_message vs
// chat_mention CATEGORY_BY_TYPE entries for the server-side half of this.
const NOTIF_CATEGORIES: { key: 'chores' | 'family' | 'chat' | 'mentions' | 'rewards' | 'requests' | 'grocery'; label: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'chores',   label: 'Chores & Schedules', subtitle: 'Assignments, approvals, deadlines, bonuses', icon: 'checkbox-outline' },
  { key: 'family',   label: 'Family & Location',  subtitle: 'Arrivals, low battery, safety alerts',        icon: 'people-circle-outline' },
  { key: 'chat',     label: 'Chat Messages',      subtitle: 'New messages in your channels and DMs',       icon: 'chatbubble-outline' },
  { key: 'mentions', label: 'Mentions',           subtitle: 'When someone @mentions you in family chat',   icon: 'at-outline' },
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
  icon, label, subtitle, onPress, right, danger, accent, colors, isDark,
}: {
  icon: keyof typeof Ionicons.glyphMap; label: string; subtitle?: string;
  onPress?: () => void; right?: React.ReactNode; danger?: boolean;
  // Optional per-row brand tint (Hub tile treatment) — falls back to
  // colors.primary so every row still differentiates from the card/
  // background instead of the old flat neutral-grey border every row
  // shared regardless of what it was about.
  accent?: string;
  colors: any; isDark: boolean;
}) {
  const tint = danger ? colors.danger : (accent ?? colors.primary);
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingVertical: 13, paddingHorizontal: 14,
        borderRadius: RADIUS.md, backgroundColor: isDark ? tint + '16' : tint + '14',
        borderWidth: 1, borderColor: tint + (isDark ? '40' : '30'),
        marginBottom: 8,
      }}
    >
      <View style={{
        width: 32, height: 32, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center',
        backgroundColor: tint + 'D9',
      }}>
        <Ionicons name={icon} size={17} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: danger ? colors.danger : colors.textPrimary }}>{label}</Text>
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

// ─── Family Name sheet ──────────────────────────────────────────────────────
// Parent-only (gated at the call site, isParent), mirrors CurrencySheet's
// pattern. familyStore.familyName was previously stuck forever at its
// 'Our Family' default — nothing fetched the real families.name row or
// wrote a rename back to it — so this is the family's first working rename
// path, not a UI-only fix on top of already-working backing logic.
function FamilyNameSheet({
  visible, onClose, currentName, renameFamily, colors, isDark,
}: {
  visible: boolean; onClose: () => void; currentName: string;
  renameFamily: (name: string) => Promise<boolean>;
  colors: any; isDark: boolean;
}) {
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (visible) { setName(currentName); setError(''); } }, [visible, currentName]);

  const handleSave = async () => {
    if (!name.trim()) { setError('Enter a family name'); return; }
    setSaving(true);
    setError('');
    const ok = await renameFamily(name);
    setSaving(false);
    if (ok) onClose();
    else setError("Couldn't save — try again.");
  };

  return (
    <AppBottomSheet visible={visible} onClose={onClose} title="Family Name"
      subtitle="Shown on the Hub, the widget, and shared with anyone you invite" minHeight="40%" maxHeight="60%">
      <TextInput
        value={name}
        onChangeText={t => { setName(t); setError(''); }}
        placeholder="e.g. The Smith Family"
        placeholderTextColor={colors.textTertiary}
        autoFocus
        style={{
          fontSize: TYPO.heading, fontWeight: '700', color: colors.textPrimary,
          borderWidth: 1.5, borderColor: error ? colors.danger : colors.border, borderRadius: RADIUS.md,
          paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surface, marginTop: 8,
        }}
      />
      {error ? <Text style={{ color: colors.danger, fontSize: TYPO.caption, marginTop: 6 }}>{error}</Text> : null}
      <TouchableOpacity
        onPress={handleSave}
        disabled={saving}
        style={{
          marginTop: 18, backgroundColor: colors.primary, borderRadius: RADIUS.md,
          paddingVertical: 14, alignItems: 'center', opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800', fontSize: TYPO.body }}>Save</Text>}
      </TouchableOpacity>
    </AppBottomSheet>
  );
}

// ─── Invite Member sheet ────────────────────────────────────────────────────
// Per-invitee invite system: a form to pre-create a family member's row
// (name/relationship/role, invite_status='pending') BEFORE any code exists,
// then a list of every pending/claimed invitee with a regenerate-code
// action per pending person. Each code is scoped to that ONE member id
// (generate-invite-code's targetMemberId) — redeeming it claims that exact
// row (join-family) rather than creating a new one, and dies on claim.
// Reuses the same copy-to-clipboard UX RosterTab's own invite card started
// (visual "Copied!" swap) but with a real Clipboard write this time, plus a
// native Share sheet for handing the code off some other way (text/email).

interface PendingInvite {
  id: string; member_id: string | null; code: string;
  status: 'pending' | 'accepted' | 'expired'; expires_at: string;
}

const INVITE_ROLES: { value: MemberRole; label: string; emoji: string }[] = [
  { value: 'kid',    label: 'Kid',         emoji: '🧒' },
  { value: 'teen',   label: 'Teen',        emoji: '🧑' },
  { value: 'parent', label: 'Parent',      emoji: '👤' },
  { value: 'senior', label: 'Grandparent', emoji: '🧓' },
];

function InviteMemberSheet({
  visible, onClose, familyId, callerMemberId, members, colors, isDark,
}: {
  visible: boolean; onClose: () => void; familyId: string; callerMemberId: string;
  members: FamilyMember[]; colors: any; isDark: boolean;
}) {
  const addPendingMember = useFamilyStore(s => s.addPendingMember);
  const [name, setName] = useState('');
  const [role, setRole] = useState<MemberRole>('kid');
  const [relationship, setRelationship] = useState<string | undefined>(undefined);
  const [dob, setDob] = useState<Date | null>(null);
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState<{ name?: boolean; email?: boolean }>({});
  const [creating, setCreating] = useState(false);
  const [invitesByMember, setInvitesByMember] = useState<Record<string, PendingInvite>>({});
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // generateCodeFor previously called showAlert() while this sheet was
  // still open — AppAlert renders its OWN native Modal, and stacking a
  // second Modal on top of this sheet's own (AppBottomSheet) reproduced the
  // exact same total-touch-freeze class of bug already fixed above for the
  // DOB picker (live-reported: "after closing that sheet... touch is not
  // working"). Same fix as resendInviteFor's sibling comment describes —
  // render the result inline instead of alerting over an open Modal.
  const [codeStatus, setCodeStatus] = useState<{ memberId: string; kind: 'error' | 'info'; text: string } | null>(null);

  // Closing the sheet while the DOB picker is still open left its native
  // inline DateTimePicker mounted underneath the parent AppBottomSheet's
  // Modal while that Modal tried to unmount — confirmed live as a total
  // touch-freeze after closing the invite sheet, same class of bug as the
  // earlier photo-picker-over-Modal freeze this session already fixed
  // elsewhere. The picker isn't itself a Modal here, so nothing else resets
  // it on close. codeStatus reset alongside it for the same reason (stale
  // banner shouldn't reappear from a previous open).
  useEffect(() => {
    if (!visible) { setShowDobPicker(false); setCodeStatus(null); }
  }, [visible]);

  // ── Validation ──────────────────────────────────────────────────────────
  // Name: required, trimmed, reasonable max length. Relationship/role: role
  // always has a value (chip default 'kid'), so it's never actually
  // invalid — only relationship is optional. DOB: optional, but if set must
  // be a real past date, not in the future, not absurdly old (matches
  // CompleteProfileScreen's own ~120y MIN_DOB sanity bound, tightened
  // slightly to the ~110y this form was asked to enforce). Email: optional,
  // but if provided must pass real format validation.
  const MAX_DOB = new Date();
  const MIN_DOB = new Date(Date.now() - 110 * 365.25 * 24 * 3600_000);
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const nameError = !name.trim() ? 'Name is required.' : name.trim().length > 60 ? 'Name is too long.' : undefined;
  const emailError = email.trim() && !EMAIL_RE.test(email.trim()) ? 'Enter a valid email address.' : undefined;
  const dobError = dob && (dob > MAX_DOB ? 'Date of birth can\'t be in the future.' : dob < MIN_DOB ? 'That date seems too far in the past.' : undefined);
  const formValid = !nameError && !emailError && !dobError;

  const pendingMembers = members.filter(m => m.inviteStatus === 'pending' && !m.deletedAt);
  const claimedInvitees = members.filter(m => m.inviteStatus !== 'pending' && !m.deletedAt && m.id !== callerMemberId);

  const loadInvites = useCallback(async () => {
    setLoadingInvites(true);
    const { data } = await supabase.from('family_invites').select('id, member_id, code, status, expires_at')
      .eq('family_id', familyId).not('member_id', 'is', null)
      .order('expires_at', { ascending: false });
    if (data) {
      const byMember: Record<string, PendingInvite> = {};
      for (const inv of data as PendingInvite[]) {
        // Latest row per member_id wins (query is already newest-expiry-first).
        if (inv.member_id && !byMember[inv.member_id]) byMember[inv.member_id] = inv;
      }
      setInvitesByMember(byMember);
    }
    setLoadingInvites(false);
  }, [familyId]);

  useEffect(() => { if (visible) loadInvites(); }, [visible, loadInvites]);

  const relationshipOptions = RELATIONSHIPS_BY_ROLE[role] ?? [];

  const generateCodeFor = async (targetMemberId: string) => {
    setRegenerating(targetMemberId);
    setCodeStatus(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
      const anonKey     = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
      const res = await fetch(`${supabaseUrl}/functions/v1/generate-invite-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', 'apikey': anonKey,
          ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ familyId, memberId: callerMemberId, targetMemberId }),
      });
      const json = await res.json();
      if (json.ok) {
        await loadInvites();
        // Only worth telling the parent about email delivery when this
        // member actually HAS an email on file (the invite form's optional
        // field) — generate-invite-code silently skips the email step
        // entirely when there's none, which is the normal/expected case
        // for PIN-only kids/GPs, not something to alert about.
        if (json.emailError) {
          setCodeStatus({ memberId: targetMemberId, kind: 'error', text: `Code created, but the email couldn't be sent (${json.emailError}). Share the code directly instead.` });
        } else if (json.emailSent) {
          setCodeStatus({ memberId: targetMemberId, kind: 'info', text: 'The code was emailed to them.' });
        }
      } else {
        setCodeStatus({ memberId: targetMemberId, kind: 'error', text: json.error ?? 'Something went wrong.' });
      }
    } catch (e: any) {
      setCodeStatus({ memberId: targetMemberId, kind: 'error', text: e?.message ?? 'Network error.' });
    } finally {
      setRegenerating(null);
    }
  };

  const handleAddMember = async () => {
    setTouched({ name: true, email: true });
    if (!formValid) return;
    setCreating(true);
    try {
      const created = await addPendingMember(name, role, relationship, dob ? localDateStr(dob) : undefined, email.trim() || undefined);
      if (!created) { showAlert("Couldn't add family member", 'That email may already be in use in your family, or something else went wrong. Please try again.'); return; }
      setName(''); setRelationship(undefined); setRole('kid'); setDob(null); setEmail(''); setTouched({});
      await generateCodeFor(created.id);
    } finally {
      setCreating(false);
    }
  };

  const copyCode = async (id: string, code: string) => {
    await Clipboard.setStringAsync(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const shareCode = async (name: string, code: string) => {
    try {
      await Share.share({ message: `Join our family on Family Cube! Use invite code ${code} to set up ${name}'s profile.` });
    } catch { /* user cancelled — no-op */ }
  };

  const fmtExpiry = (iso: string) => {
    try {
      const diffH = Math.round((new Date(iso).getTime() - Date.now()) / 3600000);
      if (diffH < 0) return 'Expired';
      if (diffH < 24) return `${diffH}h left`;
      return `${Math.floor(diffH / 24)}d left`;
    } catch { return '--'; }
  };

  return (
    <AppBottomSheet visible={visible} onClose={onClose} title="Invite Family Member"
      subtitle="Add their details, then share the code they'll use to join" minHeight="65%" maxHeight="92%">

      <SectionHeader label="Add Someone New" colors={colors} />
      <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginBottom: 8 }}>Name</Text>
      <TextInput
        value={name} onChangeText={setName} onBlur={() => setTouched(t => ({ ...t, name: true }))}
        placeholder="e.g. Emma" maxLength={60}
        placeholderTextColor={colors.textTertiary}
        style={{
          borderWidth: 1.5, borderColor: (touched.name && nameError) ? colors.danger : colors.border, borderRadius: RADIUS.sm,
          paddingHorizontal: 12, paddingVertical: 10, fontSize: TYPO.body,
          color: colors.textPrimary, backgroundColor: colors.surface,
        }}
      />
      {touched.name && nameError ? (
        <Text style={{ fontSize: TYPO.caption, color: colors.danger, marginTop: 4 }}>{nameError}</Text>
      ) : null}
      <View style={{ marginBottom: 14 }} />

      <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginBottom: 8 }}>Role</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {INVITE_ROLES.map(r => {
          const active = role === r.value;
          return (
            <TouchableOpacity key={r.value}
              onPress={() => { setRole(r.value); setRelationship(undefined); }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 12, paddingVertical: 9, borderRadius: RADIUS.md,
                backgroundColor: active ? colors.primary : colors.card,
                borderWidth: 1, borderColor: active ? colors.primary : colors.border,
              }}>
              <Text style={{ fontSize: 14 }}>{r.emoji}</Text>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: active ? '#fff' : colors.textPrimary }}>{r.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {relationshipOptions.length > 0 && (
        <>
          <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginBottom: 8 }}>
            Relationship <Text style={{ fontWeight: '400' }}>(optional)</Text>
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {relationshipOptions.map(opt => {
              const picked = relationship === opt;
              return (
                <TouchableOpacity key={opt} onPress={() => setRelationship(picked ? undefined : opt)}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.md,
                    backgroundColor: picked ? colors.teal : colors.card,
                    borderWidth: 1, borderColor: picked ? colors.teal : colors.border,
                  }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: picked ? '#fff' : colors.textPrimary }}>{opt}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {/* Date of birth — same inline-spinner pattern CompleteProfileScreen
          already uses (DateTimePicker, mode="date", display="spinner"),
          reusing FamilyMember.dateOfBirth's own 'YYYY-MM-DD' format
          (localDateStr) rather than inventing a second date representation.
          Optional — skipping it is a real, supported choice, same as it is
          post-onboarding. */}
      <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginBottom: 8 }}>
        Date of birth <Text style={{ fontWeight: '400' }}>(optional)</Text>
      </Text>
      <TouchableOpacity
        onPress={() => setShowDobPicker(v => !v)}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          borderWidth: 1.5, borderColor: (dobError) ? colors.danger : (showDobPicker ? colors.primary : colors.border),
          borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 10,
          backgroundColor: colors.surface,
        }}>
        <Ionicons name="calendar-outline" size={15} color={colors.textSecondary} />
        <Text style={{ fontSize: TYPO.body, color: dob ? colors.textPrimary : colors.textTertiary }}>
          {dob ? fmtDate(localDateStr(dob)) : 'Tap to choose a date'}
        </Text>
      </TouchableOpacity>
      {dobError ? (
        <Text style={{ fontSize: TYPO.caption, color: colors.danger, marginTop: 4 }}>{dobError}</Text>
      ) : null}
      {showDobPicker && (
        <View style={{ borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, marginTop: 8 }}>
          <DateTimePicker
            value={dob ?? MAX_DOB}
            mode="date"
            display="spinner"
            minimumDate={MIN_DOB}
            maximumDate={MAX_DOB}
            onChange={(_e, d) => { if (d) setDob(d); }}
            textColor={colors.textPrimary}
            style={{ height: 180, width: '100%' }}
          />
          <TouchableOpacity onPress={() => setShowDobPicker(false)} style={{ alignSelf: 'flex-end', padding: 12 }}>
            <Text style={{ color: colors.primary, fontWeight: '900', fontSize: TYPO.body }}>Done</Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={{ marginBottom: 14 }} />

      {/* Email — optional, informational contact only (this app doesn't
          send a verification link to it here — that's the SEPARATE
          member_invitations/send-member-invite email system). Reuses
          FamilyMember.email, the same field an accepted email invite or a
          code-joined member ends up with. */}
      <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginBottom: 8 }}>
        Email <Text style={{ fontWeight: '400' }}>(optional)</Text>
      </Text>
      <TextInput
        value={email} onChangeText={setEmail} onBlur={() => setTouched(t => ({ ...t, email: true }))}
        placeholder="e.g. emma@example.com" placeholderTextColor={colors.textTertiary}
        autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
        style={{
          borderWidth: 1.5, borderColor: (touched.email && emailError) ? colors.danger : colors.border, borderRadius: RADIUS.sm,
          paddingHorizontal: 12, paddingVertical: 10, fontSize: TYPO.body,
          color: colors.textPrimary, backgroundColor: colors.surface,
        }}
      />
      {touched.email && emailError ? (
        <Text style={{ fontSize: TYPO.caption, color: colors.danger, marginTop: 4 }}>{emailError}</Text>
      ) : null}
      <View style={{ marginBottom: 14 }} />

      <TouchableOpacity onPress={handleAddMember} disabled={creating || !formValid}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          borderRadius: RADIUS.md, paddingVertical: 12, marginBottom: 24,
          backgroundColor: colors.primary, opacity: (creating || !formValid) ? 0.5 : 1,
        }}>
        {creating ? <ActivityIndicator size="small" color="#fff" /> : (
          <>
            <Ionicons name="person-add-outline" size={16} color="#fff" />
            <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#fff' }}>Add & Generate Code</Text>
          </>
        )}
      </TouchableOpacity>

      <SectionHeader label={`Pending Invites (${pendingMembers.length})`} colors={colors} />
      {loadingInvites ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
      ) : pendingMembers.length === 0 ? (
        <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, textAlign: 'center', paddingVertical: 12 }}>
          No pending invites — add someone above.
        </Text>
      ) : (
        pendingMembers.map(m => {
          const inv = invitesByMember[m.id];
          const isLive = inv && inv.status === 'pending';
          return (
            <View key={m.id} style={{
              borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.border,
              backgroundColor: colors.card, padding: 12, marginBottom: 10,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 18 }}>{m.emoji ?? '👤'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>{m.name}</Text>
                  <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary }}>
                    {m.relationship ?? m.role} · Not yet joined
                  </Text>
                </View>
              </View>

              {isLive ? (
                <View style={{ marginTop: 10, gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    borderRadius: RADIUS.sm, borderWidth: 1, borderColor: colors.primary + '40',
                    backgroundColor: colors.primaryLight, paddingHorizontal: 12, paddingVertical: 10 }}>
                    <Text style={{ fontSize: 18, fontWeight: '900', letterSpacing: 3, color: colors.textPrimary }}>{inv.code}</Text>
                    <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>{fmtExpiry(inv.expires_at)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity onPress={() => copyCode(m.id, inv.code)}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                        paddingVertical: 9, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: colors.border }}>
                      <Ionicons name={copiedId === m.id ? 'checkmark' : 'copy-outline'} size={14} color={colors.textPrimary} />
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>
                        {copiedId === m.id ? 'Copied' : 'Copy'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => shareCode(m.name, inv.code)}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                        paddingVertical: 9, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: colors.border }}>
                      <Ionicons name="share-outline" size={14} color={colors.textPrimary} />
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>Share</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => generateCodeFor(m.id)} disabled={regenerating === m.id}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                        paddingVertical: 9, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: colors.border }}>
                      {regenerating === m.id
                        ? <ActivityIndicator size="small" color={colors.textPrimary} />
                        : <><Ionicons name="refresh-outline" size={14} color={colors.textPrimary} />
                            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>New Code</Text></>}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity onPress={() => generateCodeFor(m.id)} disabled={regenerating === m.id}
                  style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                    paddingVertical: 10, borderRadius: RADIUS.sm, backgroundColor: colors.primary,
                    opacity: regenerating === m.id ? 0.6 : 1 }}>
                  {regenerating === m.id ? <ActivityIndicator size="small" color="#fff" /> : (
                    <>
                      <Ionicons name="key-outline" size={14} color="#fff" />
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>
                        {inv?.status === 'expired' ? 'Generate New Code' : 'Generate Code'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
              {/* Inline result instead of showAlert() — this sheet is itself
                  a Modal, and alerting over it while still open reproduced a
                  real total-touch-freeze (see codeStatus's own comment above). */}
              {codeStatus?.memberId === m.id && (
                <View style={{ marginTop: 8, padding: 10, borderRadius: RADIUS.sm,
                  backgroundColor: codeStatus.kind === 'error' ? colors.danger + '18' : colors.tealLight,
                  flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <Ionicons name={codeStatus.kind === 'error' ? 'alert-circle' : 'checkmark-circle'} size={15}
                    color={codeStatus.kind === 'error' ? colors.danger : colors.teal} style={{ marginTop: 1 }} />
                  <Text style={{ flex: 1, fontSize: TYPO.caption, color: codeStatus.kind === 'error' ? colors.danger : colors.teal, lineHeight: 17 }}>
                    {codeStatus.text}
                  </Text>
                </View>
              )}
            </View>
          );
        })
      )}

      {claimedInvitees.length > 0 && (
        <View style={{ marginTop: 8 }}>
          <SectionHeader label={`Already Joined (${claimedInvitees.length})`} colors={colors} />
          {claimedInvitees.map(m => (
            <View key={m.id} style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              paddingVertical: 8, paddingHorizontal: 12, borderRadius: RADIUS.sm,
              backgroundColor: colors.surface, marginBottom: 6,
              borderWidth: 1, borderColor: colors.success + '30',
            }}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{m.name}</Text>
              <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>{m.relationship ?? m.role}</Text>
            </View>
          ))}
        </View>
      )}
    </AppBottomSheet>
  );
}

// ─── Edit My Profile sheet ──────────────────────────────────────────────────
// Self-service — the CURRENTLY ACTIVE member editing their OWN name/DOB/
// email/avatar. Distinct from EditMemberModal (RosterTab.tsx), which is the
// parent-edits-a-DIFFERENT-member flow with its own role/relationship/
// driving-earnings fields that don't apply to editing yourself. Same avatar
// picker pattern as CompleteProfileScreen (emoji grid or a real photo via
// expo-image-picker + uploadMemberAvatar) and the same DOB/email validation
// InviteMemberSheet's add-form uses. Saves go straight through
// updateMember() — a member always has permission to write their own row,
// no saveMemberEdit role-vocabulary translation needed since role isn't
// editable here.
const AVATAR_EMOJIS = ['🧒','👦','👧','🧑','👩','👨','🧓','👴','👵','🦸','🧙','🧜','🦊','🐶','🐱','⭐'];

function EditMyProfileSheet({
  visible, onClose, member, colors, isDark,
}: {
  visible: boolean; onClose: () => void; member: FamilyMember; colors: any; isDark: boolean;
}) {
  const updateMember = useFamilyStore(s => s.updateMember);
  const [name, setName] = useState(member.name);
  const [email, setEmail] = useState(member.email ?? '');
  const [dob, setDob] = useState<Date | null>(member.dateOfBirth ? new Date(member.dateOfBirth + 'T00:00:00') : null);
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [pickedEmoji, setPickedEmoji] = useState<string | undefined>(undefined);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [touched, setTouched] = useState<{ name?: boolean; email?: boolean }>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);

  // Same fix as InviteMemberSheet's identical showDobPicker — closing this
  // sheet while the DOB picker was still open left its native inline
  // DateTimePicker mounted underneath the closing Modal, freezing all touch.
  useEffect(() => {
    if (!visible) setShowDobPicker(false);
  }, [visible]);

  // A member with a real Supabase Auth account (signed up themselves,
  // rather than a PIN-only profile someone else created) already has a
  // verified email on file in auth.users — pull it in instead of asking
  // them to retype it, and don't let it be hand-edited into something that
  // no longer matches their actual login. PIN-only members (kids/seniors
  // with no auth_user_id) have no auth.users row at all, so they keep the
  // plain editable field below.
  const hasRealAuth = !!member.authUserId;
  useEffect(() => {
    if (!hasRealAuth) return;
    supabase.auth.getUser().then(({ data }) => {
      if (data.user && data.user.id === member.authUserId && data.user.email) setEmail(data.user.email);
    });
  }, [hasRealAuth, member.authUserId]);

  const MAX_DOB = new Date();
  const MIN_DOB = new Date(Date.now() - 110 * 365.25 * 24 * 3600_000);
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const nameError = !name.trim() ? 'Name is required.' : name.trim().length > 60 ? 'Name is too long.' : undefined;
  const emailError = email.trim() && !EMAIL_RE.test(email.trim()) ? 'Enter a valid email address.' : undefined;
  const dobError = dob && (dob > MAX_DOB ? 'Date of birth can\'t be in the future.' : dob < MIN_DOB ? 'That date seems too far in the past.' : undefined);
  const formValid = !nameError && !emailError && !dobError;

  const currentAvatarPreview = photoUri ?? (pickedEmoji ? undefined : member.avatarUrl);
  const currentEmojiPreview = pickedEmoji ?? (member.avatarUrl ? undefined : member.emoji);

  // Close the picker sheet fully BEFORE launching the native camera/library
  // UI — same deliberate ordering as RosterTab.tsx's EditMemberModal (this
  // sheet is itself an AppBottomSheet, i.e. an RN <Modal>; stacking a
  // second native picker presentation on top of one still visible is a
  // known iOS freeze/deadlock).
  const pickPhoto = async (fromCamera: boolean) => {
    setShowPhotoPicker(false);
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      showAlert('Permission needed', `Allow ${fromCamera ? 'camera' : 'photo library'} access to change your photo.`);
      return;
    }
    try {
      await showPickerLoading(fromCamera ? 'Waiting for camera…' : 'Opening library…');
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      hidePickerLoading();
      if (!result.canceled && result.assets[0]) { setPhotoUri(result.assets[0].uri); setPickedEmoji(undefined); }
    } catch (e: any) {
      hidePickerLoading();
      showAlert(`Could not open ${fromCamera ? 'camera' : 'library'}`, e?.message);
    }
  };

  const handleSave = async () => {
    setTouched({ name: true, email: true });
    if (!formValid) return;
    setSaving(true);
    let avatarUrl: string | undefined;
    if (photoUri && member.familyId) {
      setUploading(true);
      try {
        avatarUrl = await uploadMemberAvatar(member.familyId, member.id, photoUri);
      } catch (e: any) {
        showAlert('Photo upload failed', "Couldn't upload the photo — other changes will still be saved.");
      }
      setUploading(false);
    }
    // Dismiss FIRST, defer the store write (updateMember) until after the
    // dismiss animation settles — same fix as RosterTab.tsx's EditMemberModal
    // Save handler (see its comment for the full why: this member's card
    // renders in BOTH the carousel below and the identity card above on
    // this same screen, so updateMember here re-renders more of this screen
    // than almost any other save path in the app).
    const patch = {
      name: name.trim(),
      email: email.trim() ? email.trim().toLowerCase() : undefined,
      dateOfBirth: dob ? localDateStr(dob) : undefined,
      ...(avatarUrl ? { avatarUrl, emoji: undefined } : {}),
      ...(pickedEmoji ? { emoji: pickedEmoji, avatarUrl: undefined } : {}),
    };
    onClose();
    InteractionManager.runAfterInteractions(() => {
      setSaving(false);
      updateMember(member.id, patch);
    });
  };

  return (
    <AppBottomSheet visible={visible} onClose={onClose} title="Edit My Profile"
      subtitle="Your own name, photo, birthday, and email" minHeight="65%" maxHeight="92%">

      <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginBottom: 8 }}>Photo</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <TouchableOpacity
          onPress={() => setShowPhotoPicker(true)}
          style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center',
            backgroundColor: colors.primaryLight, borderWidth: 2, borderColor: colors.primary, overflow: 'hidden' }}>
          {currentAvatarPreview ? (
            <Image source={{ uri: currentAvatarPreview }} style={{ width: 64, height: 64 }} />
          ) : (
            <Text style={{ fontSize: 30 }}>{currentEmojiPreview ?? '👤'}</Text>
          )}
        </TouchableOpacity>
        {(photoUri || pickedEmoji) && (
          <TouchableOpacity onPress={() => { setPhotoUri(null); setPickedEmoji(undefined); }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>Reset</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
        {AVATAR_EMOJIS.map(e => (
          <TouchableOpacity key={e}
            onPress={() => { setPickedEmoji(e); setPhotoUri(null); }}
            style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
              backgroundColor: pickedEmoji === e ? colors.primaryLight : 'transparent',
              borderWidth: pickedEmoji === e ? 1.5 : 0, borderColor: colors.primary }}>
            <Text style={{ fontSize: 18 }}>{e}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginBottom: 8 }}>Name</Text>
      <TextInput
        value={name} onChangeText={setName} onBlur={() => setTouched(t => ({ ...t, name: true }))}
        maxLength={60} placeholderTextColor={colors.textTertiary}
        style={{
          borderWidth: 1.5, borderColor: (touched.name && nameError) ? colors.danger : colors.border, borderRadius: RADIUS.sm,
          paddingHorizontal: 12, paddingVertical: 10, fontSize: TYPO.body,
          color: colors.textPrimary, backgroundColor: colors.surface,
        }}
      />
      {touched.name && nameError ? (
        <Text style={{ fontSize: TYPO.caption, color: colors.danger, marginTop: 4 }}>{nameError}</Text>
      ) : null}
      <View style={{ marginBottom: 14 }} />

      <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginBottom: 8 }}>
        Date of birth <Text style={{ fontWeight: '400' }}>(optional)</Text>
      </Text>
      <TouchableOpacity
        onPress={() => setShowDobPicker(v => !v)}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          borderWidth: 1.5, borderColor: dobError ? colors.danger : (showDobPicker ? colors.primary : colors.border),
          borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 10,
          backgroundColor: colors.surface,
        }}>
        <Ionicons name="calendar-outline" size={15} color={colors.textSecondary} />
        <Text style={{ fontSize: TYPO.body, color: dob ? colors.textPrimary : colors.textTertiary }}>
          {dob ? fmtDate(localDateStr(dob)) : 'Tap to choose a date'}
        </Text>
      </TouchableOpacity>
      {dobError ? (
        <Text style={{ fontSize: TYPO.caption, color: colors.danger, marginTop: 4 }}>{dobError}</Text>
      ) : null}
      {showDobPicker && (
        <View style={{ borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, marginTop: 8 }}>
          <DateTimePicker
            value={dob ?? MAX_DOB}
            mode="date"
            display="spinner"
            minimumDate={MIN_DOB}
            maximumDate={MAX_DOB}
            onChange={(_e, d) => { if (d) setDob(d); }}
            textColor={colors.textPrimary}
            style={{ height: 180, width: '100%' }}
          />
          <TouchableOpacity onPress={() => setShowDobPicker(false)} style={{ alignSelf: 'flex-end', padding: 12 }}>
            <Text style={{ color: colors.primary, fontWeight: '900', fontSize: TYPO.body }}>Done</Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={{ marginBottom: 14 }} />

      <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginBottom: 8 }}>
        Email {hasRealAuth ? <Text style={{ fontWeight: '400' }}>(from your sign-in, can't be edited here)</Text> : <Text style={{ fontWeight: '400' }}>(optional)</Text>}
      </Text>
      <TextInput
        value={email} onChangeText={setEmail} onBlur={() => setTouched(t => ({ ...t, email: true }))}
        placeholder="e.g. you@example.com" placeholderTextColor={colors.textTertiary}
        autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
        editable={!hasRealAuth}
        style={{
          borderWidth: 1.5, borderColor: (touched.email && emailError) ? colors.danger : colors.border, borderRadius: RADIUS.sm,
          paddingHorizontal: 12, paddingVertical: 10, fontSize: TYPO.body,
          color: hasRealAuth ? colors.textSecondary : colors.textPrimary,
          backgroundColor: hasRealAuth ? colors.border + '30' : colors.surface,
        }}
      />
      {touched.email && emailError ? (
        <Text style={{ fontSize: TYPO.caption, color: colors.danger, marginTop: 4 }}>{emailError}</Text>
      ) : null}

      {member.createdAt ? (
        <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, marginTop: 14 }}>
          Member since {new Date(member.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </Text>
      ) : null}

      <TouchableOpacity onPress={handleSave} disabled={saving || !formValid}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          borderRadius: RADIUS.md, paddingVertical: 12, marginTop: 20, marginBottom: 12,
          backgroundColor: colors.primary, opacity: (saving || !formValid) ? 0.5 : 1,
        }}>
        {saving ? <ActivityIndicator size="small" color="#fff" /> : (
          <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#fff' }}>{uploading ? 'Uploading…' : 'Save Changes'}</Text>
        )}
      </TouchableOpacity>

      <PhotoPickerSheet
        visible={showPhotoPicker} onClose={() => setShowPhotoPicker(false)}
        onTakePhoto={() => pickPhoto(true)} onChooseLibrary={() => pickPhoto(false)}
        onRemove={currentAvatarPreview ? () => { setShowPhotoPicker(false); setPhotoUri(null); setPickedEmoji(undefined); } : undefined}
        avatarUri={currentAvatarPreview} avatarEmoji={currentEmojiPreview} name={member.name}
        colors={colors} isDark={isDark} />
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
  // Narrow, individually-selected subscriptions — was a bare useFamilyStore()
  // with no selector, which subscribes to the ENTIRE store object and
  // re-renders this whole screen (carousel, FamilyTreeView, and whichever
  // sheet happens to be open, since every sheet is a conditionally-rendered
  // sibling here, not lazily mounted) on every unrelated store tick:
  // familyStore's realtime members-table subscription firing, AsyncStorage
  // cache writes, syncFromDB polling, even loaded/familyName changing.
  // None of that has anything to do with what's on screen most of the time,
  // but the old bare call meant this component re-rendered anyway — and
  // with a several-member carousel of un-memoized <Image> avatars underneath
  // whatever sheet is open, that re-render (re-decoding several avatar
  // images synchronously) landing in the same frame as a sheet's own
  // layout/animation work (AppBottomSheet re-measures on every
  // onContentSizeChange, e.g. a validation error appearing) is exactly the
  // kind of stacked-heavy-work freeze already diagnosed once this session
  // for the photo-picker-over-Modal and save-then-close cases.
  const allMembers = useFamilyStore(s => s.members);
  const activeMemberId = useFamilyStore(s => s.activeMemberId);
  const updateMember = useFamilyStore(s => s.updateMember);
  const removeMember = useFamilyStore(s => s.removeMember);
  const setActiveMember = useFamilyStore(s => s.setActiveMember);
  const { signOut } = useAuthStore();
  const { tier, isTrial, trialDaysLeft } = useSubscriptionStore();
  const [restoringPurchase, setRestoringPurchase] = useState(false);

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
  const householdSettings = useChoreStore(s => s.householdSettings);
  const updateHouseholdSettings = useChoreStore(s => s.updateHouseholdSettings);
  const [showCurrencySheet, setShowCurrencySheet] = useState(false);
  const familyName = useFamilyStore(s => s.familyName);
  const renameFamily = useFamilyStore(s => s.renameFamily);
  const [showFamilyNameSheet, setShowFamilyNameSheet] = useState(false);

  // Same "who's actually in this family right now" filter RosterTab uses —
  // soft-deleted members and not-yet-claimed pending invitees stay out of
  // the live carousel/tree (pending invitees get their own list, inside
  // InviteMemberSheet). Memoized: a bare .filter() on every render produces
  // a brand-new array identity even when `allMembers` itself hasn't
  // changed, which would silently defeat CarouselMemberCard/FamilyTreeView's
  // own React.memo below (their `members`/`siblings` props never being
  // reference-equal across renders means memo never short-circuits).
  const members = useMemo(
    () => allMembers.filter(m => !m.deletedAt && m.inviteStatus !== 'pending'),
    [allMembers]
  );

  // No ?? allMembers[0] fallback — that silently substituted a DIFFERENT
  // member (almost always the real parent/auth-owner) whenever
  // activeMemberId failed to resolve, which could flip isAuthLinked to
  // true while viewing what should be a PIN-only sub-profile's screen —
  // a real security-relevant bug (showed "Sign Out" for the wrong
  // identity instead of the Lock/switch-back flow below).
  const activeMember = allMembers.find(m => m.id === activeMemberId);
  const role: MemberRole = activeMember?.role ?? 'parent';
  const isParent = role === 'parent';
  const isAuthLinked = !!activeMember?.authUserId;
  const familyId = activeMember?.familyId ?? '';
  // The real signed-in Supabase user, regardless of which member is
  // currently active — used to distinguish "I'm looking at my OWN
  // profile" (Sign Out is real) from "I PIN-switched into someone else's
  // profile" (only a Lock/switch-back is safe here, never a real
  // Supabase sign-out).
  const authUserId = useAuthStore(s => s.session?.user?.id);
  // Real Sign Out revokes this device's refresh token server-side. For a
  // real account that's fine — the person has an email/password (or Face
  // ID) to sign back in with. For an anonymous joiner (every kid/GP who
  // joined via invite code — see JoinFamilyScreen.tsx's
  // signInAnonymously()), there is NO credential to sign back in with:
  // "I have an account" needs one, and "I'm joining a family" would try to
  // create a brand-new identity that join-family's own claim guard blocks
  // for an already-active member. Signing out was a real, confusing dead
  // end for this population (live-reported) — the only way back in from
  // there is a parent-generated device-recovery code (same as a lost
  // device), which is a much bigger ask than "just sign back in." Hide the
  // real Sign Out for an anonymous session and point at Lock instead,
  // which never revokes the session.
  const isAnonymousSession = useAuthStore(s => !!(s.session?.user as any)?.is_anonymous);
  const authOwnerMember = allMembers.find(m => m.authUserId === authUserId);
  const viewingOwnProfile = !!activeMember && activeMember.id === authOwnerMember?.id;
  // isParent above reads the CURRENTLY ACTIVE member's role — correct for
  // most of this screen, but wrong for gating a parent-driven action like
  // handleDeleteProfile: when a parent PIN-switches into a kid's profile,
  // activeMember IS the kid, so isParent reads false even though the real
  // signed-in owner is a parent. Use the real owner's own role for that.
  const isRealOwnerParent = authOwnerMember?.role === 'parent';
  // Cheap RLS-scoped self-lookup (app_admins_select_self) — a kid/senior
  // profile's auth session (if any) simply won't have a matching row, so
  // this always resolves to false for them; gated below on isParent too.
  const { isAdmin: isAppAdmin } = useIsAppAdmin();

  // Member carousel + inline family tree — same single unified-sheet wiring
  // RosterTab.tsx uses: ONE MemberProfileSheet instance per member, whose
  // own internal `section` state (view/edit/pin/confirmRemove) handles
  // everything that used to be three separate stacked modals
  // (MemberProfileSheet/EditMemberModal/PinModal). viewTarget tracks which
  // member the sheet is open for; initialSection tracks which section it
  // should land on (tap → 'view', long-press → 'edit', key icon → 'pin').
  const [viewTarget, setViewTarget] = useState<FamilyMember | null>(null);
  const [initialSection, setInitialSection] = useState<'view' | 'edit' | 'pin'>('view');
  const openMember = (m: FamilyMember, section: 'view' | 'edit' | 'pin' = 'view') => { setInitialSection(section); setViewTarget(m); };
  const [showFullTree, setShowFullTree] = useState(false);
  const [showInviteSheet, setShowInviteSheet] = useState(false);
  const [showEditMyProfile, setShowEditMyProfile] = useState(false);

  const savePin = async (memberId: string, pin: string) => {
    // Was a raw supabase.from('members').update() + updateMember() bypass
    // that skipped familyStore's own setMemberPin() entirely — same
    // duplicated-bypass shape as RosterTab.tsx's identical savePin (both
    // fixed together). Routing through setMemberPin gets the error handling
    // this already had AND the co-parent security notify it didn't: this
    // sheet is reachable by a parent resetting a DIFFERENT member's PIN
    // (canChangePin={isParent || viewTarget.id === activeMemberId} above),
    // which previously told nobody else it happened.
    try {
      await useFamilyStore.getState().setMemberPin(memberId, pin, activeMemberId ?? undefined);
    } catch (e: any) {
      showAlert("Couldn't save PIN", e?.message ?? 'Something went wrong.');
    }
  };

  const saveMember = async (memberId: string, name: string, mRole: string, hasCar: boolean, rideEarningsPerRun: number, groceryEarningsPerRun: number, subRole?: string, relationship?: string, avatarEmoji?: string, avatarUrl?: string) => {
    const { error } = await saveMemberEdit(updateMember, memberId, name, mRole, hasCar, rideEarningsPerRun, groceryEarningsPerRun, subRole, relationship, avatarEmoji, avatarUrl);
    if (error) showAlert("Couldn't save changes", error);
  };

  const deleteFamilyMember = async (memberId: string) => {
    try {
      await removeMember(memberId);
    } catch (e: any) {
      showAlert('Could Not Remove Member', e?.message || 'Something went wrong removing this family member.');
    }
  };

  // Member-scoped resend, mirroring RosterTab.tsx's own resendInviteFor —
  // used by the unified member sheet's GP-only "Resend Invite" action.
  // Generates a brand-new code tied to that member's row (targetMemberId),
  // same per-invitee model InviteMemberSheet uses. Returns the result
  // instead of alerting directly — this runs from inside
  // MemberProfileSheet's still-open bottom sheet (a Modal), and firing an
  // alert while that Modal is visible reproduced a real on-device freeze;
  // the sheet renders the result inline (code + copy/share) instead.
  const resendInviteFor = async (targetMember: FamilyMember): Promise<{ ok: true; code: string; emailSent?: boolean; emailError?: string | null } | { ok: false; error: string }> => {
    if (!familyId || !activeMember?.id) return { ok: false, error: 'Not ready yet — try again in a moment.' };
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
      const anonKey     = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
      const res = await fetch(`${supabaseUrl}/functions/v1/generate-invite-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', 'apikey': anonKey,
          ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ familyId, memberId: activeMember.id, targetMemberId: targetMember.id }),
      });
      const json = await res.json();
      if (json.ok) return { ok: true, code: json.code, emailSent: json.emailSent, emailError: json.emailError };
      return { ok: false, error: json.error ?? 'Something went wrong.' };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'Network error.' };
    }
  };

  // Same pattern as resendInviteFor above, but for an already-ACTIVE member
  // whose original device was lost/wiped — see RosterTab.tsx's identical
  // generateRecoveryCodeFor for the full rationale (distinct edge
  // function/table from generate-invite-code; re-authenticates an EXISTING
  // identity instead of claiming a pending one).
  const generateRecoveryCodeFor = async (targetMember: FamilyMember): Promise<{ ok: true; code: string } | { ok: false; error: string }> => {
    if (!familyId || !activeMember?.id) return { ok: false, error: 'Not ready yet — try again in a moment.' };
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
      const anonKey     = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
      const res = await fetch(`${supabaseUrl}/functions/v1/generate-recovery-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', 'apikey': anonKey,
          ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ familyId, memberId: activeMember.id, targetMemberId: targetMember.id }),
      });
      const json = await res.json();
      if (json.ok) return { ok: true, code: json.code };
      return { ok: false, error: json.error ?? 'Something went wrong.' };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'Network error.' };
    }
  };

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

  const expectedConfirmWord = (isAuthLinked && !isAnonymousSession) ? 'DELETE' : activeMember.name.toUpperCase();

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

  // isAuthLinked alone (activeMember.authUserId truthy) doesn't mean "has a
  // REAL account" — an anonymous joiner (PIN/code login, no email/password)
  // has an auth_user_id too, just an anonymous one. handleDeleteAccount's
  // self-service "Delete account" copy/flow assumes a real account someone
  // could recreate by signing back in, which doesn't apply here (live-
  // reported: a PIN/code-logged-in member saw the real-account delete
  // option for themselves, misleading and never actually appropriate for
  // that identity). Only a genuinely real (non-anonymous) auth session gets
  // the self-service "Delete account" path now.
  // Must also require viewingOwnProfile — isAnonymousSession/isAuthLinked
  // both read the ONE real Supabase session this device holds, which
  // belongs to whoever the REAL auth owner is. A parent PIN-switched into
  // a kid's profile still has their own real, non-anonymous session live
  // underneath — without this check, hasRealAccount came back true for the
  // KID's screen too (live-reported: a parent viewing an anonymous kid's
  // profile via Lock/switch-back still saw "Delete account", the real-
  // account self-service copy, instead of the parent-driven
  // delete-this-profile flow it should always be for someone else's
  // profile).
  const hasRealAccount = isAuthLinked && !isAnonymousSession && viewingOwnProfile;
  const dangerAction = hasRealAccount ? handleDeleteAccount : handleDeleteProfile;
  // Non-auth/anonymous "delete profile" is a PARENT-only action on a kid/
  // senior's PIN- or code-only profile — that member themselves shouldn't
  // be able to delete their own profile from this screen (no real account
  // to lose control of, and it'd let a kid nuke themselves out of the
  // family unsupervised). Gated on the REAL signed-in owner's role
  // (isRealOwnerParent), not the currently-displayed member's role — see
  // isRealOwnerParent's own comment for why isParent alone is wrong here.
  const canShowDangerZone = hasRealAccount || (isRealOwnerParent && !viewingOwnProfile);

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

      {/* KeyboardAvoidingView added — the Danger Zone's "type DELETE to
          confirm" input sits near the bottom of a long scroll view with no
          keyboard handling at all, so the keyboard covered it outright
          instead of the view shifting up (live-reported, screenshot showed
          the field hidden behind the keyboard). */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      {/* The shared Ask Cube FAB is visible on this tab by default (no
          Profile-specific exclusion in app/(tabs)/_layout.tsx) — same
          overlap risk fixed on Hub/Quests/School/Health/Memories. */}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Identity card — tappable, opens EditMyProfileSheet (self-service:
            name/DOB/email/avatar for the CURRENTLY ACTIVE member only,
            available to everyone regardless of role). Distinct from the
            unified MemberProfileSheet's edit section below, which is the
            parent-edits-someone-ELSE flow. */}
        <TouchableOpacity onPress={() => setShowEditMyProfile(true)} activeOpacity={0.75} style={{
          flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16,
          borderRadius: RADIUS.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
          marginBottom: 24,
        }}>
          <View style={{
            width: 52, height: 52, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center',
            backgroundColor: role === 'parent' ? colors.parentLight : colors.kidLight, overflow: 'hidden',
          }}>
            {activeMember.avatarUrl ? (
              <Image source={{ uri: activeMember.avatarUrl }} style={{ width: 52, height: 52 }} />
            ) : (
              <Text style={{ fontSize: 26 }}>{activeMember.emoji ?? '👤'}</Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.heading, fontWeight: '800', color: colors.textPrimary }}>{activeMember.name}</Text>
            <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, marginTop: 2 }}>
              {role.charAt(0).toUpperCase() + role.slice(1)}
              {isAuthLinked ? ' · Signed in' : ' · PIN profile'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </TouchableOpacity>

        <EditMyProfileSheet visible={showEditMyProfile} onClose={() => setShowEditMyProfile(false)}
          member={activeMember} colors={colors} isDark={isDark} />

        {/* Family — member carousel + expandable full tree, the same
            underlying components (MemberCard/FamilyTreeView/
            MemberProfileSheet) RosterTab.tsx uses, so this page offers a
            first-class version of the same experience instead of just
            linking out to the Roster tab. Tap a card → the unified
            MemberProfileSheet, read-only 'view' section (never switches
            activeMemberId — an admin views without impersonating). Long-
            press (parents only) → same sheet, landing on its 'edit'
            section. Key icon → same sheet, landing on its 'pin' section. */}
        <View style={{ marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <SectionHeader label="Family" colors={colors} />
            {isParent && (
              <TouchableOpacity onPress={() => setShowInviteSheet(true)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto', marginBottom: 10 }}>
                <Ionicons name="person-add-outline" size={14} color={colors.primary} />
                <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.primary }}>Invite</Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 4 }}>
            {members.map(m => (
              <CarouselMemberCard key={m.id} m={m} isActive={m.id === activeMemberId} isParentViewer={isParent}
                colors={colors} isDark={isDark}
                onPress={() => openMember(m, 'view')}
                onLongPress={() => { if (isParent) openMember(m, 'edit'); }}
                onPinPress={() => openMember(m, 'pin')} />
            ))}
          </ScrollView>

          <TouchableOpacity onPress={() => setShowFullTree(v => !v)}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              marginTop: 12, paddingVertical: 10, borderRadius: RADIUS.md,
              backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
            }}>
            <Ionicons name={showFullTree ? 'chevron-up' : 'git-network-outline'} size={15} color={colors.textSecondary} />
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>
              {showFullTree ? 'Hide full family tree' : 'See full family tree'}
            </Text>
          </TouchableOpacity>

          {showFullTree && (
            <View style={{ marginTop: 14 }}>
              <FamilyTreeView
                members={members} activeMemberId={activeMemberId} isParent={isParent}
                colors={colors} isDark={isDark}
                onView={(m) => openMember(m, 'view')} onEdit={(m) => openMember(m, 'edit')} onPin={(m) => openMember(m, 'pin')}
              />
            </View>
          )}
        </View>

        {/* Member sheet — ONE unified instance (view/edit/pin/confirmRemove
            all live inside MemberProfileSheet's own `section` state)
            instead of the old MemberProfileSheet/EditMemberModal/PinModal
            trio of separately-mounted Modals. */}
        {viewTarget && (
          <MemberProfileSheet member={viewTarget} siblings={members.map(m => m.name)} allMembers={members}
            visible onClose={() => setViewTarget(null)}
            initialSection={initialSection}
            isParentViewer={isParent}
            canChangePin={isParent || viewTarget.id === activeMemberId}
            onSave={saveMember}
            onLinkParent={(id, parentId) => updateMember(id, { linkedParentId: parentId })}
            onDelete={deleteFamilyMember}
            onSavePin={savePin}
            onResetPin={(m) => openMember(m, 'pin')}
            onResendInvite={(m) => resendInviteFor(m)}
            onGenerateRecoveryCode={(m) => generateRecoveryCodeFor(m)}
            colors={colors} isDark={isDark} />
        )}
        {isParent && familyId && (
          <InviteMemberSheet visible={showInviteSheet} onClose={() => setShowInviteSheet(false)}
            familyId={familyId} callerMemberId={activeMember.id} members={allMembers}
            colors={colors} isDark={isDark} />
        )}

        {/* Subscription */}
        <View style={{ marginBottom: 24 }}>
          <SectionHeader label="Subscription" colors={colors} />
          <Row
            icon="star-outline"
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
            icon="refresh-outline"
            label={restoringPurchase ? 'Restoring…' : 'Restore Purchases'}
            onPress={restoringPurchase ? undefined : handleRestorePurchases}
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

        {/* Family Name — familyName was previously stuck forever at the
            store's 'Our Family' default (nothing fetched families.name or
            wrote a rename back to it); this is the first working rename
            path. Same parent-editable / read-only-for-others split as
            Currency below. */}
        <View style={{ marginBottom: 24 }}>
          <SectionHeader label="Family" colors={colors} />
          <Row
            icon="home-outline"
            label={familyName}
            subtitle={isParent ? 'Tap to rename' : undefined}
            onPress={isParent ? () => setShowFamilyNameSheet(true) : undefined}
            colors={colors} isDark={isDark}
          />
        </View>

        {isParent && (
          <FamilyNameSheet
            visible={showFamilyNameSheet}
            onClose={() => setShowFamilyNameSheet(false)}
            currentName={familyName}
            renameFamily={renameFamily}
            colors={colors} isDark={isDark}
          />
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

        {/* Calendar Sync — parent-only, per-member OAuth connection used
            purely for FreeBusy conflict detection (not full 2-way sync,
            see CalendarSyncScreen.tsx's own header comment). */}
        {isParent && (
          <View style={{ marginBottom: 24 }}>
            <SectionHeader label="Calendar" colors={colors} />
            <Row
              icon="calendar-outline"
              label="Calendar Sync"
              subtitle="Connect your work calendar to catch scheduling conflicts"
              onPress={() => router.push('/profile-settings/calendar-sync')}
              colors={colors} isDark={isDark}
            />
          </View>
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

        {/* Admin console — hidden entry point. Only rendered for a parent
            whose auth session is confirmed as a platform admin (app_admins
            row) via the same useIsAppAdmin() hook the /admin gate itself
            uses, so a non-admin parent never sees this row AND can't reach
            the gate by any other path either — see features/admin/_layout.tsx. */}
        {isParent && isAppAdmin && (
          <View style={{ marginBottom: 24 }}>
            <SectionHeader label="Admin" colors={colors} />
            <Row
              icon="shield-checkmark-outline"
              label="Admin Console"
              subtitle="Analytics, families, feature flags, paywall, broadcast"
              onPress={() => router.push('/admin')}
              colors={colors} isDark={isDark}
            />
          </View>
        )}

        {/* Sign out — plain, reversible action, distinct from the danger
            zone's "Delete account" below (that's permanent; this just ends
            the device session, same signOut()+redirect the delete-account
            handler already runs after its own soft-delete). Only shown for
            an auth-linked, NON-anonymous member — a PIN-only kid/senior
            profile has no independent session of their own to sign out of
            (they switch profiles instead), and an anonymous joiner has no
            credential to sign back in with once this revokes their session
            (see isAnonymousSession's comment above) — for them this would
            be a real dead end, not a reversible everyday action. No
            confirmation needed for the real-account case — signing out is
            normal, everyday UX. */}
        {isAuthLinked && viewingOwnProfile && !isAnonymousSession && (
          <View style={{ marginBottom: 24 }}>
            <Row
              icon="log-out-outline"
              label="Sign Out"
              subtitle="You can sign back in anytime"
              onPress={async () => {
                try {
                  await signOut();
                } catch (e: any) {
                  console.error('[ProfileSettingsScreen] Sign Out failed:', e?.message, e);
                  // Don't leave the user stuck mid-session on a failed sign-out —
                  // navigate to login regardless, since local state was likely
                  // still cleared even if the network signOut() call itself threw.
                }
                // Must match the SIGNED_OUT listener's own destination in
                // app/_layout.tsx EXACTLY (same signedOut=1 param) — this was
                // previously a bare '/(auth)/login' with no param, so if this
                // navigation won a race against the listener's, LoginScreen
                // mounted with justSignedOut=false and could auto-trigger its
                // Face ID/biometric-restore effect right after an explicit
                // sign-out (reported: sign-out skipped the login screen
                // entirely and landed on /onboarding, consistent with a
                // stale/racing session getting silently restored).
                router.replace('/(auth)/login?signedOut=1' as any);
              }}
              colors={colors} isDark={isDark}
            />
          </View>
        )}

        {/* Anonymous joiner's own profile — no real Sign Out (see the gate
            above), but staying silent here would look like the feature was
            simply forgotten, not deliberately withheld. Explain why, and
            point at the one thing that IS safe: locking the device (which
            just requires the PIN again next time, no session loss) instead
            of a real sign-out with no way back in. */}
        {isAuthLinked && viewingOwnProfile && isAnonymousSession && (
          <View style={{ marginBottom: 24, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border,
            backgroundColor: colors.surface, padding: 14, gap: 6 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>
              No Sign Out here
            </Text>
            <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, lineHeight: 18 }}>
              You joined with an invite code, not an email — there's nothing to sign back in WITH if you sign out. If you're switching to someone else's profile, use the switcher instead. If you lose this device, ask a parent for a recovery code.
            </Text>
          </View>
        )}

        {/* PIN-switched into a sub-profile (GP/kid/teen/etc, no authUserId
            of their own) — never show a real Sign Out here, since tapping
            it would end the REAL account's session while looking at
            someone else's profile. Only a Lock/"Switch back" is safe:
            purely a local activeMemberId swap gated by the real owner's
            own PIN, no Supabase call at all. */}
        {!viewingOwnProfile && authOwnerMember && (
          <View style={{ marginBottom: 24 }}>
            <Row
              icon="lock-closed-outline"
              label="Lock & Switch Back"
              subtitle={`Return to ${authOwnerMember.name.split(' ')[0]}'s profile`}
              onPress={() => {
                // Always lands on the shared-device profile picker instead
                // of going straight back into the owner's own Hub — any
                // family member can tap their own avatar next, kiosk-style.
                // Deliberately does NOT touch activeMemberId here: the
                // picker screen owns the actual member swap (same
                // tap-avatar-then-PIN flow PersonaSwitcherSheet already
                // uses), so there's never a moment where activeMemberId is
                // null/invalid for the rest of the app's code to trip over.
                router.replace('/(auth)/profile-picker' as any);
              }}
              colors={colors} isDark={isDark}
            />
          </View>
        )}

        {/* Danger zone */}
        {canShowDangerZone && (
          <View style={{ marginBottom: 24 }}>
            <SectionHeader label="Danger Zone" colors={colors} />
            {!showDangerConfirm ? (
              <Row
                icon="warning-outline"
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
                padding: 14, borderRadius: RADIUS.md, backgroundColor: colors.card,
                borderWidth: 1.5, borderColor: colors.danger + '50',
              }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.danger, marginBottom: 6 }}>
                  {hasRealAccount ? 'Delete your account?' : `Delete ${activeMember.name}'s profile?`}
                </Text>
                <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginBottom: 12, lineHeight: 18 }}>
                  {hasRealAccount
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
