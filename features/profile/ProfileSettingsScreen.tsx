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
import { View, Text, TouchableOpacity, ScrollView, Switch, ActivityIndicator, TextInput, Platform, Share, Image, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import { useFamilyStore, RELATIONSHIPS_BY_ROLE, type MemberRole, type FamilyMember } from '@/store/familyStore';
import { useChoreStore } from '@/store/choreStore';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import { setFamilyPhotoFrameEnabled } from '@/features/hub/parent/FamilyPhotoFrameCard';
import { showAlert } from '@/components/AppAlert';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import { restorePurchases, isRevenueCatReady } from '@/lib/subscription';
import { usePaywallSheetStore } from '@/store/paywallSheetStore';
import AppBottomSheet from '@/components/AppBottomSheet';
import { EditMyProfileScreen } from '@/features/profile/EditMyProfileScreen';
import {
  isBiometricAvailable, isBiometricEnabled, setBiometricEnabled, getBiometricLabel,
} from '@/lib/biometrics';
import PinEntryModal from '@/components/PinEntryModal';
import CouplePinModal from '@/components/CouplePinModal';
import { coupleChannelId } from '@/store/chatStore';
import { useCoupleChannelStore } from '@/store/coupleChannelStore';
import { useFeatureFlag } from '@/lib/featureFlags';
import { CarouselMemberCard } from '@/features/vault/tabs/MemberCard';
import { FamilyTreeView } from '@/features/vault/tabs/FamilyTreeView';
import { MemberProfileSheet } from '@/features/vault/tabs/MemberProfileSheet';
import { saveMemberEdit } from '@/features/vault/tabs/memberActions';
import { localDateStr, fmtDate } from '@/lib/dates';
import { useTermsContent } from '@/features/onboarding/screens/TermsScreen';
import DataRecoveryScreen from '@/features/profile/DataRecoveryScreen';
import { GEMINI } from '@/constants/geminiRhythm';

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

function SectionHeader({ label, colors, isDark }: { label: string; colors: any; isDark: boolean }) {
  return (
    <Text style={{
      fontSize: TYPO.label, fontWeight: '800', color: isDark ? colors.textTertiary : GEMINI.bodyColorLight,
      textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10,
    }}>
      {label}
    </Text>
  );
}

// Same live legal_documents copy every other Terms render site shows —
// exported so kiosk can render it inside its own side drawer instead of
// router.push'ing that full-screen route [live-requested: "tems and
// prviacy should show side bar"].
export function TermsContentBody({ colors, isDark = false }: { colors: any; isDark?: boolean }) {
  const { content: termsContent } = useTermsContent();
  return (
    <View style={{
      borderRadius: 16, borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border,
      backgroundColor: isDark ? colors.card : GEMINI.cardBg, padding: 16,
    }}>
      <Text style={{ fontSize: TYPO.caption, color: isDark ? colors.textSecondary : GEMINI.bodyColor, lineHeight: 20 }}>
        {termsContent}
      </Text>
    </View>
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
        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: danger ? colors.danger : (isDark ? colors.textPrimary : GEMINI.titleColor) }}>{label}</Text>
        {subtitle ? (
          <Text style={{ fontSize: TYPO.caption, color: isDark ? colors.textTertiary : GEMINI.bodyColorLight, marginTop: 1 }}>{subtitle}</Text>
        ) : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={isDark ? colors.textTertiary : GEMINI.bodyColorLight} /> : null)}
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

// Body only — extracted so kiosk can render the exact same real
// categories/call-alerts/quiet-hours state and logic inside its own
// KioskFormDrawer side panel instead of this file's AppBottomSheet
// [live-requested: "show the notification sheet right side bar"].
// Exported for that reuse; NotificationsSheet below is the unchanged
// mobile shell around it.
export function NotificationsSheetBody({
  activeMember, notifPrefs, setNotifPrefs,
  storeReminders, setStoreReminders, updateMember, colors, isDark,
}: {
  activeMember: any;
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
    <>
      <SectionHeader label="Categories" colors={colors} isDark={isDark} />
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
                trackColor={{ false: isDark ? colors.border : GEMINI.border, true: colors.primary }}
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
            trackColor={{ false: isDark ? colors.border : GEMINI.border, true: colors.primary }}
            thumbColor="#fff"
          />
        }
      />

      <View style={{ marginTop: 18 }}>
        <SectionHeader label="Call Alerts" colors={colors} isDark={isDark} />
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
              trackColor={{ false: isDark ? colors.border : GEMINI.border, true: colors.primary }}
              thumbColor="#fff"
            />
          }
        />
      </View>

      <View style={{ marginTop: 18 }}>
        <SectionHeader label="Quiet Hours" colors={colors} isDark={isDark} />
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
              trackColor={{ false: isDark ? colors.border : GEMINI.border, true: colors.primary }}
              thumbColor="#fff"
            />
          }
        />
        {quietEnabled && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity onPress={() => setPickerTarget('start')} style={{
              flex: 1, paddingVertical: 12, borderRadius: RADIUS.md, backgroundColor: isDark ? colors.card : GEMINI.cardBg,
              borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border, alignItems: 'center',
            }}>
              <Text style={{ fontSize: TYPO.caption, color: isDark ? colors.textTertiary : GEMINI.bodyColorLight, marginBottom: 2 }}>From</Text>
              <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: isDark ? colors.textPrimary : GEMINI.titleColor }}>{fmt12Hour(quietStart)}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPickerTarget('end')} style={{
              flex: 1, paddingVertical: 12, borderRadius: RADIUS.md, backgroundColor: isDark ? colors.card : GEMINI.cardBg,
              borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border, alignItems: 'center',
            }}>
              <Text style={{ fontSize: TYPO.caption, color: isDark ? colors.textTertiary : GEMINI.bodyColorLight, marginBottom: 2 }}>Until</Text>
              <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: isDark ? colors.textPrimary : GEMINI.titleColor }}>{fmt12Hour(quietEnd)}</Text>
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
    </>
  );
}

// renderShell lets kiosk swap this bottom sheet for its own right-side
// KioskFormDrawer around the exact same real body/state/logic
// [live-requested: "show the notification sheet right side bar"], without
// this mobile-owned file importing any kiosk component (fork-when-needed:
// kiosk owns its own shell, mobile never depends on it). Default is
// mobile's own unchanged AppBottomSheet — omitting the prop (as
// ProfileSettingsScreen's own call site below does) is byte-identical to
// before NotificationsSheetBody was extracted.
function NotificationsSheet({
  visible, onClose, activeMember, notifPrefs, setNotifPrefs,
  storeReminders, setStoreReminders, updateMember, colors, isDark,
  renderShell,
}: {
  visible: boolean; onClose: () => void; activeMember: any;
  notifPrefs: Partial<Record<string, boolean>>;
  setNotifPrefs: (p: Partial<Record<string, boolean>>) => void;
  storeReminders: boolean; setStoreReminders: (v: boolean) => void;
  updateMember: (id: string, patch: any) => void;
  colors: any; isDark: boolean;
  renderShell?: (visible: boolean, onClose: () => void, children: React.ReactNode) => React.ReactNode;
}) {
  const body = (
    <NotificationsSheetBody
      activeMember={activeMember} notifPrefs={notifPrefs} setNotifPrefs={setNotifPrefs}
      storeReminders={storeReminders} setStoreReminders={setStoreReminders}
      updateMember={updateMember} colors={colors} isDark={isDark}
    />
  );
  if (renderShell) return <>{renderShell(visible, onClose, body)}</>;
  return (
    <AppBottomSheet visible={visible} onClose={onClose} title="Notifications"
      subtitle="Choose what you hear about, and when" minHeight="60%" maxHeight="90%">
      {body}
    </AppBottomSheet>
  );
}

// ─── Currency sheet ─────────────────────────────────────────────────────────
// Parent-only (gated at the call site, isParent) — sets both which currency
// symbol is shown and the coins-per-unit ratio those wallet/cash-out
// screens already convert with. Reuses updateHouseholdSettings, the same
// real, working updater those screens' balances read from — this was only
// ever missing a UI, not backing logic.

// Body only — same renderShell extraction pattern as
// NotificationsSheetBody, so kiosk can render this in its own right-side
// KioskFormDrawer instead of a phone bottom sheet [live-requested:
// "should work uagsnadhr family USD - all should work like a mobile" —
// tapping Currency/Family Name on kiosk needs a working, kiosk-native
// sheet, not the phone's AppBottomSheet].
export function CurrencySheetBody({
  householdSettings, updateHouseholdSettings, colors, isDark,
}: {
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
    <>
      <SectionHeader label="Currency" colors={colors} isDark={isDark} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        {CURRENCIES.map(c => {
          const active = householdSettings.currencyCode === c.code;
          return (
            <TouchableOpacity
              key={c.code}
              onPress={() => updateHouseholdSettings({ currencyCode: c.code, currencySymbol: c.symbol })}
              style={{
                paddingHorizontal: 12, paddingVertical: 9, borderRadius: RADIUS.md,
                backgroundColor: active ? colors.primary : (isDark ? colors.card : GEMINI.cardBg),
                borderWidth: 1, borderColor: active ? colors.primary : (isDark ? colors.border : GEMINI.border),
              }}
            >
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: active ? '#fff' : (isDark ? colors.textPrimary : GEMINI.titleColor) }}>
                {c.symbol} {c.code}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <SectionHeader label="Conversion Rate" colors={colors} isDark={isDark} />
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14,
        borderRadius: RADIUS.md, backgroundColor: isDark ? colors.card : GEMINI.cardBg, borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border,
      }}>
        <TextInput
          value={coinsPerUnit}
          onChangeText={applyCoinsPerUnit}
          keyboardType="number-pad"
          style={{
            flex: 1, fontSize: TYPO.heading, fontWeight: '800', color: isDark ? colors.textPrimary : GEMINI.titleColor,
            borderWidth: 1.5, borderColor: isDark ? colors.border : GEMINI.border, borderRadius: RADIUS.sm,
            paddingHorizontal: 12, paddingVertical: 8, backgroundColor: isDark ? colors.surface : GEMINI.surface,
          }}
        />
        <Text style={{ fontSize: TYPO.body, color: isDark ? colors.textSecondary : GEMINI.bodyColor }}>
          coins = 1 {householdSettings.currencySymbol}
        </Text>
      </View>
      <Text style={{ fontSize: TYPO.caption, color: isDark ? colors.textTertiary : GEMINI.bodyColorLight, marginTop: 10 }}>
        Example: 250 coins = {householdSettings.currencySymbol}{(250 * householdSettings.pointsToFiatRatio).toFixed(2)}
      </Text>
    </>
  );
}

// Mobile's own unchanged shell — same AppBottomSheet, same real body, byte-
// identical behavior to before CurrencySheetBody was extracted.
function CurrencySheet({
  visible, onClose, householdSettings, updateHouseholdSettings, colors, isDark, renderShell,
}: {
  visible: boolean; onClose: () => void;
  householdSettings: { currencyCode: string; currencySymbol: string; pointsToFiatRatio: number };
  updateHouseholdSettings: (updates: Partial<{ currencyCode: string; currencySymbol: string; pointsToFiatRatio: number }>) => void;
  colors: any; isDark: boolean;
  renderShell?: (visible: boolean, onClose: () => void, children: React.ReactNode) => React.ReactNode;
}) {
  const body = (
    <CurrencySheetBody householdSettings={householdSettings} updateHouseholdSettings={updateHouseholdSettings} colors={colors} isDark={isDark} />
  );
  if (renderShell) return <>{renderShell(visible, onClose, body)}</>;
  return (
    <AppBottomSheet visible={visible} onClose={onClose} title="Currency"
      subtitle="How coins convert to real money for the whole family" minHeight="55%" maxHeight="85%">
      {body}
    </AppBottomSheet>
  );
}

// ─── Family Name sheet ──────────────────────────────────────────────────────
// Parent-only (gated at the call site, isParent), mirrors CurrencySheet's
// pattern. familyStore.familyName was previously stuck forever at its
// 'Our Family' default — nothing fetched the real families.name row or
// wrote a rename back to it — so this is the family's first working rename
// path, not a UI-only fix on top of already-working backing logic.
// Body only — same renderShell extraction pattern as
// NotificationsSheetBody/CurrencySheetBody [live-requested: "should work
// uagsnadhr family USD - all should work like a mobile"].
export function FamilyNameSheetBody({
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
    <>
      <TextInput
        value={name}
        onChangeText={t => { setName(t); setError(''); }}
        placeholder="e.g. The Smith Family"
        placeholderTextColor={isDark ? colors.textTertiary : GEMINI.bodyColorLight}
        autoFocus
        style={{
          fontSize: TYPO.heading, fontWeight: '700', color: isDark ? colors.textPrimary : GEMINI.titleColor,
          borderWidth: 1.5, borderColor: error ? colors.danger : (isDark ? colors.border : GEMINI.border), borderRadius: RADIUS.md,
          paddingHorizontal: 14, paddingVertical: 12, backgroundColor: isDark ? colors.surface : GEMINI.surface, marginTop: 8,
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
    </>
  );
}

// Mobile's own unchanged shell — same AppBottomSheet, same real body, byte-
// identical behavior to before FamilyNameSheetBody was extracted.
function FamilyNameSheet({
  visible, onClose, currentName, renameFamily, colors, isDark, renderShell,
}: {
  visible: boolean; onClose: () => void; currentName: string;
  renameFamily: (name: string) => Promise<boolean>;
  colors: any; isDark: boolean;
  renderShell?: (visible: boolean, onClose: () => void, children: React.ReactNode) => React.ReactNode;
}) {
  const body = (
    <FamilyNameSheetBody visible={visible} onClose={onClose} currentName={currentName} renameFamily={renameFamily} colors={colors} isDark={isDark} />
  );
  if (renderShell) return <>{renderShell(visible, onClose, body)}</>;
  return (
    <AppBottomSheet visible={visible} onClose={onClose} title="Family Name"
      subtitle="Shown on the Hub, the widget, and shared with anyone you invite" minHeight="40%" maxHeight="60%">
      {body}
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
  visible, onClose, familyId, callerMemberId, members, colors, isDark, renderShell,
}: {
  visible: boolean; onClose: () => void; familyId: string; callerMemberId: string;
  members: FamilyMember[]; colors: any; isDark: boolean;
  // Same renderShell extraction pattern as CurrencySheet/FamilyNameSheet
  // above — lets a kiosk caller swap the phone AppBottomSheet for a
  // KioskFormDrawer side panel [live-requested: "invite family also
  // should be side form" — the same phone-shell-on-kiosk gap the School
  // Schedule form had before its own fix this session].
  renderShell?: (visible: boolean, onClose: () => void, children: React.ReactNode) => React.ReactNode;
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

  const body = (
    <>

      <SectionHeader label="Add Someone New" colors={colors} isDark={isDark} />
      <Text style={{ fontSize: TYPO.caption, color: isDark ? colors.textSecondary : GEMINI.bodyColor, marginBottom: 8 }}>Name</Text>
      <TextInput
        value={name} onChangeText={setName} onBlur={() => setTouched(t => ({ ...t, name: true }))}
        placeholder="e.g. Emma" maxLength={60}
        placeholderTextColor={isDark ? colors.textTertiary : GEMINI.bodyColorLight}
        style={{
          borderWidth: 1.5, borderColor: (touched.name && nameError) ? colors.danger : (isDark ? colors.border : GEMINI.border), borderRadius: RADIUS.sm,
          paddingHorizontal: 12, paddingVertical: 10, fontSize: TYPO.body,
          color: isDark ? colors.textPrimary : GEMINI.titleColor, backgroundColor: isDark ? colors.surface : GEMINI.surface,
        }}
      />
      {touched.name && nameError ? (
        <Text style={{ fontSize: TYPO.caption, color: colors.danger, marginTop: 4 }}>{nameError}</Text>
      ) : null}
      <View style={{ marginBottom: 14 }} />

      <Text style={{ fontSize: TYPO.caption, color: isDark ? colors.textSecondary : GEMINI.bodyColor, marginBottom: 8 }}>Role</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {INVITE_ROLES.map(r => {
          const active = role === r.value;
          return (
            <TouchableOpacity key={r.value}
              onPress={() => { setRole(r.value); setRelationship(undefined); }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 12, paddingVertical: 9, borderRadius: RADIUS.md,
                backgroundColor: active ? colors.primary : (isDark ? colors.card : GEMINI.cardBg),
                borderWidth: 1, borderColor: active ? colors.primary : (isDark ? colors.border : GEMINI.border),
              }}>
              <Text style={{ fontSize: 14 }}>{r.emoji}</Text>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: active ? '#fff' : (isDark ? colors.textPrimary : GEMINI.titleColor) }}>{r.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {relationshipOptions.length > 0 && (
        <>
          <Text style={{ fontSize: TYPO.caption, color: isDark ? colors.textSecondary : GEMINI.bodyColor, marginBottom: 8 }}>
            Relationship <Text style={{ fontWeight: '400' }}>(optional)</Text>
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {relationshipOptions.map(opt => {
              const picked = relationship === opt;
              return (
                <TouchableOpacity key={opt} onPress={() => setRelationship(picked ? undefined : opt)}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.md,
                    backgroundColor: picked ? colors.teal : (isDark ? colors.card : GEMINI.cardBg),
                    borderWidth: 1, borderColor: picked ? colors.teal : (isDark ? colors.border : GEMINI.border),
                  }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: picked ? '#fff' : (isDark ? colors.textPrimary : GEMINI.titleColor) }}>{opt}</Text>
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
      <Text style={{ fontSize: TYPO.caption, color: isDark ? colors.textSecondary : GEMINI.bodyColor, marginBottom: 8 }}>
        Date of birth <Text style={{ fontWeight: '400' }}>(optional)</Text>
      </Text>
      <TouchableOpacity
        onPress={() => setShowDobPicker(v => !v)}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          borderWidth: 1.5, borderColor: (dobError) ? colors.danger : (showDobPicker ? colors.primary : (isDark ? colors.border : GEMINI.border)),
          borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 10,
          backgroundColor: isDark ? colors.surface : GEMINI.surface,
        }}>
        <Ionicons name="calendar-outline" size={15} color={isDark ? colors.textSecondary : GEMINI.bodyColor} />
        <Text style={{ fontSize: TYPO.body, color: dob ? (isDark ? colors.textPrimary : GEMINI.titleColor) : (isDark ? colors.textTertiary : GEMINI.bodyColorLight) }}>
          {dob ? fmtDate(localDateStr(dob)) : 'Tap to choose a date'}
        </Text>
      </TouchableOpacity>
      {dobError ? (
        <Text style={{ fontSize: TYPO.caption, color: colors.danger, marginTop: 4 }}>{dobError}</Text>
      ) : null}
      {showDobPicker && (
        <View style={{ borderRadius: RADIUS.md, borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border, backgroundColor: isDark ? colors.card : GEMINI.cardBg, marginTop: 8 }}>
          <DateTimePicker
            value={dob ?? MAX_DOB}
            mode="date"
            display="spinner"
            minimumDate={MIN_DOB}
            maximumDate={MAX_DOB}
            onChange={(_e, d) => { if (d) setDob(d); }}
            textColor={isDark ? colors.textPrimary : GEMINI.titleColor}
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
      <Text style={{ fontSize: TYPO.caption, color: isDark ? colors.textSecondary : GEMINI.bodyColor, marginBottom: 8 }}>
        Email <Text style={{ fontWeight: '400' }}>(optional)</Text>
      </Text>
      <TextInput
        value={email} onChangeText={setEmail} onBlur={() => setTouched(t => ({ ...t, email: true }))}
        placeholder="e.g. emma@example.com" placeholderTextColor={isDark ? colors.textTertiary : GEMINI.bodyColorLight}
        autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
        style={{
          borderWidth: 1.5, borderColor: (touched.email && emailError) ? colors.danger : (isDark ? colors.border : GEMINI.border), borderRadius: RADIUS.sm,
          paddingHorizontal: 12, paddingVertical: 10, fontSize: TYPO.body,
          color: isDark ? colors.textPrimary : GEMINI.titleColor, backgroundColor: isDark ? colors.surface : GEMINI.surface,
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

      <SectionHeader label={`Pending Invites (${pendingMembers.length})`} colors={colors} isDark={isDark} />
      {loadingInvites ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
      ) : pendingMembers.length === 0 ? (
        <Text style={{ fontSize: TYPO.caption, color: isDark ? colors.textTertiary : GEMINI.bodyColorLight, textAlign: 'center', paddingVertical: 12 }}>
          No pending invites — add someone above.
        </Text>
      ) : (
        pendingMembers.map(m => {
          const inv = invitesByMember[m.id];
          const isLive = inv && inv.status === 'pending';
          return (
            <View key={m.id} style={{
              borderRadius: RADIUS.md, borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border,
              backgroundColor: isDark ? colors.card : GEMINI.cardBg, padding: 12, marginBottom: 10,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 18 }}>{m.emoji ?? '👤'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: isDark ? colors.textPrimary : GEMINI.titleColor }}>{m.name}</Text>
                  <Text style={{ fontSize: TYPO.caption, color: isDark ? colors.textTertiary : GEMINI.bodyColorLight }}>
                    {m.relationship ?? m.role} · Not yet joined
                  </Text>
                </View>
              </View>

              {isLive ? (
                <View style={{ marginTop: 10, gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    borderRadius: RADIUS.sm, borderWidth: 1, borderColor: colors.primary + '40',
                    backgroundColor: colors.primaryLight, paddingHorizontal: 12, paddingVertical: 10 }}>
                    <Text style={{ fontSize: 18, fontWeight: '900', letterSpacing: 3, color: isDark ? colors.textPrimary : GEMINI.titleColor }}>{inv.code}</Text>
                    <Text style={{ fontSize: TYPO.micro, color: isDark ? colors.textTertiary : GEMINI.bodyColorLight }}>{fmtExpiry(inv.expires_at)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity onPress={() => copyCode(m.id, inv.code)}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                        paddingVertical: 9, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border }}>
                      <Ionicons name={copiedId === m.id ? 'checkmark' : 'copy-outline'} size={14} color={isDark ? colors.textPrimary : GEMINI.titleColor} />
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: isDark ? colors.textPrimary : GEMINI.titleColor }}>
                        {copiedId === m.id ? 'Copied' : 'Copy'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => shareCode(m.name, inv.code)}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                        paddingVertical: 9, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border }}>
                      <Ionicons name="share-outline" size={14} color={isDark ? colors.textPrimary : GEMINI.titleColor} />
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: isDark ? colors.textPrimary : GEMINI.titleColor }}>Share</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => generateCodeFor(m.id)} disabled={regenerating === m.id}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                        paddingVertical: 9, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border }}>
                      {regenerating === m.id
                        ? <ActivityIndicator size="small" color={isDark ? colors.textPrimary : GEMINI.titleColor} />
                        : <><Ionicons name="refresh-outline" size={14} color={isDark ? colors.textPrimary : GEMINI.titleColor} />
                            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: isDark ? colors.textPrimary : GEMINI.titleColor }}>New Code</Text></>}
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
          <SectionHeader label={`Already Joined (${claimedInvitees.length})`} colors={colors} isDark={isDark} />
          {claimedInvitees.map(m => (
            <View key={m.id} style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              paddingVertical: 8, paddingHorizontal: 12, borderRadius: RADIUS.sm,
              backgroundColor: isDark ? colors.surface : GEMINI.surface, marginBottom: 6,
              borderWidth: 1, borderColor: colors.success + '30',
            }}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '700', color: isDark ? colors.textPrimary : GEMINI.titleColor }}>{m.name}</Text>
              <Text style={{ fontSize: TYPO.micro, color: isDark ? colors.textTertiary : GEMINI.bodyColorLight }}>{m.relationship ?? m.role}</Text>
            </View>
          ))}
        </View>
      )}
    </>
  );
  if (renderShell) return <>{renderShell(visible, onClose, body)}</>;
  return (
    <AppBottomSheet visible={visible} onClose={onClose} title="Invite Family Member"
      subtitle="Add their details, then share the code they'll use to join" minHeight="65%" maxHeight="92%">
      {body}
    </AppBottomSheet>
  );
}

// ─── Delete flows ───────────────────────────────────────────────────────────

// Type-to-confirm — matches the "scary enough" bar the spec asks for, one
// notch past Roster's own two-step Alert (which is fine for removing
// someone else; this is a person removing themselves or a parent
// permanently affecting their own family, so it gets the stricter gate).
function TypeToConfirmRow({
  expected, value, onChange, colors, isDark,
}: { expected: string; value: string; onChange: (v: string) => void; colors: any; isDark: boolean }) {
  return (
    <View style={{ marginTop: 4, marginBottom: 14 }}>
      <Text style={{ fontSize: TYPO.caption, color: isDark ? colors.textSecondary : GEMINI.bodyColor, marginBottom: 8 }}>
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
          borderWidth: 1.5, borderColor: isDark ? colors.border : GEMINI.border, borderRadius: RADIUS.sm,
          paddingHorizontal: 12, paddingVertical: 10, fontSize: TYPO.body,
          color: isDark ? colors.textPrimary : GEMINI.titleColor, backgroundColor: isDark ? colors.surface : GEMINI.surface,
        }}
      />
    </View>
  );
}

export default function ProfileSettingsScreen({ hideBackButton = false, hideSensitiveAdminRows = false, hideHero = false, columns = 1, notificationsShell, currencyShell, familyNameShell, termsShell, memberSheetShell, dataRecoveryShell, inviteShell }: {
  hideBackButton?: boolean; hideSensitiveAdminRows?: boolean;
  // Kiosk-only: the identity card (avatar/name/role, tappable to edit) is
  // redundant there — the same identity already sits in kiosk's own
  // persistent sidebar (ParentStatsColumn/KioskKidTeenStatsColumn), always
  // visible on every tab, not just this one [live-requested: "remove the
  // heroin the profile as we aalready have it in the static side bar we
  // can add that fuctionality long press"]. Mobile never passes this, so
  // its own identity card (the only way to reach EditMyProfileScreen there)
  // is completely unchanged. EditMyProfileScreen itself still mounts below
  // regardless — kiosk's sidebar now opens it directly via long-press.
  hideHero?: boolean;
  // Kiosk-only: re-flows the same sections (unchanged content/order/logic)
  // into a 3-column wrapping grid instead of one long single-column
  // scroll, matching the 3-col layout Chores/Schedule/Health already use
  // [live-requested: "profile page redesing .. 3 col. like similar to
  // toehr.."]. Mobile never passes this (stays 1, i.e. today's exact
  // single-column layout).
  columns?: 1 | 2 | 3;
  // Kiosk-only: swaps the Notifications row's bottom sheet for kiosk's own
  // right-side KioskFormDrawer around the exact same real
  // categories/call-alerts/quiet-hours state [live-requested: "show the
  // notification sheet right side bar"]. Kept as a plain render-prop
  // (rather than importing a kiosk component here) so this mobile-owned
  // file never depends on kiosk code — see NotificationsSheet's own
  // comment. Mobile never passes this, so its own AppBottomSheet is
  // completely unchanged.
  notificationsShell?: (visible: boolean, onClose: () => void, children: React.ReactNode) => React.ReactNode;
  // Kiosk-only: same renderShell swap as notificationsShell, for the
  // Currency and Family Name rows [live-requested: "should work uagsnadhr
  // family USD - all should work like a mobile" — both were still opening
  // the phone's own AppBottomSheet on kiosk]. Mobile never passes these.
  currencyShell?: (visible: boolean, onClose: () => void, children: React.ReactNode) => React.ReactNode;
  familyNameShell?: (visible: boolean, onClose: () => void, children: React.ReactNode) => React.ReactNode;
  // Kiosk-only: Terms & Privacy opens this shell instead of router.push'ing
  // its own full-screen route [live-requested: "tems and prviacy should
  // show side bar"]. Mobile never passes this, so its real route is
  // completely unchanged.
  termsShell?: (visible: boolean, onClose: () => void, children: React.ReactNode) => React.ReactNode;
  // Kiosk-only: swaps the Family carousel's tap/long-press/pin
  // MemberProfileSheet for kiosk's own right-side drawer [live-requested:
  // "the family memeber edit shoud also open the side bar"]. Mobile never
  // passes this, so its AppBottomSheet is completely unchanged. Signature
  // carries title/subtitle too since MemberProfileSheet's title changes
  // per-section (view/edit/pin/confirmRemove) — see its own renderShell
  // comment.
  memberSheetShell?: (visible: boolean, onClose: () => void, title: string, subtitle: string | undefined, children: React.ReactNode) => React.ReactNode;
  // Kiosk-only: Data Recovery opens this shell instead of router.push'ing
  // its own full-screen route, same reasoning as termsShell above (that
  // route's back button unconditionally does router.back(), which would
  // blow past kiosk's embedded-tab shell entirely). This row was hidden
  // outright on kiosk for a while (hideSensitiveAdminRows — the 30-min
  // idle-lock exposure-window concern, still real) before being asked
  // back as a proper side-sheet form instead of just staying gone
  // [live-requested: "i need all these to be side bar forms" / "it is for
  // kiosk only"] — passing this shell makes the row visible again
  // regardless of hideSensitiveAdminRows (see the row's own render check
  // below), since the point of a shell here specifically is to keep this
  // one row reachable in the safer, contained side-sheet form; the OTHER
  // hidden row (Admin Console) is untouched and stays hidden — no shell
  // exists for it, and none was requested. Mobile never passes this, so
  // its real pushed route is completely unchanged.
  dataRecoveryShell?: (visible: boolean, onClose: () => void, children: React.ReactNode) => React.ReactNode;
  // Kiosk-only: same renderShell swap as currencyShell/familyNameShell, for
  // the Invite Family Member sheet [live-requested: "invite family also
  // should be side firm"] — mirrors the earlier School Schedule modal fix
  // this session (KioskSchoolScheduleModal converting to KioskFormDrawer).
  // Mobile never passes this, so its own AppBottomSheet is unchanged.
  inviteShell?: (visible: boolean, onClose: () => void, children: React.ReactNode) => React.ReactNode;
} = {}) {
  const { colors, isDark } = useTheme();
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
  // Kiosk-only — see termsShell's own comment.
  const [showTerms, setShowTerms] = useState(false);
  // Kiosk-only — see dataRecoveryShell's own comment.
  const [showDataRecovery, setShowDataRecovery] = useState(false);

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

  const [showEditMyProfile, setShowEditMyProfile] = useState(false);

  // "Just Us" — private parents-only chat channel. Hard-locked to exactly
  // the 2 parent-role members present (no "pick which 2" UI in v1), so the
  // toggle itself is only offered when there are precisely 2. App-admin
  // kill switch (lib/featureFlags.ts's couple_channel) hides this row
  // entirely regardless of the family's own per-member state.
  const coupleChannelFlagOn = useFeatureFlag('couple_channel');
  const coParentsForCouple = members.filter(m => m.role === 'parent' && m.id !== activeMember?.id);
  const coupleChanId = (isParent && coParentsForCouple.length === 1 && activeMember)
    ? coupleChannelId(activeMember.id, coParentsForCouple[0].id)
    : null;
  const { isEnabled: isCoupleEnabled, refreshEnabled: refreshCoupleEnabled } = useCoupleChannelStore();
  const [couplePinModal, setCouplePinModal] = useState<'set' | 'disable' | null>(null);
  useEffect(() => {
    if (coupleChanId) refreshCoupleEnabled(coupleChanId);
  }, [coupleChanId]);

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

  // Family Photo frame toggle — defaults true (no row yet = never touched
  // the setting = matches the column's own DEFAULT true / the pre-existing
  // "frame always visible" behavior), same load pattern as
  // FamilyPhotoFrameCard.tsx's own loadLatest.
  const [familyPhotoFrameEnabled, setFamilyPhotoFrameEnabled_] = useState(true);
  useEffect(() => {
    if (!familyId || !activeMemberId) return;
    supabase.from('family_photo_frame').select('frame_enabled')
      .eq('family_id', familyId).eq('member_id', activeMemberId).maybeSingle()
      .then(({ data }) => setFamilyPhotoFrameEnabled_(data ? data.frame_enabled : true));
  }, [familyId, activeMemberId]);

  if (!activeMember) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? colors.background : GEMINI.canvas, alignItems: 'center', justifyContent: 'center' }}>
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
    <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? colors.background : GEMINI.canvas }} edges={['top']}>
      {/* Header — back button hidden on kiosk (KioskProfileTab passes
          hideBackButton): kiosk embeds this screen directly inside its own
          tabbed rail content, not pushed as a real route, so there's no
          navigation stack entry for router.back() to pop — live-reported
          as a "GO_BACK not handled" warning/dead button there. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 }}>
        {!hideBackButton && (
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-back" size={24} color={isDark ? colors.textPrimary : GEMINI.titleColor} />
          </TouchableOpacity>
        )}
        <Text style={{ fontSize: TYPO.subheading, fontWeight: '900', color: isDark ? colors.textPrimary : GEMINI.titleColor }}>
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
      {/* paddingTop bumped from the shared 16 — on kiosk (columns=3) the
          "Profile & Settings" title sits directly above this ScrollView
          with no gap, and the first grid row's own SectionHeader text sat
          close enough to visually collide with it at the top of the
          scroll [live-reported: screenshot showed "NOTIFICATIONS"/
          "APPEARANCE" labels overlapping the page title]. Mobile
          (columns=1) keeps the original 16 — its own hero card already
          sits between the title and first section there. */}
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: columns > 1 ? 28 : 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Identity card — tappable, opens EditMyProfileScreen (self-service:
            name/DOB/email/avatar for the CURRENTLY ACTIVE member only,
            available to everyone regardless of role). Distinct from the
            unified MemberProfileSheet's edit section below, which is the
            parent-edits-someone-ELSE flow. Hidden on kiosk (hideHero) —
            the same identity already sits in kiosk's own persistent
            sidebar; a long-press there opens this same EditMyProfileScreen
            instead [live-requested: "remove the heroin the profile as we
            aalready have it in the static side bar we can add that
            fuctionality long press"]. Centered circular photo + pastel
            status pill + name + subtitle layout per provided mockup
            [live-requested: "make the hero card like this and on tap it
            should open edit profile"]. */}
        {!hideHero && (
          <TouchableOpacity onPress={() => setShowEditMyProfile(true)} activeOpacity={0.75} style={{
            alignItems: 'center', padding: 24,
            borderRadius: RADIUS.lg, backgroundColor: isDark ? colors.card : GEMINI.cardBg, borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border,
            marginBottom: 24,
            ...(isDark ? null : GEMINI.cardShadow),
          }}>
            <View style={{
              width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center',
              backgroundColor: role === 'parent' ? colors.parentLight : colors.kidLight, overflow: 'hidden',
              marginBottom: 14,
            }}>
              {activeMember.avatarUrl ? (
                <Image source={{ uri: activeMember.avatarUrl }} style={{ width: 88, height: 88 }} />
              ) : (
                <Text style={{ fontSize: 42 }}>{activeMember.emoji ?? '👤'}</Text>
              )}
            </View>
            <View style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
              backgroundColor: (isDark ? colors.pink : GEMINI.blue) + '14', marginBottom: 14 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? colors.pink : GEMINI.blue }}>
                You · {role.charAt(0).toUpperCase() + role.slice(1)}
              </Text>
            </View>
            <Text style={{ fontSize: TYPO.heading, fontWeight: '800', color: isDark ? colors.textPrimary : GEMINI.titleColor, textAlign: 'center' }}>
              {activeMember.name}
            </Text>
            <Text style={{ fontSize: TYPO.caption, color: isDark ? colors.textTertiary : GEMINI.bodyColorLight, marginTop: 6, textAlign: 'center' }}>
              {isAuthLinked ? 'Signed in · tap to edit your profile' : 'PIN profile · tap to edit your profile'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Kiosk-only: from here down, every section is an independent
            sibling View (many behind their own isParent/isAuthLinked/etc.
            conditionals) — flex-wrap on this shared container reflows them
            into a 3-column grid without touching any of that per-section
            conditional logic. Mobile (columns=1) renders a plain View, so
            its single-column layout is byte-identical to before. Family
            (above) is deliberately outside this grid, in its own full-
            width row — see its own comment for why. */}
        {/* Real two-column layout, not a flex-wrap grid — flex-wrap fills
            left-to-right and only breaks to a new row once one is full, so
            a short section (e.g. Appearance, 3 small pills) followed by a
            tall one (e.g. Family/Currency) sat side by side and the row
            below started wherever the taller one ended, leaving a visible
            staggered gap under the shorter column [live-reported: "there
            is lot of gap between" the sections, screenshot showing exactly
            this staircase]. Two literal column Views (left/right) instead
            — each just a plain top-to-bottom stack, so neither column's
            height depends on the other's content at all. columns===1
            (mobile) is untouched: single flat column, byte-identical to
            before. Conditional sections may land in a different column
            depending on which role is viewing (fewer sections rendered),
            which is expected, not a bug — confirmed acceptable. */}
        <View style={columns > 1 ? { flexDirection: 'row', gap: 16, alignItems: 'flex-start' } : undefined}>
        <View style={columns > 1 ? { flex: 1, minWidth: 0 } : undefined}>

        {/* Notifications — was 6+ toggle rows sitting flat on this page;
            collapsed into one summary row that opens NotificationsSheet
            (categories, quiet hours, call alerts all together), same
            "tap a row → bottom sheet" pattern the app uses elsewhere. */}
        <View style={[{ marginBottom: 24 }, columns > 1 && {
          backgroundColor: isDark ? colors.card : GEMINI.cardBg, borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border,
          borderRadius: RADIUS.lg, padding: 14,
        }]}>
          <SectionHeader label="Notifications" colors={colors} isDark={isDark} />
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
          renderShell={notificationsShell}
        />

        {/* Security */}
        <View style={[{ marginBottom: 24 }, columns > 1 && {
          backgroundColor: isDark ? colors.card : GEMINI.cardBg, borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border,
          borderRadius: RADIUS.lg, padding: 14,
        }]}>
          <SectionHeader label="Security" colors={colors} isDark={isDark} />
          {bioAvailable && (
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
                  trackColor={{ false: isDark ? colors.border : GEMINI.border, true: colors.primary }}
                  thumbColor="#fff"
                />
              }
            />
          )}
          {/* dataRecoveryShell overrides hideSensitiveAdminRows on purpose —
              see that prop's own comment: passing a shell is specifically
              how kiosk asked to have this ONE row back, in the safer
              contained side-sheet form, without also reopening Admin
              Console (which has no shell and stays hidden). */}
          {(!hideSensitiveAdminRows || dataRecoveryShell) && (
            <Row
              icon="key-outline"
              label="Data Recovery"
              subtitle="Family passcode that protects chat, location, and medical records from loss"
              onPress={() => dataRecoveryShell ? setShowDataRecovery(true) : router.push('/profile-settings/data-recovery')}
              colors={colors} isDark={isDark}
            />
          )}
        </View>

        {dataRecoveryShell && showDataRecovery && (
          <>{dataRecoveryShell(showDataRecovery, () => setShowDataRecovery(false), <DataRecoveryScreen hideChrome />)}</>
        )}

        </View>
        <View style={columns > 1 ? { flex: 1, minWidth: 0 } : undefined}>

        {/* Currency — the coins-to-real-money conversion every kid's wallet/
            cash-out screen already displays (StoreScreen, ChildChoreBoard,
            ParentReviewDeck) was hardcoded to a bare $ with no setting to
            change it at all. Parent-editable; everyone else sees the same
            row as read-only display, per explicit request. */}
        <View style={[{ marginBottom: 24 }, columns > 1 && {
          backgroundColor: isDark ? colors.card : GEMINI.cardBg, borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border,
          borderRadius: RADIUS.lg, padding: 14,
        }]}>
          <SectionHeader label="Currency" colors={colors} isDark={isDark} />
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
            renderShell={currencyShell}
          />
        )}

        {/* "Just Us" — private chat + plans coordination between exactly
            the family's 2 parent-role members, PIN-gated. Only offered
            when there are precisely 2 parents (no "pick which 2" UI) and
            the app-admin couple_channel flag is on. Enabling immediately
            prompts a PIN-setup step; disabling deliberately never accepts
            the channel PIN itself — only the disabling parent's own birth
            year — so a child who learned the shared PIN can't also
            disable the feature to hide it. */}
        {coupleChannelFlagOn && coupleChanId && (
          <View style={[{ marginBottom: 24 }, columns > 1 && {
          backgroundColor: isDark ? colors.card : GEMINI.cardBg, borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border,
          borderRadius: RADIUS.lg, padding: 14,
        }]}>
            <SectionHeader label="Just Us" colors={colors} isDark={isDark} />
            <Row
              icon="heart-outline"
              label="Just Us"
              subtitle="A private chat with your co-parent, separate from the family chat"
              colors={colors} isDark={isDark}
              right={
                <Switch
                  value={isCoupleEnabled(coupleChanId)}
                  onValueChange={(next) => setCouplePinModal(next ? 'set' : 'disable')}
                  trackColor={{ false: isDark ? colors.border : GEMINI.border, true: colors.primary }}
                  thumbColor="#fff"
                />
              }
            />
          </View>
        )}

        {coupleChanId && couplePinModal && (
          <CouplePinModal
            visible
            mode={couplePinModal}
            channelId={coupleChanId}
            otherMemberId={coParentsForCouple[0]?.id}
            onCancel={() => setCouplePinModal(null)}
            onSuccess={() => {
              setCouplePinModal(null);
              refreshCoupleEnabled(coupleChanId);
            }}
          />
        )}


        {/* Legal — kiosk opens this as its own side drawer instead of
            router.push'ing a full-screen route [live-requested: "tems and
            prviacy should show side bar"]: that route's own back button
            unconditionally does router.back(), which would replace
            kiosk's persistent sidebar/header entirely rather than staying
            inside this embedded tab, the same reason KioskProfileTab
            passes hideBackButton for THIS screen. Mobile (no termsShell)
            keeps the real route, completely unchanged. */}
        <View style={[{ marginBottom: 24 }, columns > 1 && {
          backgroundColor: isDark ? colors.card : GEMINI.cardBg, borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border,
          borderRadius: RADIUS.lg, padding: 14,
        }]}>
          <SectionHeader label="Legal" colors={colors} isDark={isDark} />
          <Row
            icon="document-text-outline"
            label="Terms & Privacy"
            subtitle="Terms of service, privacy policy, AI disclosure"
            onPress={() => termsShell ? setShowTerms(true) : router.push('/profile-settings/terms')}
            colors={colors} isDark={isDark}
          />
        </View>

        {termsShell && showTerms && (
          <>{termsShell(showTerms, () => setShowTerms(false), <TermsContentBody colors={colors} isDark={isDark} />)}</>
        )}


        {/* PIN-switched into a sub-profile (GP/kid/teen/etc, no authUserId
            of their own) — never show a real Sign Out here, since tapping
            it would end the REAL account's session while looking at
            someone else's profile. Only a Lock/"Switch back" is safe:
            purely a local activeMemberId swap gated by the real owner's
            own PIN, no Supabase call at all. */}
        {!viewingOwnProfile && authOwnerMember && (
          <View style={[{ marginBottom: 24 }, columns > 1 && {
          backgroundColor: isDark ? colors.card : GEMINI.cardBg, borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border,
          borderRadius: RADIUS.lg, padding: 14,
        }]}>
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

        </View>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Rendered as a SIBLING of the ScrollView, not nested inside it —
          FullPageOverlay positions itself absolute/bottom:0 relative to
          its nearest positioned ancestor, and a ScrollView's content view
          doesn't give that a reliable full-screen bottom edge to anchor
          to. Nested inside the scroll, the overlay's "full page" ended up
          sized/positioned relative to the SCROLL CONTENT instead of the
          real device viewport — the parent's own fixed header stayed
          visible above it and a huge blank gap opened up below the card
          [live-reported via screenshot: "it is not just 70 - it is may be
          500??" / confirmed "it is edit my profile page"]. Every other
          FullPageOverlay in this app (FamilyScreen.tsx, etc.) is already a
          ScrollView sibling — this just matches that. */}
      <EditMyProfileScreen visible={showEditMyProfile} onClose={() => setShowEditMyProfile(false)}
        member={activeMember} colors={colors} isDark={isDark} />
    </SafeAreaView>
  );
}
