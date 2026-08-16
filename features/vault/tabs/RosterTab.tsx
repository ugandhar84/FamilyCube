import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator,
  Modal, ScrollView, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import Svg, { Path, Circle, Rect, Polyline, Line } from 'react-native-svg';
import { Users, Mail } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useFamilyStore, MemberRole } from '@/store/familyStore';
import { SCard, CardHeader, MemberAvatar, StatusPill, BRAND } from './shared';

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

// ─── PIN management modal ─────────────────────────────────────────────────────

function PinModal({ member, onClose, onSave, colors, isDark }: {
  member: any; onClose: () => void;
  onSave: (memberId: string, pin: string) => Promise<void>;
  colors: any; isDark: boolean;
}) {
  const [pin, setPin]       = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const handleSave = async () => {
    setError('');
    if (pin.length < 4) { setError('PIN must be at least 4 digits.'); return; }
    if (pin !== confirm) { setError('PINs do not match.'); return; }
    if (!/^\d+$/.test(pin)) { setError('PIN must be numbers only.'); return; }
    setSaving(true);
    await onSave(member.id, pin);
    setSaving(false);
    onClose();
  };

  const inp = [p.inp, {
    backgroundColor: isDark ? colors.card : '#F5F3FF',
    borderColor: error ? BRAND.rose : colors.border, color: colors.textPrimary,
    letterSpacing: 8, fontSize: 22,
  }];

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <View style={p.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
          <ScrollView keyboardShouldPersistTaps="handled" bounces={false}
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingVertical: 20 }}>
          <View style={[p.modal, {
            backgroundColor: isDark ? colors.card : '#fff',
            borderColor: colors.border,
          }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <View style={[p.iconBox, { backgroundColor: BRAND.purple + '20' }]}>
                <I.Key c={BRAND.purple} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '900', color: colors.textPrimary }}>
                  Set PIN for {member.name}
                </Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                  {member.role === 'child' ? 'Kids use this to unlock their profile.' : 'Used to confirm sensitive actions.'}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose}><I.X c={colors.textSecondary} /></TouchableOpacity>
            </View>

            <Text style={[p.label, { color: colors.textSecondary }]}>New PIN (digits only)</Text>
            <TextInput value={pin} onChangeText={setPin} keyboardType="numeric"
              secureTextEntry maxLength={6} placeholder="••••" placeholderTextColor={colors.textTertiary} style={inp} />

            <Text style={[p.label, { color: colors.textSecondary, marginTop: 12 }]}>Confirm PIN</Text>
            <TextInput value={confirm} onChangeText={setConfirm} keyboardType="numeric"
              secureTextEntry maxLength={6} placeholder="••••" placeholderTextColor={colors.textTertiary} style={inp} />

            {error ? <Text style={{ color: BRAND.rose, fontSize: 12, fontWeight: '700', marginTop: 6 }}>{error}</Text> : null}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <TouchableOpacity onPress={onClose} style={[p.cancelBtn, { borderColor: colors.border }]}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave} style={[p.saveBtn, { backgroundColor: BRAND.purple }]} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>Set PIN</Text>}
              </TouchableOpacity>
            </View>
          </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Edit-Member Modal ────────────────────────────────────────────────────────

function EditMemberModal({ member, onClose, onSave, onDelete, colors, isDark }: {
  member: any; onClose: () => void;
  onSave: (memberId: string, name: string, role: string, hasCar: boolean, rideEarnings: number, groceryEarnings: number) => Promise<void>;
  onDelete: (memberId: string) => Promise<void>;
  colors: any; isDark: boolean;
}) {
  const [name, setName]   = useState(member.name ?? '');
  const [role, setRole]   = useState(member.role ?? 'child');
  const [hasCar, setHasCar] = useState(member.hasCar ?? false);
  const [rideEarnings, setRideEarnings] = useState(String(member.rideEarningsPerRun ?? 50));
  const [groceryEarnings, setGroceryEarnings] = useState(String(member.groceryEarningsPerRun ?? 30));
  const [saving, setSaving] = useState(false);

  const ROLES = ['parent', 'child', 'teenager', 'senior'];

  const inp = [p.inp, {
    backgroundColor: isDark ? colors.card : '#F5F3FF',
    borderColor: colors.border, color: colors.textPrimary,
    letterSpacing: 0, fontSize: 15,
  }];

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <View style={p.overlay}>
        <View style={[p.modal, { backgroundColor: isDark ? colors.card : '#fff', borderColor: colors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <I.Key c={BRAND.purple} />
            <Text style={{ fontSize: 16, fontWeight: '900', flex: 1, color: colors.textPrimary }}>
              Edit Member
            </Text>
            <TouchableOpacity onPress={onClose}><I.X c={colors.textSecondary} /></TouchableOpacity>
          </View>

          <Text style={[p.label, { color: colors.textSecondary }]}>Name</Text>
          <TextInput value={name} onChangeText={setName} style={inp} />

          <Text style={[p.label, { color: colors.textSecondary, marginTop: 12 }]}>Role</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
            {ROLES.map(r => (
              <TouchableOpacity key={r} onPress={() => setRole(r)}
                style={[p.roleChip, {
                  backgroundColor: role === r ? BRAND.purple : 'transparent',
                  borderColor: role === r ? BRAND.purple : colors.border,
                }]}>
                <Text style={{ fontSize: 13, fontWeight: '700', textTransform: 'capitalize',
                  color: role === r ? '#fff' : colors.textSecondary }}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Teen-specific settings */}
          {(role === 'teenager') && (
            <View style={{ marginTop: 14, gap: 10 }}>
              <TouchableOpacity
                onPress={() => setHasCar((v: boolean) => !v)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  padding: 12, borderRadius: 12, borderWidth: 1.5,
                  borderColor: hasCar ? BRAND.amber : colors.border,
                  backgroundColor: hasCar ? BRAND.amber + '12' : 'transparent' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <I.Car c={hasCar ? BRAND.amber : colors.textSecondary} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: hasCar ? BRAND.amber : colors.textPrimary }}>
                    Has a Car
                  </Text>
                </View>
                <View style={{ width: 38, height: 22, borderRadius: 11,
                  backgroundColor: hasCar ? BRAND.amber : colors.border,
                  justifyContent: 'center', paddingHorizontal: 2 }}>
                  <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff',
                    alignSelf: hasCar ? 'flex-end' : 'flex-start' }} />
                </View>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[p.label, { color: colors.textSecondary }]}>Ride earnings (coins)</Text>
                  <TextInput value={rideEarnings} onChangeText={setRideEarnings} keyboardType="number-pad"
                    style={[p.inp, { backgroundColor: isDark ? colors.card : '#F5F3FF',
                      borderColor: colors.border, color: colors.textPrimary, letterSpacing: 0, fontSize: 15 }]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[p.label, { color: colors.textSecondary }]}>Grocery earnings (coins)</Text>
                  <TextInput value={groceryEarnings} onChangeText={setGroceryEarnings} keyboardType="number-pad"
                    style={[p.inp, { backgroundColor: isDark ? colors.card : '#F5F3FF',
                      borderColor: colors.border, color: colors.textPrimary, letterSpacing: 0, fontSize: 15 }]} />
                </View>
              </View>
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
            <TouchableOpacity onPress={onClose} style={[p.cancelBtn, { borderColor: colors.border }]}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={async () => {
                setSaving(true);
                await onSave(member.id, name, role, hasCar, parseInt(rideEarnings) || 50, parseInt(groceryEarnings) || 30);
                setSaving(false); onClose();
              }}
              style={[p.saveBtn, { backgroundColor: BRAND.purple }]} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>Save</Text>}
            </TouchableOpacity>
          </View>

          {/* Delete member */}
          <TouchableOpacity
            onPress={() => {
              Alert.alert(
                `Remove ${member.name}?`,
                'This will remove them from your family. This cannot be undone.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: async () => {
                    await onDelete(member.id); onClose();
                  }},
                ]
              );
            }}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, paddingVertical: 8 }}>
            <I.Trash c={BRAND.rose} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND.rose }}>Remove from Family</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main RosterTab ───────────────────────────────────────────────────────────

export default function RosterTab({ colors, isDark }: { colors: any; isDark: boolean }) {
  const { members, activeMemberId, updateMember, removeMember } = useFamilyStore();
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const isParent = activeMember?.role === 'parent';
  const ROLE_ORDER: Record<string, number> = { parent: 0, teen: 1, kid: 2, senior: 3 };
  const sortedMembers = [...members].sort((a, b) =>
    (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9));
  const familyId = (members[0] as any)?.familyId ?? '';

  const [invites, setInvites]     = useState<Invite[]>([]);
  const [loading, setLoading]     = useState(true);
  const [creating, setCreating]   = useState(false);
  const [copied, setCopied]       = useState<string | null>(null);
  const [pinTarget, setPinTarget] = useState<any | null>(null);
  const [editTarget, setEditTarget] = useState<any | null>(null);
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
    if (!familyId) return;
    setCreating(true);
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const { data } = await supabase.from('family_invites').insert({
      family_id: familyId, code, status: 'pending', expires_at: expiresAt,
    }).select().single();
    if (data) setInvites(prev => [data as Invite, ...prev]);
    setCreating(false);
  };

  const copyCode = (code: string) => {
    // Clipboard.setStringAsync not available without expo-clipboard; show as copied visually
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const revokeInvite = async (id: string) => {
    await supabase.from('family_invites').update({ status: 'expired' }).eq('id', id);
    setInvites(prev => prev.map(i => i.id === id ? { ...i, status: 'expired' } : i));
  };

  const savePin = async (memberId: string, pin: string) => {
    await supabase.from('members').update({ pin }).eq('id', memberId);
    updateMember(memberId, { pin });
  };

  const deleteMember = async (memberId: string) => {
    await supabase.from('members').delete().eq('id', memberId);
    removeMember(memberId);
  };

  const saveMember = async (memberId: string, name: string, role: string, hasCar: boolean, rideEarningsPerRun: number, groceryEarningsPerRun: number) => {
    const dbRole = role;
    await supabase.from('members').update({ name, role: dbRole, has_car: hasCar, ride_earnings_per_run: rideEarningsPerRun, grocery_earnings_per_run: groceryEarningsPerRun }).eq('id', memberId);
    const appRole: MemberRole = role === 'child' ? 'kid' : role === 'teenager' ? 'teen' : role as MemberRole;
    updateMember(memberId, { name, role: appRole, hasCar, rideEarningsPerRun, groceryEarningsPerRun });
  };

  const roleColor = (role: string) =>
    role === 'parent' ? BRAND.purple : role === 'senior' ? BRAND.blue : role === 'teen' ? BRAND.amber : BRAND.emerald;

  const roleEmoji = (role: string) =>
    role === 'parent' ? '👨‍👩' : role === 'teen' ? '🎧' : role === 'senior' ? '👴' : '⭐';

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
      {/* ── Members — 2-column card grid ─────────────── */}
      <SCard colors={colors} isDark={isDark}>
        <CardHeader Icon={Users} iconColor={BRAND.purple} title="Family Members"
          badge={`${members.length}`} badgeColor={BRAND.purple} colors={colors} />

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
          {sortedMembers.map(m => {
            const rc = roleColor(m.role);
            const hasPin = !!m.pin;
            const isActive = m.id === activeMemberId;
            const isTeen = m.role === 'teen';
            const ROLE_LABEL: Record<string, string> = {
              parent: 'Parent', kid: 'Kid', teen: 'Teen', senior: 'Senior',
            };

            return (
              <TouchableOpacity key={m.id} activeOpacity={0.88}
                onLongPress={() => { if (isParent) setEditTarget(m); }}
                delayLongPress={500}
                style={{
                  width: '47%',
                  borderRadius: 20,
                  overflow: 'hidden',
                  backgroundColor: isDark ? colors.card : '#fff',
                  borderWidth: 2,
                  borderColor: isActive ? rc : (isDark ? colors.border : '#EBEBF0'),
                  shadowColor: rc,
                  shadowOpacity: isActive ? 0.12 : 0,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: isActive ? 3 : 0,
                }}>

                {/* Colored top bar */}
                <View style={{ height: 6, backgroundColor: rc }} />

                <View style={{ padding: 10 }}>
                  {/* Emoji avatar */}
                  <View style={{ alignItems: 'center', marginBottom: 6 }}>
                    <View style={{ width: 48, height: 48, borderRadius: 24,
                      backgroundColor: rc + '18', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 24 }}>
                        {m.emoji ?? (m.role === 'parent' ? '👨' : m.role === 'senior' ? '👴' : m.role === 'teen' ? '🎧' : '⭐')}
                      </Text>
                    </View>
                    {isActive && (
                      <View style={{ marginTop: 3, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5,
                        backgroundColor: rc + '20' }}>
                        <Text style={{ fontSize: 8, fontWeight: '800', color: rc }}>YOU</Text>
                      </View>
                    )}
                  </View>

                  {/* Name + role */}
                  <Text style={{ fontSize: 14, fontWeight: '900', color: colors.textPrimary,
                    textAlign: 'center' }} numberOfLines={1}>
                    {m.name.split(' ')[0]}
                  </Text>
                  <View style={{ alignSelf: 'center', paddingHorizontal: 8, paddingVertical: 2,
                    borderRadius: 6, backgroundColor: rc + '15', marginTop: 3, marginBottom: 8 }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: rc }}>
                      {roleEmoji(m.role)} {ROLE_LABEL[m.role] ?? m.role}
                    </Text>
                  </View>

                  {/* Stats strip */}
                  <View style={{ flexDirection: 'row', borderRadius: 8, overflow: 'hidden',
                    backgroundColor: isDark ? colors.surface : '#F5F5FA', marginBottom: 8 }}>
                    <View style={{ flex: 1, alignItems: 'center', paddingVertical: 5 }}>
                      <Text style={{ fontSize: 12, fontWeight: '900', color: rc }}>{m.coins}</Text>
                      <Text style={{ fontSize: 7, color: colors.textTertiary }}>COINS</Text>
                    </View>
                    <View style={{ width: 1, backgroundColor: isDark ? colors.border : '#E0E0EA' }} />
                    <View style={{ flex: 1, alignItems: 'center', paddingVertical: 5 }}>
                      <Text style={{ fontSize: 12, fontWeight: '900', color: colors.textPrimary }}>{m.streak}🔥</Text>
                      <Text style={{ fontSize: 7, color: colors.textTertiary }}>STREAK</Text>
                    </View>
                    <View style={{ width: 1, backgroundColor: isDark ? colors.border : '#E0E0EA' }} />
                    <View style={{ flex: 1, alignItems: 'center', paddingVertical: 5 }}>
                      <Text style={{ fontSize: 12, fontWeight: '900', color: colors.textPrimary }}>L{m.level}</Text>
                      <Text style={{ fontSize: 7, color: colors.textTertiary }}>LEVEL</Text>
                    </View>
                  </View>

                  {/* Teen car badge */}
                  {isTeen && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3,
                      justifyContent: 'center', marginBottom: 6,
                      paddingVertical: 3, borderRadius: 6,
                      backgroundColor: m.hasCar ? BRAND.amber + '15' : (isDark ? colors.surface : '#F5F5FA') }}>
                      <I.Car c={m.hasCar ? BRAND.amber : colors.textTertiary} />
                      <Text style={{ fontSize: 9, fontWeight: '700',
                        color: m.hasCar ? BRAND.amber : colors.textTertiary }}>
                        {m.hasCar ? 'Has car' : 'No car'}
                      </Text>
                    </View>
                  )}

                  {/* PIN + key button */}
                  <View style={{ flexDirection: 'row', gap: 5 }}>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3,
                      paddingVertical: 4, paddingHorizontal: 6, borderRadius: 7,
                      backgroundColor: hasPin ? BRAND.emerald + '15' : BRAND.amber + '12' }}>
                      {hasPin
                        ? <><I.Lock c={BRAND.emerald} /><Text style={{ fontSize: 8, fontWeight: '800', color: BRAND.emerald }}>PIN set</Text></>
                        : <><I.LockOpen c={BRAND.amber} /><Text style={{ fontSize: 8, fontWeight: '700', color: BRAND.amber }}>No PIN</Text></>}
                    </View>
                    {(isParent || isActive) && (
                      <TouchableOpacity onPress={() => setPinTarget(m)}
                        style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
                          backgroundColor: BRAND.purple + '15', borderWidth: 1, borderColor: BRAND.purple + '30' }}>
                        <I.Key c={BRAND.purple} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </SCard>

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

      {/* Modals */}
      {pinTarget && (
        <PinModal member={pinTarget} onClose={() => setPinTarget(null)}
          onSave={savePin} colors={colors} isDark={isDark} />
      )}
      {editTarget && (
        <EditMemberModal member={editTarget} onClose={() => setEditTarget(null)}
          onSave={saveMember} onDelete={deleteMember} colors={colors} isDark={isDark} />
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
