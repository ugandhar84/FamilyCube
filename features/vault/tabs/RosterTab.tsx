import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator,
  Modal, ScrollView, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import Svg, { Path, Circle, Rect, Polyline, Line } from 'react-native-svg';
import { Users, Mail } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useFamilyStore, MemberRole, RELATIONSHIPS_BY_ROLE } from '@/store/familyStore';
import { useFeatureFlag } from '@/lib/featureFlags';
import { SCard, CardHeader, MemberAvatar, StatusPill, BRAND } from './shared';
import { FamilyTreeView } from './FamilyTreeView';
import { MemberProfileSheet } from './MemberProfileSheet';
import { saveMemberEdit } from './memberActions';

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

// Exported so Profile's own member carousel (features/profile/
// ProfileSettingsScreen.tsx) can reuse the exact same PIN/edit flows
// instead of duplicating ~250 lines of near-identical modal — both screens
// ultimately just call updateMember/removeMember, no Roster-local state
// dependency to untangle.
export function PinModal({ member, onClose, onSave, colors, isDark }: {
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

export function EditMemberModal({ member, allMembers, onClose, onSave, onLinkParent, onDelete, onToggleStoreReminders, colors, isDark }: {
  member: any; allMembers: any[]; onClose: () => void;
  onSave: (memberId: string, name: string, role: string, hasCar: boolean, rideEarnings: number, groceryEarnings: number, subRole?: string, relationship?: string) => Promise<void>;
  onLinkParent: (memberId: string, parentId: string) => void;
  onDelete: (memberId: string) => Promise<void>;
  // Store proximity reminders (store_proximity_reminders feature flag) —
  // a self-service opt-out, same direct-to-store pattern as onLinkParent
  // rather than threading a 9th positional arg through onSave.
  onToggleStoreReminders: (memberId: string, enabled: boolean) => void;
  colors: any; isDark: boolean;
}) {
  const [name, setName]   = useState(member.name ?? '');
  // member.role is this app's own MemberRole vocabulary ('kid'/'teen'),
  // but the chips below use 'child'/'teenager' — without this translation
  // no chip would ever show as selected for an existing kid or teen member.
  const initialRole = member.role === 'kid' ? 'child' : member.role === 'teen' ? 'teenager' : (member.role ?? 'child');
  const [role, setRole]   = useState(initialRole);
  // Defaults true for parents (most can drive; teens/GPs opt in explicitly) —
  // drives whether this member shows up as pickable in ride reassignment and
  // the GP/Teen open-pool claim lists.
  const [hasCar, setHasCar] = useState(member.hasCar ?? (initialRole === 'parent'));
  const [rideEarnings, setRideEarnings] = useState(String(member.rideEarningsPerRun ?? 50));
  const [groceryEarnings, setGroceryEarnings] = useState(String(member.groceryEarningsPerRun ?? 30));
  // Unlike the other fields above, this was reading member.linkedParentId
  // (the prop) directly at render time instead of local state — the prop
  // is a snapshot captured when the modal opened and never changes while
  // it's open, so onLinkParent was correctly updating the real store
  // underneath, but the pill's own highlight never reflected the tap.
  const [linkedParentId, setLinkedParentId] = useState(member.linkedParentId as string | undefined);
  // How this senior is addressed by the household — "Grandma"/"Grandpa" —
  // derived relationally everywhere it's displayed (see lib/format.ts's
  // relationalName), disambiguated by first name if two seniors share it.
  const [subRole, setSubRole] = useState(member.subRole as string | undefined);
  // Purely descriptive — how this member relates to the family (Mother,
  // Stepson, Grandmother, etc). Never gates anything; `role` alone drives
  // permissions. Resets when the role chip changes so a stale option from
  // a different role's list can't linger (e.g. "Grandmother" surviving a
  // switch from senior to parent).
  const [relationship, setRelationship] = useState(member.relationship as string | undefined);
  const [storeRemindersEnabled, setStoreRemindersEnabled] = useState(member.storeProximityRemindersEnabled ?? true);
  const storeGeofencingFlag = useFeatureFlag('store_proximity_reminders');
  const [saving, setSaving] = useState(false);
  const parentOptions = allMembers.filter(m => m.role === 'parent');

  const ROLES = ['parent', 'child', 'teenager', 'senior'];
  // EditMemberModal's role chips use 'child'/'teenager' (not this app's
  // MemberRole vocabulary) — translate before looking up the relationship
  // options list, which is keyed by the real MemberRole.
  const roleForRelationships: MemberRole = role === 'child' ? 'kid' : role === 'teenager' ? 'teen' : (role as MemberRole);
  const relationshipOptions = RELATIONSHIPS_BY_ROLE[roleForRelationships] ?? [];

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
              <TouchableOpacity key={r} onPress={() => {
                setRole(r);
                // A relationship option only makes sense for the role it was
                // listed under — e.g. "Grandmother" shouldn't survive a
                // switch to "parent". Clear it if it's no longer valid so
                // Save never silently persists a mismatched label.
                const nextRole: MemberRole = r === 'child' ? 'kid' : r === 'teenager' ? 'teen' : (r as MemberRole);
                if (relationship && !RELATIONSHIPS_BY_ROLE[nextRole]?.includes(relationship)) {
                  setRelationship(undefined);
                }
              }}
                style={[p.roleChip, {
                  backgroundColor: role === r ? BRAND.purple : 'transparent',
                  borderColor: role === r ? BRAND.purple : colors.border,
                }]}>
                <Text style={{ fontSize: 13, fontWeight: '700', textTransform: 'capitalize',
                  color: role === r ? '#fff' : colors.textSecondary }}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Relationship — purely descriptive (shown on the tree/roster
              card), scoped to options that make sense for the selected
              role. Never gates permissions; role alone does that. */}
          <Text style={[p.label, { color: colors.textSecondary, marginTop: 12 }]}>Relationship</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            {relationshipOptions.map(opt => {
              const picked = relationship === opt;
              return (
                <TouchableOpacity key={opt} onPress={() => setRelationship(picked ? undefined : opt)}
                  style={[p.roleChip, {
                    backgroundColor: picked ? BRAND.teal : 'transparent',
                    borderColor: picked ? BRAND.teal : colors.border,
                  }]}>
                  <Text style={{ fontSize: 13, fontWeight: '700',
                    color: picked ? '#fff' : colors.textSecondary }}>{opt}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Can Drive — controls whether this member shows up as pickable in
              ride reassignment (InlineReassignPanel). Seniors already have
              their own self-service "cheerleader mode" toggle in-Hub for the
              same concept, so this doesn't duplicate it for them here. */}
          {(role === 'parent' || role === 'teenager') && (
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
                    Can Drive
                  </Text>
                </View>
                <View style={{ width: 38, height: 22, borderRadius: 11,
                  backgroundColor: hasCar ? BRAND.amber : colors.border,
                  justifyContent: 'center', paddingHorizontal: 2 }}>
                  <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff',
                    alignSelf: hasCar ? 'flex-end' : 'flex-start' }} />
                </View>
              </TouchableOpacity>
              {role === 'teenager' && (
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
              )}
            </View>
          )}

          {/* Senior-specific: which parent this GP belongs to — same field
              a GP can set for themselves under "Quests I Sponsor", now also
              editable by a parent directly from the roster/tree while
              looking at that GP, since long-pressing a member here is the
              other natural place someone would expect to fix this. */}
          {role === 'senior' && parentOptions.length > 1 && (
            <View style={{ marginTop: 14 }}>
              <Text style={[p.label, { color: colors.textSecondary }]}>Whose parent?</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
                {parentOptions.map(par => {
                  const picked = linkedParentId === par.id;
                  return (
                    <TouchableOpacity key={par.id} onPress={() => { setLinkedParentId(par.id); onLinkParent(member.id, par.id); }}
                      style={[p.roleChip, {
                        backgroundColor: picked ? BRAND.blue : 'transparent',
                        borderColor: picked ? BRAND.blue : colors.border,
                      }]}>
                      <Text style={{ fontSize: 13, fontWeight: '700',
                        color: picked ? '#fff' : colors.textSecondary }}>{par.name.split(' ')[0]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* How the kids address them — shown everywhere in place of their
              first name (e.g. "Accompanied by Grandma"), disambiguated by
              first name automatically if a second Grandma/Grandpa exists. */}
          {role === 'senior' && (
            <View style={{ marginTop: 14 }}>
              <Text style={[p.label, { color: colors.textSecondary }]}>What do the kids call them?</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
                {['Grandma', 'Grandpa'].map(opt => {
                  const picked = subRole === opt;
                  return (
                    <TouchableOpacity key={opt} onPress={() => setSubRole(picked ? undefined : opt)}
                      style={[p.roleChip, {
                        backgroundColor: picked ? BRAND.purple : 'transparent',
                        borderColor: picked ? BRAND.purple : colors.border,
                      }]}>
                      <Text style={{ fontSize: 13, fontWeight: '700',
                        color: picked ? '#fff' : colors.textSecondary }}>{opt}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Store proximity reminders — self-service opt-out for the
              geofenced "you're near X, items pending" notification. Only
              shown at all while the feature flag is on; a member who never
              sees this setting simply never gets the reminder either
              (registerStoreGeofences no-ops on the flag). */}
          {storeGeofencingFlag && (
            <TouchableOpacity
              onPress={() => {
                const next = !storeRemindersEnabled;
                setStoreRemindersEnabled(next);
                onToggleStoreReminders(member.id, next);
              }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                marginTop: 14, padding: 12, borderRadius: 12, borderWidth: 1.5,
                borderColor: storeRemindersEnabled ? BRAND.teal : colors.border,
                backgroundColor: storeRemindersEnabled ? BRAND.teal + '12' : 'transparent' }}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: storeRemindersEnabled ? BRAND.teal : colors.textPrimary }}>
                  Store proximity reminders
                </Text>
                <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
                  Notify when near a pinned store with pending items
                </Text>
              </View>
              <View style={{ width: 38, height: 22, borderRadius: 11,
                backgroundColor: storeRemindersEnabled ? BRAND.teal : colors.border,
                justifyContent: 'center', paddingHorizontal: 2 }}>
                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff',
                  alignSelf: storeRemindersEnabled ? 'flex-end' : 'flex-start' }} />
              </View>
            </TouchableOpacity>
          )}

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
            <TouchableOpacity onPress={onClose} style={[p.cancelBtn, { borderColor: colors.border }]}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={async () => {
                setSaving(true);
                await onSave(member.id, name, role, hasCar, parseInt(rideEarnings) || 50, parseInt(groceryEarnings) || 30, subRole, relationship);
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
                `${member.name} will be removed from your family right away. Their profile is kept for 7 days in case you change your mind — switching back to them with their PIN restores everything. After 7 days it's permanently deleted.`,
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
  const { members: allMembers, activeMemberId, updateMember, removeMember } = useFamilyStore();
  // Soft-deleted members (Roster's own "Remove" below, or a self-deleted
  // account via Profile's danger zone) stay in the store — restorable via
  // PIN re-entry within 7 days (familyStore.setActiveMember) — but drop out
  // of every member-facing list here so a "removed" person doesn't keep
  // showing up in the family tree as if nothing happened.
  const members = allMembers.filter(m => !m.deletedAt);
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
  const [pinTarget, setPinTarget] = useState<any | null>(null);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [viewTarget, setViewTarget] = useState<any | null>(null);
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

  const copyCode = (code: string) => {
    // Clipboard.setStringAsync not available without expo-clipboard; show as copied visually
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

  const saveMember = async (memberId: string, name: string, role: string, hasCar: boolean, rideEarningsPerRun: number, groceryEarningsPerRun: number, subRole?: string, relationship?: string) => {
    const { error } = await saveMemberEdit(updateMember, memberId, name, role, hasCar, rideEarningsPerRun, groceryEarningsPerRun, subRole, relationship);
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
          onView={setViewTarget} onEdit={setEditTarget} onPin={setPinTarget}
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

      {/* Modals */}
      {pinTarget && (
        <PinModal member={pinTarget} onClose={() => setPinTarget(null)}
          onSave={savePin} colors={colors} isDark={isDark} />
      )}
      {editTarget && (
        <EditMemberModal member={editTarget} allMembers={members} onClose={() => setEditTarget(null)}
          onSave={saveMember} onLinkParent={(id, parentId) => updateMember(id, { linkedParentId: parentId })}
          onToggleStoreReminders={(id, enabled) => updateMember(id, { storeProximityRemindersEnabled: enabled })}
          onDelete={deleteMember} colors={colors} isDark={isDark} />
      )}
      {viewTarget && (
        <MemberProfileSheet member={viewTarget} siblings={members.map(m => m.name)}
          visible onClose={() => setViewTarget(null)} colors={colors} isDark={isDark} />
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
