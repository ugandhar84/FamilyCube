/**
 * InvitePage — full-page version of InviteMemberSheet, Figma-skinned.
 * Same logic as ProfileSettingsScreen's InviteMemberSheet:
 *   Name → Role → Relationship (optional) → DOB (optional) → Email (optional)
 *   → Add & Generate Code → per-member code cards with Copy/Share/New Code
 *   → Already Joined list
 */
import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, ScrollView, ActivityIndicator,
  StyleSheet, TextInput, TouchableOpacity, Share, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Clipboard from 'expo-clipboard';
import { Calendar, RefreshCw, Copy, Check, Share2, Key } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { supabase } from '@/lib/supabase';
import { useFamilyStore, RELATIONSHIPS_BY_ROLE, type MemberRole, type FamilyMember } from '@/store/familyStore';
import { localDateStr, fmtDate } from '@/lib/dates';

// ── Figma exact values ───────────────────────────────────────────────────────
const PAGE_BG   = '#F3F5F2';
const TITLE_CLR = '#172337';
const BODY_CLR  = '#657185';
const BLUE      = '#294FC7';
const BORDER    = '#DFE5EF';

const ROLES: { value: MemberRole; label: string; emoji: string }[] = [
  { value: 'kid',    label: 'Kid',         emoji: '🧒' },
  { value: 'teen',   label: 'Teen',        emoji: '🧑' },
  { value: 'parent', label: 'Parent',      emoji: '👤' },
  { value: 'senior', label: 'Grandparent', emoji: '🧓' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_DOB  = new Date();
const MIN_DOB  = new Date(Date.now() - 110 * 365.25 * 24 * 3600_000);

interface PendingInvite {
  id: string; member_id: string | null; code: string;
  status: 'pending' | 'accepted' | 'expired'; expires_at: string;
}

function SectionLabel({ text }: { text: string }) {
  return (
    <Text style={{ fontSize: 11, fontWeight: '700', color: BODY_CLR, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
      {text}
    </Text>
  );
}

export function InvitePage({ onClose }: { onClose: () => void }) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const pageBg = isDark ? '#0E0C13' : PAGE_BG;
  const cardBg = isDark ? '#1D1A24' : '#FFFFFF';
  const inputBg = isDark ? colors.surface : PAGE_BG;
  const labelClr = isDark ? '#FDFCF9' : TITLE_CLR;

  const activeMemberId   = useFamilyStore(s => s.activeMemberId);
  const allMembers       = useFamilyStore(s => s.members);
  const addPendingMember = useFamilyStore(s => s.addPendingMember);
  const activeMember     = allMembers.find(m => m.id === activeMemberId) ?? allMembers[0];
  const familyId         = activeMember?.familyId ?? '';

  // pending = not yet joined; joined = everyone else except the active parent
  const pendingMembers  = allMembers.filter(m => m.inviteStatus === 'pending' && !m.deletedAt);
  const joinedMembers   = allMembers.filter(m => m.inviteStatus !== 'pending' && !m.deletedAt && m.id !== activeMemberId);

  // ── Form state ───────────────────────────────────────────────────────────
  const [name,         setName]         = useState('');
  const [role,         setRole]         = useState<MemberRole>('kid');
  const [relationship, setRelationship] = useState<string | undefined>(undefined);
  const [dob,          setDob]          = useState<Date | null>(null);
  const [showDobPicker,setShowDobPicker]= useState(false);
  const [email,        setEmail]        = useState('');
  const [touched,      setTouched]      = useState<{ name?: boolean; email?: boolean }>({});
  const [linkedParentId, setLinkedParentId] = useState<string | undefined>(undefined);
  const [creating,     setCreating]     = useState(false);
  const [codeStatus,   setCodeStatus]   = useState<{ memberId: string; kind: 'error' | 'info'; text: string } | null>(null);

  const parentMembers = allMembers.filter(m => m.role === 'parent' && !m.deletedAt);

  // ── Invite codes (per-member) ────────────────────────────────────────────
  const [invitesByMember, setInvitesByMember] = useState<Record<string, PendingInvite>>({});
  const [loadingInvites,  setLoadingInvites]  = useState(true);
  const [regenerating,    setRegenerating]    = useState<string | null>(null);
  const [copiedId,        setCopiedId]        = useState<string | null>(null);

  // ── Validation ───────────────────────────────────────────────────────────
  const nameError  = touched.name  && !name.trim() ? 'Name is required.' : undefined;
  const emailError = touched.email && email.trim() && !EMAIL_RE.test(email.trim()) ? 'Enter a valid email address.' : undefined;
  const dobError   = dob && (dob > MAX_DOB ? "DOB can't be in the future." : dob < MIN_DOB ? 'Date seems too far back.' : undefined);
  const formValid  = !!name.trim() && !emailError && !dobError;

  const fmtExpiry = (iso: string) => {
    try {
      const diffH = Math.round((new Date(iso).getTime() - Date.now()) / 3600000);
      if (diffH < 0) return 'Expired';
      if (diffH < 24) return `${diffH}h left`;
      return `${Math.floor(diffH / 24)}d left`;
    } catch { return '--'; }
  };

  const loadInvites = useCallback(async () => {
    setLoadingInvites(true);
    const { data } = await supabase
      .from('family_invites')
      .select('id, member_id, code, status, expires_at')
      .eq('family_id', familyId)
      .not('member_id', 'is', null)
      .order('expires_at', { ascending: false });
    if (data) {
      const byMember: Record<string, PendingInvite> = {};
      for (const inv of data as PendingInvite[]) {
        if (inv.member_id && !byMember[inv.member_id]) byMember[inv.member_id] = inv;
      }
      setInvitesByMember(byMember);
    }
    setLoadingInvites(false);
  }, [familyId]);

  useEffect(() => { loadInvites(); }, [loadInvites]);

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
        body: JSON.stringify({ familyId, memberId: activeMemberId, targetMemberId }),
      });
      const json = await res.json();
      if (json.ok) {
        await loadInvites();
        if (json.emailError) {
          setCodeStatus({ memberId: targetMemberId, kind: 'error', text: `Code created, but email failed (${json.emailError}). Share the code directly.` });
        } else if (json.emailSent) {
          setCodeStatus({ memberId: targetMemberId, kind: 'info', text: 'Code emailed to them.' });
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
      const created = await addPendingMember(
        name.trim(), role, relationship,
        dob ? localDateStr(dob) : undefined,
        email.trim() || undefined,
        role === 'senior' ? linkedParentId : undefined,
      );
      if (!created) {
        Alert.alert("Couldn't add family member", 'That email may already be in use, or something went wrong.');
        return;
      }
      setName(''); setRole('kid'); setRelationship(undefined);
      setDob(null); setEmail(''); setTouched({}); setLinkedParentId(undefined);
      await generateCodeFor(created.id);
    } finally {
      setCreating(false);
    }
  };

  const copyCode = async (memberId: string, code: string) => {
    await Clipboard.setStringAsync(code);
    setCopiedId(memberId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const shareCode = async (memberName: string, code: string) => {
    try {
      await Share.share({ message: `Join our family on Family Cube! Use invite code ${code} to set up ${memberName}'s profile.` });
    } catch { /* cancelled */ }
  };

  const relationshipOptions = RELATIONSHIPS_BY_ROLE[role] ?? [];

  const inputStyle = (error?: string | false) => [s.input, {
    color: labelClr, backgroundColor: inputBg,
    borderColor: error ? colors.danger : isDark ? colors.border : BORDER,
  }];

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>

      {/* ── Header ───────────────────────────────────────────────────── */}
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 24, paddingBottom: 4, backgroundColor: pageBg }}>
        <Pressable onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: BLUE }}>← Family</Text>
        </Pressable>
        <Text style={{ fontSize: 13, fontWeight: '500', color: BLUE, marginTop: 12 }}>Parents only</Text>
        <Text style={{ fontSize: 29, fontWeight: '700', color: labelClr, marginTop: 4, lineHeight: 36 }}>
          Invite family member
        </Text>
        <Text style={{ fontSize: 13, fontWeight: '500', color: BODY_CLR, marginTop: 6, lineHeight: 18, marginBottom: 4 }}>
          Add their details, then share the code they'll use to join.
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: insets.bottom + 48 }}
      >

        {/* ── ADD SOMEONE NEW ──────────────────────────────────────── */}
        <View style={[s.card, { backgroundColor: cardBg, borderColor: isDark ? colors.border : BORDER }]}>
          <SectionLabel text="Add Someone New" />

          {/* Name */}
          <Text style={s.fieldLabel}>Name</Text>
          <TextInput
            value={name} onChangeText={setName}
            onBlur={() => setTouched(t => ({ ...t, name: true }))}
            placeholder="e.g. Emma" maxLength={60}
            placeholderTextColor={isDark ? colors.textTertiary : '#B0BAC9'}
            style={inputStyle(touched.name && nameError)}
          />
          {touched.name && nameError ? <Text style={[s.errText, { color: colors.danger }]}>{nameError}</Text> : null}

          {/* Role */}
          <Text style={[s.fieldLabel, { marginTop: 14 }]}>Role</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {ROLES.map(r => {
              const active = role === r.value;
              return (
                <TouchableOpacity
                  key={r.value}
                  onPress={() => { setRole(r.value); setRelationship(undefined); if (r.value !== 'senior') setLinkedParentId(undefined); }}
                  style={[s.chip, {
                    backgroundColor: active ? BLUE : inputBg,
                    borderColor: active ? BLUE : isDark ? colors.border : BORDER,
                  }]}
                >
                  <Text style={{ fontSize: 14 }}>{r.emoji}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#fff' : labelClr }}>{r.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Parent-side picker — only for grandparent/senior role */}
          {role === 'senior' && parentMembers.length > 0 && (
            <>
              <Text style={[s.fieldLabel, { marginTop: 14 }]}>
                Which parent's side? <Text style={{ fontWeight: '400', color: BODY_CLR }}>(optional)</Text>
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {parentMembers.map(p => {
                  const active = linkedParentId === p.id;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => setLinkedParentId(active ? undefined : p.id)}
                      style={[s.chip, {
                        backgroundColor: active ? BLUE : inputBg,
                        borderColor: active ? BLUE : isDark ? colors.border : BORDER,
                      }]}
                    >
                      <Text style={{ fontSize: 14 }}>{p.emoji ?? '👤'}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#fff' : labelClr }}>{p.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* Relationship */}
          {relationshipOptions.length > 0 && (
            <>
              <Text style={[s.fieldLabel, { marginTop: 14 }]}>
                Relationship <Text style={{ fontWeight: '400', color: BODY_CLR }}>(optional)</Text>
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {relationshipOptions.map(opt => {
                  const picked = relationship === opt;
                  return (
                    <TouchableOpacity
                      key={opt}
                      onPress={() => setRelationship(picked ? undefined : opt)}
                      style={[s.chip, {
                        backgroundColor: picked ? colors.teal : inputBg,
                        borderColor: picked ? colors.teal : isDark ? colors.border : BORDER,
                      }]}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '700', color: picked ? '#fff' : labelClr }}>{opt}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* Date of birth */}
          <Text style={[s.fieldLabel, { marginTop: 14 }]}>
            Date of birth <Text style={{ fontWeight: '400', color: BODY_CLR }}>(optional)</Text>
          </Text>
          <TouchableOpacity
            onPress={() => setShowDobPicker(v => !v)}
            style={[inputStyle(dobError ? dobError : undefined), { flexDirection: 'row', alignItems: 'center', gap: 8 }]}
          >
            <Calendar size={15} color={BODY_CLR} strokeWidth={1.8} />
            <Text style={{ fontSize: 15, color: dob ? labelClr : isDark ? colors.textTertiary : '#B0BAC9', flex: 1 }}>
              {dob ? fmtDate(localDateStr(dob)) : 'Tap to choose a date'}
            </Text>
          </TouchableOpacity>
          {dobError ? <Text style={[s.errText, { color: colors.danger }]}>{dobError}</Text> : null}
          {showDobPicker && (
            <View style={{ borderRadius: 14, borderWidth: 1, borderColor: isDark ? colors.border : BORDER, backgroundColor: cardBg, marginTop: 8 }}>
              <DateTimePicker
                value={dob ?? MAX_DOB} mode="date" display="spinner"
                minimumDate={MIN_DOB} maximumDate={MAX_DOB}
                onChange={(_e, d) => { if (d) setDob(d); }}
                textColor={labelClr}
                style={{ height: 180, width: '100%' }}
              />
              <TouchableOpacity onPress={() => setShowDobPicker(false)} style={{ alignSelf: 'flex-end', padding: 12 }}>
                <Text style={{ color: BLUE, fontWeight: '900', fontSize: 15 }}>Done</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Email */}
          <Text style={[s.fieldLabel, { marginTop: 14 }]}>
            Email <Text style={{ fontWeight: '400', color: BODY_CLR }}>(optional)</Text>
          </Text>
          <TextInput
            value={email} onChangeText={setEmail}
            onBlur={() => setTouched(t => ({ ...t, email: true }))}
            placeholder="e.g. emma@example.com"
            placeholderTextColor={isDark ? colors.textTertiary : '#B0BAC9'}
            autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
            style={inputStyle(touched.email && emailError)}
          />
          {touched.email && emailError ? <Text style={[s.errText, { color: colors.danger }]}>{emailError}</Text> : null}

          {/* Submit */}
          <TouchableOpacity
            onPress={handleAddMember}
            disabled={creating}
            activeOpacity={0.82}
            style={[s.addBtn, { backgroundColor: BLUE, opacity: creating ? 0.6 : 1, marginTop: 20 }]}
          >
            {creating
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>Add &amp; Generate Code</Text>}
          </TouchableOpacity>
        </View>

        {/* ── PENDING INVITES ───────────────────────────────────────── */}
        <View style={{ marginTop: 32 }}>
          <SectionLabel text={`Pending Invites (${pendingMembers.length})`} />

          {loadingInvites ? (
            <ActivityIndicator color={BLUE} style={{ marginVertical: 16 }} />
          ) : pendingMembers.length === 0 ? (
            <Text style={{ fontSize: 13, color: BODY_CLR, textAlign: 'center', paddingVertical: 12 }}>
              No pending invites — add someone above.
            </Text>
          ) : (
            <View style={{ gap: 10 }}>
              {pendingMembers.map(m => {
                const inv = invitesByMember[m.id];
                const isLive = inv && inv.status === 'pending';
                return (
                  <View key={m.id} style={[s.memberCard, { backgroundColor: cardBg, borderColor: isDark ? colors.border : BORDER }]}>
                    {/* Member row */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={{ fontSize: 22 }}>{(m as any).emoji ?? '👤'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: '800', color: labelClr }}>{m.name}</Text>
                        <Text style={{ fontSize: 12, color: BODY_CLR }}>
                          {m.relationship ?? m.role} · Not yet joined
                        </Text>
                      </View>
                    </View>

                    {/* Code + actions */}
                    {isLive ? (
                      <View style={{ marginTop: 12, gap: 8 }}>
                        <View style={[s.codeBox, { backgroundColor: isDark ? colors.surface : '#EEF2FC', borderColor: BLUE + '30' }]}>
                          <Text style={{ fontSize: 20, fontWeight: '900', letterSpacing: 4, color: labelClr }}>{inv.code}</Text>
                          <Text style={{ fontSize: 11, color: BODY_CLR }}>{fmtExpiry(inv.expires_at)}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TouchableOpacity
                            onPress={() => copyCode(m.id, inv.code)}
                            style={[s.actionBtn, { flex: 1, borderColor: isDark ? colors.border : BORDER, backgroundColor: inputBg }]}
                          >
                            {copiedId === m.id
                              ? <Check size={14} color={colors.success} strokeWidth={2.5} />
                              : <Copy size={14} color={labelClr} strokeWidth={1.8} />}
                            <Text style={{ fontSize: 12, fontWeight: '700', color: labelClr, marginLeft: 5 }}>
                              {copiedId === m.id ? 'Copied' : 'Copy'}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => shareCode(m.name, inv.code)}
                            style={[s.actionBtn, { flex: 1, borderColor: isDark ? colors.border : BORDER, backgroundColor: inputBg }]}
                          >
                            <Share2 size={14} color={labelClr} strokeWidth={1.8} />
                            <Text style={{ fontSize: 12, fontWeight: '700', color: labelClr, marginLeft: 5 }}>Share</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => generateCodeFor(m.id)}
                            disabled={regenerating === m.id}
                            style={[s.actionBtn, { flex: 1, borderColor: isDark ? colors.border : BORDER, backgroundColor: inputBg }]}
                          >
                            {regenerating === m.id
                              ? <ActivityIndicator size="small" color={labelClr} />
                              : <>
                                  <RefreshCw size={14} color={labelClr} strokeWidth={1.8} />
                                  <Text style={{ fontSize: 12, fontWeight: '700', color: labelClr, marginLeft: 5 }}>New Code</Text>
                                </>}
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={() => generateCodeFor(m.id)}
                        disabled={regenerating === m.id}
                        style={[s.addBtn, { backgroundColor: BLUE, opacity: regenerating === m.id ? 0.6 : 1, marginTop: 12 }]}
                      >
                        {regenerating === m.id
                          ? <ActivityIndicator color="#fff" />
                          : <>
                              <Key size={14} color="#fff" strokeWidth={2} />
                              <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff', marginLeft: 6 }}>
                                {inv?.status === 'expired' ? 'Generate New Code' : 'Generate Code'}
                              </Text>
                            </>}
                      </TouchableOpacity>
                    )}

                    {/* Inline code status */}
                    {codeStatus?.memberId === m.id && (
                      <View style={{ marginTop: 8, padding: 10, borderRadius: 10,
                        backgroundColor: codeStatus.kind === 'error' ? colors.danger + '15' : '#DDF5EC' }}>
                        <Text style={{ fontSize: 12, color: codeStatus.kind === 'error' ? colors.danger : '#1A6B45', lineHeight: 17 }}>
                          {codeStatus.text}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* ── ALREADY JOINED ───────────────────────────────────────── */}
        {joinedMembers.length > 0 && (
          <View style={{ marginTop: 32 }}>
            <SectionLabel text={`Already Joined (${joinedMembers.length})`} />
            <View style={{ gap: 6 }}>
              {joinedMembers.map(m => (
                <View key={m.id} style={[s.joinedRow, {
                  backgroundColor: isDark ? colors.surface : '#F0FAF5',
                  borderColor: colors.success + '30',
                }]}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 12, color: '#fff', fontWeight: '900' }}>✓</Text>
                  </View>
                  <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: labelClr }}>{m.name}</Text>
                  <Text style={{ fontSize: 11, color: BODY_CLR }}>{m.relationship ?? m.role}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 22, borderWidth: 1, padding: 20,
  },
  memberCard: {
    borderRadius: 18, borderWidth: 1, padding: 16,
  },
  fieldLabel: {
    fontSize: 13, color: BODY_CLR, marginBottom: 8,
  },
  input: {
    borderWidth: 1.5, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 11, fontSize: 15,
  },
  errText: {
    fontSize: 12, fontWeight: '500', marginTop: 4,
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 9,
    borderRadius: 10, borderWidth: 1,
  },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 50, borderRadius: 14,
  },
  codeBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11,
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 36, borderRadius: 10, borderWidth: 1,
  },
  joinedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10,
    borderWidth: 1,
  },
});
