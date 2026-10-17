/**
 * PersonaSwitcherDropdown — "Select Family Profile" panel, visually
 * restyled to read as a dropdown anchored under AppHeader (tight radius/
 * shadow, light scrim instead of a heavy dim, Gemini rhythm tokens)
 * [live-requested: "make the switcher like a figma rhythm... like a
 * proper dropdown instead of the sheet pop up"].
 *
 * Still rendered inside a Modal, NOT a true in-tree absolute-positioned
 * sibling — an in-tree version was tried and reproduced the exact bug
 * this was a Modal for in the first place: unrelated sibling content
 * elsewhere (Hub's own ScrollView content, confirmed live with a
 * screenshot showing it bleeding through and overlapping the open
 * dropdown) doesn't reliably respect zIndex against a DISTANT sibling in
 * the tree; only a Modal's own top-level native layer guarantees correct
 * stacking. Kept Modal per explicit follow-up after seeing that
 * regression ("put Modal back, but style it to look like a dropdown").
 *
 * Gemini rhythm — warm cream card instead of colors.card, GEMINI
 * titleColor/bodyColor instead of colors.textPrimary/textSecondary, no
 * raw BRAND.* hex for role accents (now mapped through the real theme
 * tokens: colors.teal/amber/pink/accent).
 */
import React, { useState, useRef, useCallback } from 'react';
import { router } from 'expo-router';
import { View, Text, TouchableOpacity, ScrollView, Animated as RNAnimated, Modal, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/lib/ThemeContext';
import { withAndroidShadowFix } from '@/lib/androidShadowFix';
import { useFamilyStore, FamilyMember } from '@/store/familyStore';
import { showAlert } from './AppAlert';
import FamilyAvatar from './FamilyAvatar';
import { supabase } from '@/lib/supabase';
import { getDeviceId } from '@/lib/chatCrypto';
import { GEMINI } from '@/constants/geminiRhythm';

function accent(role: string, colors: any): string {
  return role === 'parent' ? colors.teal
    : role === 'kid'    ? colors.amber
    : role === 'teen'   ? colors.pink
    : colors.accent; // senior
}

const ROLE_LABEL: Record<string, string> = {
  parent: 'Parent',
  kid:    'Kid',
  teen:   'Teen',
  senior: 'Grandparent',
};

// ── Icons ─────────────────────────────────────────────────────────────────────
function CheckIcon({ c, size = 13 }: { c: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 13l4 4L19 7" stroke={c} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}
function LockIcon({ c, size = 12 }: { c: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M8 11V7a4 4 0 018 0v4M5 11h14a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2v-7a2 2 0 012-2z"
        stroke={c} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}
function BackspaceIcon({ c }: { c: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z" stroke={c} strokeWidth={2} fill="none" strokeLinejoin="round" />
      <Path d="M18 9l-6 6M12 9l6 6" stroke={c} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
function ArrowLeftIcon({ c }: { c: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Path d="M19 12H5M12 5l-7 7 7 7" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ── PIN pad (compact, reused for locked profile switch) ────────────────────────
const PIN_LENGTH = 4;

function PinPad({ member, isDark, onSuccess, onCancel, siblings }: {
  member: FamilyMember; isDark: boolean; onSuccess: () => void; onCancel: () => void;
  siblings: string[];
}) {
  const { colors } = useTheme();
  const [digits, setDigits] = useState('');
  const [error, setError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [verifying, setVerifying] = useState(false);
  const shake = useRef(new RNAnimated.Value(0)).current;
  const ac = accent(member.role, colors);

  const triggerShake = () => {
    RNAnimated.sequence([
      RNAnimated.timing(shake, { toValue: 8, duration: 60, useNativeDriver: true }),
      RNAnimated.timing(shake, { toValue: -8, duration: 60, useNativeDriver: true }),
      RNAnimated.timing(shake, { toValue: 6, duration: 50, useNativeDriver: true }),
      RNAnimated.timing(shake, { toValue: -6, duration: 50, useNativeDriver: true }),
      RNAnimated.timing(shake, { toValue: 0, duration: 40, useNativeDriver: true }),
    ]).start();
  };

  const shakeAndClear = (msg: string) => {
    triggerShake();
    setError(true);
    setErrorMsg(msg);
    setDigits('');
  };

  // Was: a purely client-side `next === member.pin` comparison against the
  // plaintext PIN already sitting in local FamilyMember state — no server
  // round-trip, no rate-limiting, and no active_grant_token minted for a
  // member with their own separate Supabase login. This is the ACTUAL
  // "Switch Profile" flow wired up from AppHeader (a third, near-identical
  // duplicate of the same PinPad found in PersonaSwitcherSheet.tsx, which
  // had the same bug and was fixed first) — every grant-gated RPC
  // (confirm_event_assignment_series_forward, etc.) requires that grant via
  // resolve_active_member_id(), so switching through THIS dropdown left
  // every such action failing with "caller is not member X" regardless of
  // how many correct PIN entries were made. Mirrors PinEntryModal.tsx's
  // already-correct server-verified flow.
  const press = useCallback((d: string) => {
    if (digits.length >= PIN_LENGTH || verifying) return;
    const next = digits + d;
    setDigits(next);
    setError(false);
    if (next.length === PIN_LENGTH) {
      setVerifying(true);
      const rpcName = member.authUserId ? 'verify_member_pin_and_grant' : 'verify_member_pin';
      // device_id scopes the resulting grant token to THIS device (migration
      // 20260979000000) — without it, PIN-switching into this same member on
      // a second device would silently invalidate this device's own grant.
      (member.authUserId ? getDeviceId() : Promise.resolve(undefined))
        .then(deviceId => supabase.rpc(rpcName, { p_member_id: member.id, p_entered_pin: next, ...(deviceId ? { p_device_id: deviceId } : {}) }))
        .then(({ data, error: rpcError }) => {
          setVerifying(false);
          if (rpcError) {
            console.warn(`[PersonaSwitcherDropdown] ${rpcName} failed`, rpcError.message);
            shakeAndClear('Could not verify — check your connection and try again');
            return;
          }
          const result = Array.isArray(data) ? data[0] : data;
          if (result?.ok) {
            if (result.grant_token && result.grant_expires_at) {
              useFamilyStore.getState().setActiveMemberGrant(member.id, result.grant_token, result.grant_expires_at);
            }
            setDigits('');
            setErrorMsg('');
            onSuccess();
            return;
          }
          if (result?.locked_until) {
            shakeAndClear('Too many attempts — try again in a moment');
            return;
          }
          const remaining = result?.attempts_remaining;
          shakeAndClear(remaining != null ? `Wrong PIN · ${remaining} attempt${remaining === 1 ? '' : 's'} left` : 'Wrong PIN');
        });
    }
  }, [digits, verifying, member.id, member.authUserId]);

  const del = () => { setDigits(d => d.slice(0, -1)); setError(false); };
  const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  return (
    <View style={{ paddingHorizontal: 18, paddingVertical: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <TouchableOpacity onPress={onCancel} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <ArrowLeftIcon c={colors.textSecondary} />
        </TouchableOpacity>
        <FamilyAvatar
          name={member.name}
          emoji={member.emoji}
          avatarUrl={member.avatarUrl}
          siblings={siblings}
          size={32}
          ringColor={ac}
          ringWidth={2}
          bgColor={ac + '22'}
        />
        <View>
          <Text style={{ fontSize: 13, fontWeight: '800', color: isDark ? colors.textPrimary : GEMINI.titleColor }}>{member.name}</Text>
          <Text style={{ fontSize: 10, color: isDark ? colors.textTertiary : GEMINI.bodyColorLight }}>Enter PIN to switch</Text>
        </View>
      </View>

      <RNAnimated.View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 18, transform: [{ translateX: shake }] }}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <View key={i} style={{
            width: 12, height: 12, borderRadius: 6,
            backgroundColor: i < digits.length ? (error ? colors.danger : ac) : colors.surface,
            borderWidth: 1.5, borderColor: i < digits.length ? (error ? colors.danger : ac) : colors.border,
          }} />
        ))}
      </RNAnimated.View>

      {error && (
        <Text style={{ textAlign: 'center', color: colors.danger, fontSize: 11, fontWeight: '600', marginBottom: 10, marginTop: -14 }}>
          {errorMsg || 'Wrong PIN — try again'}
        </Text>
      )}

      <View style={{ gap: 8 }}>
        {[0, 3, 6, 9].map(row => (
          <View key={row} style={{ flexDirection: 'row', gap: 8 }}>
            {KEYS.slice(row, row + 3).map((k, ci) => {
              if (k === '') return <View key={ci} style={{ flex: 1 }} />;
              const isBackspace = k === '⌫';
              return (
                <TouchableOpacity key={ci}
                  style={{ flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                  onPress={() => isBackspace ? del() : press(k)}
                  activeOpacity={0.6}>
                  {isBackspace
                    ? <BackspaceIcon c={colors.textSecondary} />
                    : <Text style={{ fontSize: 17, fontWeight: '700', color: colors.textPrimary }}>{k}</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Member row ───────────────────────────────────────────────────────────────
function MemberRow({ member, isActive, onPress, isDark, siblings }: {
  member: FamilyMember; isActive: boolean; onPress: () => void; isDark: boolean;
  siblings: string[];
}) {
  const { colors } = useTheme();
  const ac = accent(member.role, colors);
  const subLabel = member.subRole ?? ROLE_LABEL[member.role] ?? member.role;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14,
        borderWidth: isActive ? 1.5 : 0,
        borderColor: isActive ? ac + '50' : 'transparent',
        backgroundColor: isActive ? ac + (isDark ? '1E' : '12') : 'transparent',
      }}>
      {/* Real photo/emoji avatar, same FamilyAvatar the header itself now
          uses — was a plain gradient-tile initial regardless of whether
          the member had a real avatar set (direct feedback: "same style
          of the previous avatar" — i.e. match the header's fix here too). */}
      <FamilyAvatar
        name={member.name}
        emoji={member.emoji}
        avatarUrl={member.avatarUrl}
        siblings={siblings}
        size={40}
        ringColor={ac}
        ringWidth={2}
        bgColor={ac + '22'}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: isDark ? colors.textPrimary : GEMINI.titleColor }}>{member.name}</Text>
        <Text style={{ fontSize: 12, color: isDark ? colors.textSecondary : GEMINI.bodyColor, marginTop: 1 }}>{subLabel}</Text>
      </View>
      {isActive ? (
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: ac, alignItems: 'center', justifyContent: 'center' }}>
          <CheckIcon c="#fff" />
        </View>
      ) : member.pinEnabled ? (
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
          <LockIcon c={colors.textTertiary} />
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

// Matches AppHeader's own bar height (paddingVertical 10 ×2 + the persona
// row's real content) — same fixed-offset approach NotificationPanel
// already uses successfully. Previously this dropdown rendered IN-TREE
// (absolute-positioned inside AppHeader's own returned JSX, stacked via
// zIndex against sibling screen content like Chat's channel strip) rather
// than as a true top-level overlay — React Native's zIndex only reliably
// orders siblings within the SAME parent stacking context, so a sibling
// elsewhere in a screen's tree (not a child of AppHeader) could still
// render on top regardless of the dropdown's own zIndex/backdrop color,
// which is exactly what kept happening. A Modal guarantees its own native
// top-level layer, sidestepping that class of bug entirely — same fix
// already proven correct for NotificationPanel.
const HEADER_OFFSET = 10 + 40 + 10 + 6;

// ── Main export ─────────────────────────────────────────────────────────────
export default function PersonaSwitcherDropdown({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, setActiveMember, myFamilies, activeFamilyId, setActiveFamily } = useFamilyStore();
  const [pinTarget, setPinTarget] = useState<FamilyMember | null>(null);
  const [switchingFamily, setSwitchingFamily] = useState(false);
  const { height: windowHeight } = useWindowDimensions();
  // Was a flat maxHeight:380 regardless of screen size — clipped the list
  // (a 6th+ member cut off mid-row) even on tall phones with plenty of
  // room below. Sizes against the actual available space under the panel
  // instead, leaving room for the header row + a comfortable bottom margin.
  const listMaxHeight = Math.max(220, windowHeight - HEADER_OFFSET - 220);

  const handleSelect = (m: FamilyMember) => {
    // See PersonaSwitcherSheet.tsx's identical guard: a pending invite has
    // no auth_user_id and often no PIN yet, so it fell through the PIN
    // branch below with no gate at all — letting anyone on this device
    // switch into a member profile nobody has actually claimed.
    if (m.inviteStatus && m.inviteStatus !== 'active') {
      showAlert('Not joined yet', `${m.name} hasn't accepted their invite yet — ask them to enter their invite code first.`);
      return;
    }
    if (m.pinEnabled && m.id !== activeMemberId) {
      setPinTarget(m);
    } else {
      setActiveMember(m.id);
      onClose();
      // Land on Hub after switching profiles — whatever tab was open for
      // the PREVIOUS member is rarely where the person who just switched
      // in wants to land. Was `router.replace`, which tears down and
      // remounts the entire (tabs) navigator — racing against the
      // just-fired setActiveMember and intermittently landing on a blank
      // Hub (no header) [live-reported: "still same white hub.. this is
      // fucking killing the app"]. `navigate` re-uses the existing (tabs)
      // instance and just focuses the Hub tab instead.
      router.navigate('/(tabs)');
    }
  };

  const handlePinSuccess = () => {
    if (pinTarget) setActiveMember(pinTarget.id);
    setPinTarget(null);
    onClose();
    router.navigate('/(tabs)');
  };

  const handleClose = () => {
    setPinTarget(null);
    onClose();
  };

  // Multi-family membership — only ever rendered when myFamilies has more
  // than one entry (see familyStore's own comment on why this is empty
  // for the overwhelming majority of accounts, and why it's deliberately
  // scoped to a real-login session only, never a PIN-switch). Switching
  // families always re-lands on the Hub, same as switching profiles does
  // — whatever tab/screen was open belongs to the PREVIOUS family's
  // context and rarely makes sense to keep showing.
  const handleSelectFamily = async (familyId: string) => {
    if (familyId === activeFamilyId || switchingFamily) return;
    setSwitchingFamily(true);
    await setActiveFamily(familyId);
    setSwitchingFamily(false);
    onClose();
    router.replace('/(tabs)');
  };

  if (!visible) return null;

  const cardBg = isDark ? colors.card : GEMINI.cardBg;
  const border = isDark ? colors.border : GEMINI.border;
  const titleC = isDark ? colors.textPrimary : GEMINI.titleColor;
  const bodyC  = isDark ? colors.textSecondary : GEMINI.bodyColor;

  return (
    <Modal supportedOrientations={['portrait', 'landscape']} visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      {/* Light scrim, not a heavy dim — reads as a dropdown rather than a
          sheet, while Modal's own top-level layer still guarantees
          correct stacking above every screen's content. */}
      <TouchableOpacity style={{ flex: 1, backgroundColor: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(44,39,34,0.2)' }}
        activeOpacity={1} onPress={handleClose}>
        <SafeAreaView edges={['top']} style={{ flex: 1 }}>
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}
            style={withAndroidShadowFix({
              marginTop: HEADER_OFFSET, marginHorizontal: 12, borderRadius: 20, overflow: 'hidden',
              backgroundColor: cardBg, borderWidth: 1, borderColor: border,
              shadowColor: '#000', shadowOpacity: isDark ? 0.3 : 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 12,
            })}>
            {/* Multi-family membership — only renders at all when
                myFamilies has more than one entry, which itself only
                happens for a member switched-in via their own real
                device auth session (see familyStore's own comment).
                Hidden entirely for the overwhelming majority of
                accounts, exactly as requested — no switcher, no hint
                one could ever exist, when there's nothing to switch. */}
            {!pinTarget && myFamilies.length > 1 && (
              <View style={{
                paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12,
                borderBottomWidth: 1, borderBottomColor: border, gap: 8,
              }}>
                <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, color: bodyC, textTransform: 'uppercase' }}>
                  Family
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {myFamilies.map(f => {
                    const isCurrent = (activeFamilyId ?? members[0]?.familyId) === f.id;
                    return (
                      <TouchableOpacity key={f.id} onPress={() => handleSelectFamily(f.id)} disabled={switchingFamily}
                        style={{
                          paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12,
                          borderWidth: 1.5, borderColor: isCurrent ? colors.primary : border,
                          backgroundColor: isCurrent ? colors.primary + '18' : 'transparent',
                          opacity: switchingFamily ? 0.6 : 1,
                        }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: isCurrent ? colors.primary : bodyC }}>
                          {f.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {!pinTarget && (
              <View style={{
                paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12,
                borderBottomWidth: 1, borderBottomColor: border,
              }}>
                <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, color: bodyC, textTransform: 'uppercase' }}>
                  Select Family Profile
                </Text>
              </View>
            )}

            {pinTarget ? (
              <PinPad member={pinTarget} isDark={isDark} onSuccess={handlePinSuccess} onCancel={() => setPinTarget(null)}
                siblings={members.map(mb => mb.name)} />
            ) : (
              <ScrollView style={{ maxHeight: listMaxHeight }} contentContainerStyle={{ padding: 8, gap: 2 }} showsVerticalScrollIndicator={false}>
                {members.map(m => (
                  <MemberRow key={m.id} member={m} isActive={m.id === activeMemberId} onPress={() => handleSelect(m)} isDark={isDark}
                    siblings={members.map(mb => mb.name)} />
                ))}
              </ScrollView>
            )}
          </TouchableOpacity>
        </SafeAreaView>
      </TouchableOpacity>
    </Modal>
  );
}
