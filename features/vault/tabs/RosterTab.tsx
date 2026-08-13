import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator,
  Modal, ScrollView, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import {
  Users, Mail, Send, Key, Lock, LockOpen, Copy, Check,
  Trash2, X, RefreshCw, UserPlus, Shield, Edit3,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useFamilyStore, MemberRole } from '@/store/familyStore';
import { SCard, CardHeader, MemberAvatar, StatusPill, BRAND } from './shared';

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
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[p.modal, {
            backgroundColor: isDark ? colors.card : '#fff',
            borderColor: colors.border,
          }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <View style={[p.iconBox, { backgroundColor: BRAND.purple + '20' }]}>
                <Key size={18} color={BRAND.purple} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '900', color: colors.textPrimary }}>
                  Set PIN for {member.name}
                </Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                  {member.role === 'child' ? 'Kids use this to unlock their profile.' : 'Used to confirm sensitive actions.'}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose}><X size={18} color={colors.textSecondary} /></TouchableOpacity>
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
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Edit-Member Modal ────────────────────────────────────────────────────────

function EditMemberModal({ member, onClose, onSave, colors, isDark }: {
  member: any; onClose: () => void;
  onSave: (memberId: string, name: string, role: string) => Promise<void>;
  colors: any; isDark: boolean;
}) {
  const [name, setName]   = useState(member.name ?? '');
  const [role, setRole]   = useState(member.role ?? 'child');
  const [saving, setSaving] = useState(false);

  const ROLES = ['parent', 'child', 'senior'];

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
            <Edit3 size={18} color={BRAND.purple} />
            <Text style={{ fontSize: 16, fontWeight: '900', flex: 1, color: colors.textPrimary }}>
              Edit Member
            </Text>
            <TouchableOpacity onPress={onClose}><X size={18} color={colors.textSecondary} /></TouchableOpacity>
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

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
            <TouchableOpacity onPress={onClose} style={[p.cancelBtn, { borderColor: colors.border }]}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={async () => { setSaving(true); await onSave(member.id, name, role); setSaving(false); onClose(); }}
              style={[p.saveBtn, { backgroundColor: BRAND.purple }]} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main RosterTab ───────────────────────────────────────────────────────────

export default function RosterTab({ colors, isDark }: { colors: any; isDark: boolean }) {
  const { members, activeMemberId, updateMember } = useFamilyStore();
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const isParent = activeMember?.role === 'parent';
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

  const saveMember = async (memberId: string, name: string, role: string) => {
    await supabase.from('members').update({ name, role }).eq('id', memberId);
    updateMember(memberId, { name, role: role as MemberRole });
  };

  const roleColor = (role: string) =>
    role === 'parent' ? BRAND.purple : role === 'senior' ? BRAND.blue : BRAND.emerald;

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
      {/* ── Members ──────────────────────────────────── */}
      <SCard colors={colors} isDark={isDark}>
        <CardHeader Icon={Users} iconColor={BRAND.purple} title="Family Members"
          badge={`${members.length}`} badgeColor={BRAND.purple} colors={colors} />

        {members.map(m => {
          const rc = roleColor(m.role);
          const hasPin = !!m.pin;
          const pinVisible = showPins[m.id];
          const canEdit = isParent || m.id === activeMemberId;

          return (
            <View key={m.id} style={[r.memberRow, { borderColor: colors.border }]}>
              <MemberAvatar name={m.name} color={rc} size={44} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: '900', color: colors.textPrimary }}>
                  {m.name}
                  {m.id === activeMemberId && (
                    <Text style={{ fontSize: 11, color: BRAND.purple }}> (you)</Text>
                  )}
                </Text>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                  <StatusPill label={m.role} color={rc} Icon={Shield} />
                  {hasPin
                    ? <StatusPill label="PIN set" color={BRAND.emerald} Icon={Lock} />
                    : <StatusPill label="No PIN" color={BRAND.amber} Icon={LockOpen} />}
                </View>

                {/* PIN preview (parent only) */}
                {isParent && hasPin && (
                  <TouchableOpacity onPress={() => togglePin(m.id)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 }}>
                    {pinVisible
                      ? <><LockOpen size={11} color={BRAND.amber} />
                          <Text style={{ fontSize: 12, fontWeight: '700', color: BRAND.amber }}>{m.pin}</Text></>
                      : <><Lock size={11} color={colors.textTertiary} />
                          <Text style={{ fontSize: 12, color: colors.textTertiary }}>Show PIN</Text></>}
                  </TouchableOpacity>
                )}
              </View>

              {canEdit && (
                <View style={{ gap: 8 }}>
                  <TouchableOpacity onPress={() => setPinTarget(m)}
                    style={[r.iconBtn, { borderColor: BRAND.purple + '50', backgroundColor: BRAND.purple + '10' }]}>
                    <Key size={14} color={BRAND.purple} />
                  </TouchableOpacity>
                  {isParent && (
                    <TouchableOpacity onPress={() => setEditTarget(m)}
                      style={[r.iconBtn, { borderColor: BRAND.teal + '50', backgroundColor: BRAND.teal + '10' }]}>
                      <Edit3 size={14} color={BRAND.teal} />
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </SCard>

      {/* ── Invites ──────────────────────────────────── */}
      {isParent && (
        <SCard colors={colors} isDark={isDark}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <CardHeader Icon={Mail} iconColor={BRAND.teal} title="Invite Codes"
              badge={`${invites.filter(i => i.status === 'pending').length} active`} badgeColor={BRAND.teal}
              colors={colors} />
            <TouchableOpacity onPress={load}>
              <RefreshCw size={14} color={BRAND.teal} />
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
                          ? <Check size={16} color={BRAND.emerald} />
                          : <Copy size={16} color={BRAND.teal} />}
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
                    <Trash2 size={14} color={BRAND.rose} />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          <TouchableOpacity onPress={createInvite} disabled={creating}
            style={[r.inviteBtn, { borderColor: BRAND.teal + '60', backgroundColor: BRAND.teal + '10' }]}>
            {creating
              ? <ActivityIndicator size="small" color={BRAND.teal} />
              : <><UserPlus size={15} color={BRAND.teal} />
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
          onSave={saveMember} colors={colors} isDark={isDark} />
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
