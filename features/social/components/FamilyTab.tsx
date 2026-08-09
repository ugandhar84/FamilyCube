import React, { useState } from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { showAlert } from '@/components/AppAlert';
import { EmojiAvatar } from '@/features/social/components/EmojiAvatar';
import { fm, md } from '@/features/social/socialStyles';
import { safeFmt } from '@/lib/dates';
import { FamilyMember } from '@/features/social/types';

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  created_at: string;
}

interface Perms {
  canManageFamily: boolean;
  [key: string]: any;
}

interface FamilyTabProps {
  ac: string;
  colors: any;
  pet: any;
  profile: any;
  family: FamilyMember[];
  pendingInvites: PendingInvite[];
  perms: Perms;
  changingRoleId: string | null;
  onInvite: () => void;
  onChangeRole: (m: FamilyMember) => void;
  onRemoveFamily: (m: FamilyMember) => void;
  onCancelInvite: (inv: PendingInvite) => void;
}

export const FamilyTab = React.memo(function FamilyTab({
  ac, colors, pet, profile, family, pendingInvites, perms,
  changingRoleId, onInvite, onChangeRole, onRemoveFamily, onCancelInvite,
}: FamilyTabProps) {
  const [showPermissions, setShowPermissions] = useState(false);

  return (
    <>
      <View style={[fm.banner, { backgroundColor: `${ac}0E`, borderColor: `${ac}22` }]}>
        <View style={[fm.bannerIcon, { backgroundColor: `${ac}18` }]}>
          <Ionicons name="people-outline" size={24} color={ac} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[fm.bannerTitle, { color: colors.textPrimary }]}>{pet?.name}'s Care Family</Text>
          <Text style={[fm.bannerSub, { color: colors.textSecondary }]}>
            {family.length + 1} {family.length + 1 === 1 ? 'person' : 'people'} caring together
          </Text>
        </View>
        {perms.canManageFamily && (
          <TouchableOpacity onPress={onInvite} style={[fm.inviteBtn, { backgroundColor: ac }]}>
            <Ionicons name="person-add-outline" size={13} color="#fff" />
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#fff' }}>Invite</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={[fm.sectionLabel, { color: colors.textSecondary }]}>MEMBERS</Text>
      <View style={[fm.membersCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={fm.memberRow}>
          <EmojiAvatar emoji={pet?.emoji} name={profile?.full_name ?? 'You'} size={44} color={ac} avatarUrl={pet?.avatar_url} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[fm.memberName, { color: colors.textPrimary }]}>{profile?.handle ? `@${profile.handle}` : 'You'}</Text>
            <Text style={[fm.memberSince, { color: colors.textSecondary }]}>Account owner</Text>
          </View>
          <View style={[fm.roleBadge, { backgroundColor: `${ac}14`, borderColor: `${ac}28` }]}>
            <Ionicons name="shield-checkmark-outline" size={11} color={ac} />
            <Text style={[fm.roleText, { color: ac }]}>Owner</Text>
          </View>
        </View>
        {family.map((m) => {
          const mColor = m.role === 'caretaker' ? colors.accent : m.role === 'caregiver' ? '#FF8C55' : colors.textSecondary;
          return (
            <TouchableOpacity key={m.id} activeOpacity={0.7}
              onPress={() => !perms.canManageFamily ? undefined : showAlert(
                m.profiles?.handle ? `@${m.profiles.handle}` : 'Member',
                `Role: ${m.role}`,
                [
                  { text: 'Change role', onPress: () => onChangeRole(m) },
                  { text: 'Remove from family', style: 'destructive', onPress: () => onRemoveFamily(m) },
                  { text: 'Cancel', style: 'cancel' },
                ]
              )}
              style={[fm.memberRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
              <EmojiAvatar name={m.profiles?.handle ?? 'Member'} size={44} color={mColor} avatarUrl={m.profiles?.avatar_url} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[fm.memberName, { color: colors.textPrimary }]}>{m.profiles?.handle ? `@${m.profiles.handle}` : 'Member'}</Text>
                <Text style={[fm.memberSince, { color: colors.textSecondary }]}>
                  Joined {safeFmt(m.joined_at, 'MMM d, yyyy')}
                </Text>
              </View>
              {changingRoleId === m.id
                ? <View style={{ width: 20, height: 20 }} />
                : <View style={[fm.roleBadge, { backgroundColor: `${mColor}12`, borderColor: `${mColor}25` }]}>
                    <Text style={[fm.roleText, { color: mColor, textTransform: 'capitalize' }]}>{m.role}</Text>
                  </View>
              }
            </TouchableOpacity>
          );
        })}
        {family.length === 0 && (
          <View style={{ paddingVertical: 22, alignItems: 'center', gap: 8 }}>
            <Ionicons name="person-add-outline" size={28} color={colors.textTertiary} />
            <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textPrimary }}>No members yet</Text>
            <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 18 }}>
              Invite family or friends to help care for {pet?.name ?? 'your pet'}
            </Text>
          </View>
        )}
      </View>

      {pendingInvites.length > 0 && (
        <>
          <Text style={[fm.sectionLabel, { color: colors.textSecondary, marginTop: 20 }]}>PENDING INVITATIONS</Text>
          <View style={[fm.membersCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {pendingInvites.map((inv, idx) => (
              <View key={inv.id} style={[fm.memberRow, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                <View style={[md.roleIcon2, { backgroundColor: `${colors.textTertiary}12` }]}>
                  <Ionicons name="mail-outline" size={18} color={colors.textTertiary} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[fm.memberName, { color: colors.textPrimary }]}>{inv.email}</Text>
                  <Text style={[fm.memberSince, { color: colors.textSecondary }]}>
                    Sent {safeFmt(inv.created_at, 'MMM d')} · awaiting response
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={[fm.roleBadge, { backgroundColor: `${colors.textTertiary}10`, borderColor: `${colors.textTertiary}20` }]}>
                    <Text style={[fm.roleText, { color: colors.textSecondary, textTransform: 'capitalize' }]}>{inv.role}</Text>
                  </View>
                  <TouchableOpacity onPress={() => onCancelInvite(inv)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle-outline" size={20} color={colors.danger ?? '#E24B4A'} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      <TouchableOpacity
        onPress={() => setShowPermissions(s => !s)}
        style={{ marginTop: 20, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name={showPermissions ? 'chevron-down' : 'chevron-forward'} size={18} color={colors.textTertiary} />
        <Text style={[fm.sectionLabel, { color: colors.textSecondary }]}>ROLE PERMISSIONS</Text>
      </TouchableOpacity>

      {showPermissions && (
        <>
          {([
            { role: 'Owner', color: ac, icon: 'shield-checkmark' as const,
              caps: [{ label: 'Mood scans', ok: true }, { label: 'Daily care', ok: true }, { label: 'Health & medical', ok: true }, { label: 'Post updates', ok: true }, { label: 'Manage family', ok: true }, { label: 'Edit pet profile', ok: true }] },
            { role: 'Caretaker', color: '#7C5CBF', icon: 'medkit-outline' as const,
              caps: [{ label: 'Mood scans', ok: true }, { label: 'Daily care', ok: true }, { label: 'Health & medical', ok: true }, { label: 'Post updates', ok: true }, { label: 'Manage family', ok: false }, { label: 'Edit pet profile', ok: false }] },
            { role: 'Caregiver', color: '#FF8C55', icon: 'heart-outline' as const,
              caps: [{ label: 'Mood scans', ok: true }, { label: 'Daily care', ok: true }, { label: 'Health & medical', ok: false }, { label: 'Post updates', ok: false }, { label: 'Manage family', ok: false }, { label: 'Edit pet profile', ok: false }] },
            { role: 'Viewer', color: colors.textSecondary, icon: 'eye-outline' as const,
              caps: [{ label: 'Mood scans', ok: false }, { label: 'Daily care', ok: false }, { label: 'Health & medical', ok: false }, { label: 'Post updates', ok: false }, { label: 'Manage family', ok: false }, { label: 'Edit pet profile', ok: false }] },
          ] as const).map(r => (
            <View key={r.role} style={[fm.permCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[fm.permIconWrap, { backgroundColor: `${r.color}18` }]}>
                <Ionicons name={r.icon} size={16} color={r.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[fm.permRole, { color: r.color }]}>{r.role}</Text>
                <View style={fm.permGrid}>
                  {r.caps.map(c => (
                    <View key={c.label} style={fm.permItem}>
                      <Ionicons name={c.ok ? 'checkmark-circle' : 'close-circle'} size={13}
                        color={c.ok ? '#16A34A' : colors.textTertiary} />
                      <Text style={[fm.permLabel, { color: c.ok ? colors.textPrimary : colors.textTertiary }]}>
                        {c.label}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          ))}
        </>
      )}
      <View style={{ height: 16 }} />
    </>
  );
});
