/**
 * MemberProfileSheet — read-only profile view, opened by tapping a card in
 * FamilyTreeView. Shows whatever's actually meaningful for the member's
 * role from real app data (no invented bio/traits/birthday fields) — kids
 * get coins/XP/streak, teens add can-drive + earnings, seniors show their
 * drive-window preferences. Editing stays a separate long-press action for
 * parents (EditMemberModal), so this is purely informational.
 */
import { View, Text } from 'react-native';
import AppBottomSheet from '@/components/AppBottomSheet';
import FamilyAvatar from '@/components/FamilyAvatar';
import { Coins, Flame, Star, Car, Clock, Lock } from 'lucide-react-native';
import { fmtTime } from '@/lib/dates';
import { roleColor } from './MemberCard';
import type { FamilyMember } from '@/store/familyStore';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function StatTile({ Icon, label, value, colors, accent }: { Icon: any; label: string; value: string; colors: any; accent: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 4, borderRadius: 14, borderWidth: 1,
      borderColor: colors.border, backgroundColor: colors.surface, paddingVertical: 12 }}>
      <Icon size={16} color={accent} />
      <Text style={{ fontSize: 15, fontWeight: '900', color: colors.textPrimary }}>{value}</Text>
      <Text style={{ fontSize: 9, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase' }}>{label}</Text>
    </View>
  );
}

export function MemberProfileSheet({ member, siblings, visible, onClose, colors, isDark }: {
  member: FamilyMember; siblings: string[]; visible: boolean; onClose: () => void;
  colors: any; isDark: boolean;
}) {
  const rc = roleColor(member.role);
  const isKidOrTeen = member.role === 'kid' || member.role === 'teen';
  const roleLabel = member.role === 'senior' ? 'Grandparent' : member.role.charAt(0).toUpperCase() + member.role.slice(1);

  return (
    <AppBottomSheet visible={visible} onClose={onClose}
      title={member.name} subtitle={member.relationship ?? roleLabel} accentColor={rc}
      minHeight="40%" maxHeight="70%">
      <View style={{ alignItems: 'center', marginBottom: 16 }}>
        <FamilyAvatar name={member.name} emoji={member.emoji} avatarUrl={member.avatarUrl}
          siblings={siblings} size={72} ringColor={rc} ringWidth={2.5} />
      </View>

      {isKidOrTeen && (
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          <StatTile Icon={Coins} label="Coins" value={String(member.coins)} colors={colors} accent={colors.amber} />
          <StatTile Icon={Star} label="Level" value={String(member.level)} colors={colors} accent={rc} />
          <StatTile Icon={Flame} label="Streak" value={`${member.streak}d`} colors={colors} accent={colors.danger} />
        </View>
      )}

      {member.role === 'teen' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
          borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
          padding: 12, marginBottom: 12 }}>
          <Car size={16} color={member.hasCar ? colors.amber : colors.textTertiary} />
          <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>
            {member.hasCar ? 'Can drive — in the ride/pickup pool' : 'Not driving yet'}
          </Text>
        </View>
      )}

      {member.role === 'senior' && (
        <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
          padding: 12, marginBottom: 12, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Clock size={14} color={colors.textSecondary} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textPrimary }}>
              {member.gpCheerleaderMode
                ? 'Cheerleader mode — not available to drive'
                : `Available ${fmtTime(member.gpDriveWindowStart)}–${fmtTime(member.gpDriveWindowEnd)}`}
            </Text>
          </View>
          {!member.gpCheerleaderMode && member.gpDriveWindowDays?.length ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginLeft: 22 }}>
              {[...member.gpDriveWindowDays].sort((a, b) => a - b).map(d => (
                <View key={d} style={{ borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
                  backgroundColor: rc + '14', borderWidth: 1, borderColor: rc + '30' }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: rc }}>{DAY_SHORT[d]}</Text>
                </View>
              ))}
              {member.gpWeeklyRideCap ? (
                <Text style={{ fontSize: 11, color: colors.textSecondary, marginLeft: 2 }}>
                  · up to {member.gpWeeklyRideCap}/week
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
        borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
        padding: 12 }}>
        <Lock size={14} color={member.pin ? colors.success : colors.textTertiary} />
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textPrimary }}>
          {member.pin ? 'PIN set' : 'No PIN set'}
        </Text>
      </View>
    </AppBottomSheet>
  );
}
