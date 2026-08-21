import { View, Text } from 'react-native';
import { Car } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { eventAssignee } from '@/store/eventStore';
import type { FamilyEvent } from '@/store/eventStore';
import type { FamilyMember } from '@/store/familyStore';

// A co-parent's ride still finding a driver — deliberately read-only
// (no claim/assign action). Offering an action here would let a third
// surface race the same claim two GPs/teens already have their own
// compare-and-swap protection for; this is purely "so you know," not
// another place to act.
export function RideCoordinationRow({ ev, members, colors, isDark }: {
  ev: FamilyEvent; members: FamilyMember[]; colors: any; isDark: boolean;
}) {
  const creator = members.find(m => m.id === ev.createdBy);
  const assignee = eventAssignee(ev);
  const status = !assignee.name
    ? 'Open to helpers — nobody has claimed it yet'
    : `${assignee.name.split(' ')[0]} claimed it, awaiting confirmation`;

  return (
    <View style={{ borderRadius: 12, borderWidth: 1, borderColor: isDark ? colors.border : '#E2E8F0',
      backgroundColor: isDark ? colors.surface : '#F8FAFC', padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Car size={13} color={colors.textTertiary} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>
          {ev.title}{creator ? ` · ${creator.name.split(' ')[0]}'s request` : ''}
        </Text>
        <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 1 }} numberOfLines={1}>
          {status}
        </Text>
      </View>
    </View>
  );
}
