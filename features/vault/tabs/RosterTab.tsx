import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  ScrollView, Alert, Image, Share,
} from 'react-native';
import Svg, { Path, Circle, Rect, Polyline, Line } from 'react-native-svg';
import { Users, Mail } from 'lucide-react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '@/lib/supabase';
import { useFamilyStore } from '@/store/familyStore';
import AppBottomSheet from '@/components/AppBottomSheet';
import { SCard, CardHeader, StatusPill, BRAND } from './shared';
import { FamilyTreeView } from './FamilyTreeView';
import { MemberProfileSheet } from './MemberProfileSheet';
import { saveMemberEdit } from './memberActions';

// Same avatar-emoji set CompleteProfileScreen/JoinFamilyScreen already
// offer at onboarding time — reused here so a parent editing someone
// else's avatar later sees the identical picker, not a different one.
const AVATAR_EMOJIS = ['🧒','👦','👧','🧑','👩','👨','🧓','👴','👵','🦸','🧙','🧜','🦊','🐶','🐱','⭐'];

// ─── SVG Icons ────────────────────────────────────────────────────────────────
const I = {
  Users:    ({ c }: { c: string }) => <Svg width={16} height={16} viewBox="0 0 24 24"><Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke={c} strokeWidth={2} fill="none" strokeLinecap="round"/><Circle cx={9} cy={7} r={4} stroke={c} strokeWidth={2} fill="none"/><Path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke={c} strokeWidth={2} fill="none" strokeLinecap="round"/></Svg>,
  Mail:     ({ c }: { c: string }) => <Svg width={16} height={16} viewBox="0 0 24 24"><Rect x={2} y={4} width={20} height={16} rx={2} stroke={c} strokeWidth={2} fill="none"/><Path d="M2 7l10 7 10-7" stroke={c} strokeWidth={2} fill="none"/></Svg>,
  Key:      ({ c }: { c: string }) => <Svg width={13} height={13} viewBox="0 0 24 24"><Path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" stroke={c} strokeWidth={2} fill="none" strokeLinecap="round"/></Svg>,
  Lock:     ({ c }: { c: string }) => <Svg width={12} height={12} viewBox="0 0 24 24"><Rect x={3} y={11} width={18} height={11} rx={2} stroke={c} strokeWidth={2} fill="none"/><Path d="M7 11V7a5 5 0 0 1 10 0v4" stroke={c} strokeWidth={2} fill="none" strokeLinecap="round"/></Svg>,
  LockOpen: ({ c }: { c: string }) => <Svg width={12} height={12} viewBox="0 0 24 24"><Rect x={3} y={11} width={18} height={11} rx={2} stroke={c} strokeWidth={2} fill="none"/><Path d="M7 11V7a5 5 0 0 1 9.9-1" stroke={c} strokeWidth={2} fill="none" strokeLinecap="round"/></Svg>,
  Copy:     ({ c }: { c: string }) => <Svg width={16} height={16} viewBox="0 0 24 24"><Rect x={9} y={9} width={13} height={13} rx={2} stroke={c} strokeWidth={2} fill="none"/><Path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke={c} strokeWidth={2} fill="none"/></Svg>,
  Check:    ({ c }: { c: string }) => <Svg width={16} height={16} viewBox="0 0 24 24"><Polyline points="20 6 9 17 4 12" stroke={c} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round"/></Svg>,
  Trash:    ({ c }: { c: string }) => <Svg width={16} height={16} viewBox="0 0 24 24"><Polyline points="3 6 5 6 21 6" stroke={c} strokeWidth={2} fill="none" strokeLinecap="round"/><Path d="M19 6l-1 14H6L5 6" stroke={c} strokeWidth={2} fill="none" strokeLinecap="round"/><Path d="M10 11v6M14 11v6" stroke={c} strokeWidth={2} fill="none" strokeLinecap="round"/><Path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke={c} strokeWidth={2} fill="none"/></Svg>,
  X:        ({ c }: { c: string }) => <Svg width={18} height={18} viewBox="0 0 24 24"><Line x1={18} y1={6} x2={6} y2={18} stroke={c} strokeWidth={2.5} strokeLinecap="round"/><Line x1={6} y1={6} x2={18} y2={18} stroke={c} strokeWidth={2.5} strokeLinecap="round"/></Svg>,
  Refresh:  ({ c }: { c: string }) => <Svg width={14} height={14} viewBox="0 0 24 24"><Path d="M23 4v6h-6M1 20v-6h6" stroke={c} strokeWidth={2} fill="none" strokeLinecap="round"/><Path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" stroke={c} strokeWidth={2} fill="none" strokeLinecap="round"/></Svg>,
  UserPlus: ({ c }: { c: string }) => <Svg width={15} height={15} viewBox="0 0 24 24"><Path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke={c} strokeWidth={2} fill="none" strokeLinecap="round"/><Circle cx={8.5} cy={7} r={4} stroke={c} strokeWidth={2} fill="none"/><Line x1={20} y1={8} x2={20} y2={14} stroke={c} strokeWidth={2} strokeLinecap="round"/><Line x1={23} y1={11} x2={17} y2={11} stroke={c} strokeWidth={2} strokeLinecap="round"/></Svg>,
  Car:      ({ c }: { c: string }) => <Svg width={11} height={11} viewBox="0 0 24 24"><Path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h14l4 4v4a2 2 0 0 1-2 2h-2M5 17a2 2 0 1 0 4 0M15 17a2 2 0 1 0 4 0" stroke={c} strokeWidth={2} fill="none" strokeLinecap="round"/><Path d="M3 9l2-4h10l2 4" stroke={c} strokeWidth={2} fill="none" strokeLinecap="round"/></Svg>,
};

interface Invite {
  id: string; family_id: string; code: string;
  status: 'pending' | 'accepted' | 'expired';
  expires_at: string;
}

// ─── Photo picker sheet ─────────────────────────────────────────────────────
// A proper AppBottomSheet (not a native Alert.alert — stacking a native
// Alert + ImagePicker presentation on top of an already-open RN <Modal> is a
// known iOS freeze/deadlock) matching the row layout of a sibling app's own
// avatar-picker sheet: circular preview + name/subtitle header, a grouped
// card of tappable rows (Take a photo / Choose from library / Remove photo),
// Cancel as its own button below the card. Exported so both EditMemberModal
// (here) and Profile's own EditMyProfileSheet (features/profile/
// ProfileSettingsScreen.tsx) share one implementation instead of forking it.
export function PhotoPickerSheet({
  visible, onClose, onTakePhoto, onChooseLibrary, onRemove, avatarUri, avatarEmoji, name, colors, isDark,
}: {
  visible: boolean; onClose: () => void;
  onTakePhoto: () => void; onChooseLibrary: () => void;
  /** Undefined hides the "Remove photo" row — nothing to remove yet. */
  onRemove?: () => void;
  avatarUri?: string | null; avatarEmoji?: string; name?: string;
  colors: any; isDark: boolean;
}) {
  const rows = [
    { icon: 'camera' as const, label: 'Take a photo', sub: 'Use your camera', onPress: onTakePhoto },
    { icon: 'images' as const, label: 'Choose from library', sub: 'Pick from your photos', onPress: onChooseLibrary },
  ];
  return (
    <AppBottomSheet visible={visible} onClose={onClose} minHeight="40%" maxHeight="65%" title="">
      <View style={{ alignItems: 'center', paddingTop: 4, paddingBottom: 20 }}>
        <View style={{ width: 84, height: 84, borderRadius: 42, overflow: 'hidden',
          backgroundColor: BRAND.purple + '18', alignItems: 'center', justifyContent: 'center',
          borderWidth: 2, borderColor: BRAND.purple }}>
          {avatarUri
            ? <Image source={{ uri: avatarUri }} style={{ width: 84, height: 84 }} />
            : <Text style={{ fontSize: 36 }}>{avatarEmoji ?? '👤'}</Text>}
        </View>
        <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPrimary, marginTop: 12 }}>{name ?? 'Profile photo'}</Text>
        <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>Choose how to update your photo</Text>
      </View>

      <View style={{ borderRadius: 16, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginBottom: 12 }}>
        {rows.map((opt, i) => (
          <View key={opt.label}>
            {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />}
            <TouchableOpacity onPress={opt.onPress}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, backgroundColor: isDark ? colors.card : '#fff' }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: BRAND.purple + '18', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={opt.icon} size={19} color={BRAND.purple} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>{opt.label}</Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 1 }}>{opt.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>
        ))}
        {onRemove && (
          <>
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
            <TouchableOpacity onPress={onRemove}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, backgroundColor: isDark ? colors.card : '#fff' }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: BRAND.rose + '18', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="trash" size={18} color={BRAND.rose} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: BRAND.rose }}>Remove photo</Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 1 }}>Revert to the emoji avatar</Text>
              </View>
            </TouchableOpacity>
          </>
        )}
      </View>

      <TouchableOpacity onPress={onClose}
        style={{ height: 50, borderRadius: 14, backgroundColor: isDark ? colors.card : '#fff',
          borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
          alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
      </TouchableOpacity>
    </AppBottomSheet>
  );
}

// ─── Main RosterTab ───────────────────────────────────────────────────────────

export default function RosterTab({ colors, isDark }: { colors: any; isDark: boolean }) {
  // Narrow, individually-selected subscriptions — a bare useFamilyStore()
  // (no selector) subscribes to the ENTIRE store object, re-rendering this
  // whole tab (member tree + invite card) on every unrelated store tick
  // (realtime members-table events, AsyncStorage cache writes, syncFromDB
  // polling), not just actual member changes. Same fix applied to
  // ProfileSettingsScreen.tsx's equivalent top-level call — see that file's
  // own comment for the full freeze-diagnosis context.
  const allMembers = useFamilyStore(s => s.members);
  const activeMemberId = useFamilyStore(s => s.activeMemberId);
  const updateMember = useFamilyStore(s => s.updateMember);
  const removeMember = useFamilyStore(s => s.removeMember);
  // Soft-deleted members (Roster's own "Remove" below, or a self-deleted
  // account via Profile's danger zone) stay in the store — restorable via
  // PIN re-entry within 7 days (familyStore.setActiveMember) — but drop out
  // of every member-facing list here so a "removed" person doesn't keep
  // showing up in the family tree as if nothing happened.
  // Pending invitees (per-invitee invite flow, invite_status = 'pending')
  // are real rows but nobody has claimed them yet — they don't belong in
  // the live family tree/roster (which reads as "who's actually in this
  // family right now") alongside everyone else. They show in Profile's own
  // dedicated pending-invite list instead. Memoized — see
  // ProfileSettingsScreen.tsx's identical members useMemo for why a bare
  // .filter() every render would defeat FamilyTreeView/MemberCard's own
  // memoization below (fresh array identity on every render even when
  // allMembers itself hasn't changed).
  const members = useMemo(
    () => allMembers.filter(m => !m.deletedAt && m.inviteStatus !== 'pending'),
    [allMembers]
  );
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const isParent = activeMember?.role === 'parent';
  // Was members[0]?.familyId — assumed the first member in the array shared
  // the active member's family, which breaks the moment the active member
  // isn't first (e.g. right after switching profiles). activeMember is
  // already resolved above; use its own familyId directly.
  const familyId = activeMember?.familyId ?? '';

  const [invites, setInvites]     = useState<Invite[]>([]);
  const [loading, setLoading]     = useState(true);
  const [creating, setCreating]   = useState(false);
  const [copied, setCopied]       = useState<string | null>(null);
  // Single member-sheet target — was three separate targets (pinTarget/
  // editTarget/viewTarget) each opening its own stacked Modal (PinModal/
  // EditMemberModal/MemberProfileSheet). Now ONE unified MemberProfileSheet
  // instance handles view/edit/pin internally via its own `section` state;
  // this just tracks which member it's open for, plus which section to
  // land on (long-press → 'edit', key icon → 'pin', tap → 'view').
  const [viewTarget, setViewTarget] = useState<any | null>(null);
  const [initialSection, setInitialSection] = useState<'view' | 'edit' | 'pin'>('view');
  const openMember = (m: any, section: 'view' | 'edit' | 'pin' = 'view') => { setInitialSection(section); setViewTarget(m); };
  const [showPins, setShowPins]   = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('family_invites').select('*')
      .order('expires_at', { ascending: false }).limit(10);
    if (data) setInvites(data as Invite[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const createInvite = async () => {
    if (!familyId || !activeMemberId) return;
    setCreating(true);
    // Routed through the generate-invite-code edge function — this used to
    // insert a weak client-generated code (Math.random().toString(36), no
    // family-name prefix, includes visually-ambiguous chars like 0/O/1/I)
    // directly into family_invites, bypassing the same security hardening
    // already applied to the onboarding invite-code path.
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
        body: JSON.stringify({ familyId, memberId: activeMemberId }),
      });
      const json = await res.json();
      if (json.ok) await load();
    } finally {
      setCreating(false);
    }
  };

  // Member-scoped resend, used by EditMemberModal's GP-only "Resend Invite"
  // action — generates a fresh code tied to THAT member's row (targetMemberId),
  // same per-invitee model InviteMemberSheet (features/profile/
  // ProfileSettingsScreen.tsx) uses, just triggered from Roster instead of
  // Profile. A brand-new code, not a TTL refresh on the old one, per spec
  // ("each time we should generate new invite for that person").
  // Returns the result instead of Alert.alert-ing it directly — this runs
  // from inside MemberProfileSheet's still-open bottom sheet (a Modal), and
  // a native Alert firing while that Modal is visible is the exact
  // Alert-over-Modal freeze already found and fixed once this session for
  // the photo picker. The caller renders the result inline instead.
  const resendInviteFor = async (targetMember: any): Promise<{ ok: true; code: string; emailSent?: boolean; emailError?: string | null } | { ok: false; error: string }> => {
    if (!familyId || !activeMemberId) return { ok: false, error: 'Not ready yet — try again in a moment.' };
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
        body: JSON.stringify({ familyId, memberId: activeMemberId, targetMemberId: targetMember.id }),
      });
      const json = await res.json();
      if (json.ok) return { ok: true, code: json.code, emailSent: json.emailSent, emailError: json.emailError };
      return { ok: false, error: json.error ?? 'Something went wrong.' };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'Network error.' };
    }
  };

  const copyCode = async (code: string) => {
    await Clipboard.setStringAsync(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const revokeInvite = async (id: string) => {
    // Was unchecked — a failed update left the invite marked "expired" only
    // in local state while the DB row stayed 'pending', meaning the code
    // would silently keep working for anyone who still had it even though
    // the UI showed it as revoked.
    const { error } = await supabase.from('family_invites').update({ status: 'expired' }).eq('id', id);
    if (error) {
      console.warn('[RosterTab] revokeInvite failed', error.message);
      Alert.alert("Couldn't revoke code", error.message);
      return;
    }
    setInvites(prev => prev.map(i => i.id === id ? { ...i, status: 'expired' } : i));
  };

  const savePin = async (memberId: string, pin: string) => {
    // Was an unchecked await — a failed write (RLS, network) still fell
    // through to updateMember() below, so the UI showed "saved" while the
    // DB kept the old PIN. That member then can't log in with the PIN they
    // were just told was set, with zero indication anywhere of why.
    const { error } = await supabase.from('members').update({ pin }).eq('id', memberId);
    if (error) {
      console.warn('[RosterTab] savePin failed', error.message);
      Alert.alert("Couldn't save PIN", error.message);
      return;
    }
    updateMember(memberId, { pin });
  };

  const deleteMember = async (memberId: string) => {
    // removeMember() soft-deletes (members.deleted_at = now()) rather than
    // hard-deleting — chore/event cleanup still runs first (see its own
    // comments), but the row itself sticks around for 7 days so the member
    // can be restored, and member-purge-sweep only removes it for good
    // after that window. Still throws on a genuine DB failure so a blocked
    // update doesn't silently vanish the member from local state while the
    // DB row stays behind.
    try {
      await removeMember(memberId);
    } catch (e: any) {
      Alert.alert(
        'Could Not Remove Member',
        e?.message || 'Something went wrong removing this family member.'
      );
    }
  };

  const saveMember = async (memberId: string, name: string, role: string, hasCar: boolean, rideEarningsPerRun: number, groceryEarningsPerRun: number, subRole?: string, relationship?: string, avatarEmoji?: string, avatarUrl?: string) => {
    const { error } = await saveMemberEdit(updateMember, memberId, name, role, hasCar, rideEarningsPerRun, groceryEarningsPerRun, subRole, relationship, avatarEmoji, avatarUrl);
    if (error) Alert.alert('Couldn\'t save changes', error);
  };

  const togglePin = (id: string) => setShowPins(s => ({ ...s, [id]: !s[id] }));

  const fmtExpiry = (iso: string) => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const diffH = Math.round((d.getTime() - now.getTime()) / 3600000);
      if (diffH < 0) return 'Expired';
      if (diffH < 24) return `${diffH}h left`;
      return `${Math.floor(diffH / 24)}d left`;
    } catch { return '--'; }
  };

  if (loading) return (
    <SCard colors={colors} isDark={isDark}>
      <CardHeader Icon={Users} iconColor={BRAND.purple} title="Family Roster" colors={colors} />
      <ActivityIndicator color={BRAND.purple} style={{ marginVertical: 24 }} />
    </SCard>
  );

  return (
    <>
      {/* ── Members — family tree layout, on the plain canvas (no outer
          card boundary), matching the reference mock's flat layout ── */}
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Users size={16} color={BRAND.purple} />
          <Text style={{ fontSize: 15, fontWeight: '900', color: colors.textPrimary, flex: 1 }}>Family Tree</Text>
          <View style={{ backgroundColor: BRAND.purple + '20', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: BRAND.purple }}>{members.length}</Text>
          </View>
        </View>
        <FamilyTreeView
          members={members} activeMemberId={activeMemberId} isParent={isParent}
          colors={colors} isDark={isDark}
          onView={(m) => openMember(m, 'view')} onEdit={(m) => openMember(m, 'edit')} onPin={(m) => openMember(m, 'pin')}
        />
        <Text style={{ fontSize: 10, color: colors.textTertiary, textAlign: 'center' }}>
          Tap anyone to view · {isParent ? 'long-press to edit · ' : ''}tap the key icon for PIN
        </Text>
      </View>

      {/* ── Invites ──────────────────────────────────── */}
      {isParent && (
        <SCard colors={colors} isDark={isDark}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <CardHeader Icon={Mail} iconColor={BRAND.teal} title="Invite Codes"
              badge={`${invites.filter(i => i.status === 'pending').length} active`} badgeColor={BRAND.teal}
              colors={colors} />
            <TouchableOpacity onPress={load}>
              <I.Refresh c={BRAND.teal} />
            </TouchableOpacity>
          </View>

          {invites.length === 0 && (
            <Text style={{ fontSize: 13, color: colors.textTertiary, textAlign: 'center', paddingVertical: 16 }}>
              No invites yet. Create one to add a family member.
            </Text>
          )}

          {invites.map(inv => {
            const isPending = inv.status === 'pending';
            const ic = isPending ? BRAND.teal : inv.status === 'accepted' ? BRAND.emerald : colors.textTertiary;
            return (
              <View key={inv.id} style={[r.inviteRow, {
                borderColor: ic + '50',
                backgroundColor: isDark ? colors.card + 'AA' : ic + '08',
              }]}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 20, fontWeight: '900', letterSpacing: 4, color: colors.textPrimary }}>
                      {inv.code}
                    </Text>
                    {isPending && (
                      <TouchableOpacity onPress={() => copyCode(inv.code)}>
                        {copied === inv.code
                          ? <I.Check c={BRAND.emerald} />
                          : <I.Copy c={BRAND.teal} />}
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 }}>
                    <StatusPill label={inv.status} color={ic} />
                    {isPending && (
                      <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                        {fmtExpiry(inv.expires_at)}
                      </Text>
                    )}
                  </View>
                </View>
                {isPending && (
                  <TouchableOpacity onPress={() => revokeInvite(inv.id)}
                    style={[r.iconBtn, { borderColor: BRAND.rose + '50', backgroundColor: BRAND.rose + '10' }]}>
                    <I.Trash c={BRAND.rose} />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          <TouchableOpacity onPress={createInvite} disabled={creating}
            style={[r.inviteBtn, { borderColor: BRAND.teal + '60', backgroundColor: BRAND.teal + '10' }]}>
            {creating
              ? <ActivityIndicator size="small" color={BRAND.teal} />
              : <><I.UserPlus c={BRAND.teal} />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: BRAND.teal }}>Create Invite Code</Text></>}
          </TouchableOpacity>
        </SCard>
      )}

      {/* Member sheet — ONE unified instance (view/edit/pin/confirmRemove
          all live inside MemberProfileSheet's own `section` state) instead
          of the old PinModal/EditMemberModal/MemberProfileSheet trio. */}
      {viewTarget && (
        <MemberProfileSheet member={viewTarget} siblings={members.map(m => m.name)} allMembers={members}
          visible onClose={() => setViewTarget(null)}
          initialSection={initialSection}
          isParentViewer={isParent}
          canChangePin={isParent || viewTarget.id === activeMemberId}
          onSave={saveMember}
          onLinkParent={(id, parentId) => updateMember(id, { linkedParentId: parentId })}
          onDelete={deleteMember}
          onSavePin={savePin}
          onResetPin={(m) => openMember(m, 'pin')}
          onResendInvite={(m) => resendInviteFor(m)}
          colors={colors} isDark={isDark} />
      )}
    </>
  );
}

const r = StyleSheet.create({
  memberRow: { flexDirection: 'row', alignItems: 'flex-start', borderTopWidth: StyleSheet.hairlineWidth,
               paddingTop: 14, marginTop: 14 },
  iconBtn:   { width: 32, height: 32, borderRadius: 10, borderWidth: 1,
               alignItems: 'center', justifyContent: 'center' },
  inviteRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1.5,
               padding: 12, marginTop: 10, gap: 10 },
  inviteBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1.5,
               paddingHorizontal: 14, paddingVertical: 10, marginTop: 12, alignSelf: 'flex-start' },
});

const p = StyleSheet.create({
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
               paddingHorizontal: 24 },
  modal:     { borderRadius: 24, borderWidth: 1.5, padding: 24, width: '100%' },
  iconBox:   { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  label:     { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  inp:       { borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 13, paddingVertical: 11,
               textAlign: 'center' },
  roleChip:  { borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 7 },
  cancelBtn: { flex: 1, borderRadius: 14, borderWidth: 1.5, paddingVertical: 12, alignItems: 'center' },
  saveBtn:   { flex: 2, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
});
