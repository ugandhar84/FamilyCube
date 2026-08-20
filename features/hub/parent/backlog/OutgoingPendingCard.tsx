import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { ChevronUp, ChevronDown, Clock } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import type { ChoreTask, ParentQuestAssignment } from '@/store/choreStore';
import type { FamilyMember } from '@/store/familyStore';

// A task I delegated that's still waiting on the other parent — no actions
// here (nothing for the assigner to do but wait, or nudge via the assigned
// card elsewhere), just visibility, since previously this state had none
// at all: the assigner had no way to tell "I assigned this" from "nothing
// happened yet."
export function OutgoingPendingCard({ a, chore, members, colors, isDark }: {
  a: ParentQuestAssignment; chore: ChoreTask; members: FamilyMember[]; colors: any; isDark: boolean;
}) {
  const [isExp, setExp] = useState(false);
  const assignee = members.find(m => m.id === a.assignedTo);
  const isSnoozed = a.status === 'SNOOZED' && a.snoozeUntil && a.snoozeUntil > new Date().toISOString();
  const isBounced = a.status === 'PARKED';

  return (
    <View style={{
      borderRadius: 14, borderWidth: 1, borderColor: isDark ? colors.border : 'rgba(225,218,203,0.7)',
      backgroundColor: isDark ? colors.card : '#FFFFFF', overflow: 'hidden',
      borderLeftWidth: 3, borderLeftColor: colors.textTertiary,
      shadowColor: isDark ? '#000' : 'rgba(80,60,40,0.10)',
      shadowOpacity: isDark ? 0.4 : 1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
      elevation: isDark ? 3 : 2,
    }}>
      <Pressable onPress={() => setExp(e => !e)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 }}>
        <Clock size={14} color={colors.textTertiary} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{chore.title}</Text>
          <Text style={{ fontSize: TYPO.label, color: isBounced ? colors.danger : colors.textTertiary, marginTop: 2 }}>
            {isBounced
              ? `${assignee?.name ?? 'Partner'} pushed back — waiting on your response`
              : isSnoozed
                ? `Snoozed by ${assignee?.name ?? 'partner'} — waiting`
                : `Waiting on ${assignee?.name ?? 'partner'} to accept`}
          </Text>
          {isBounced && a.pushbackDetails ? (
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2, fontStyle: 'italic' }} numberOfLines={isExp ? undefined : 1}>
              "{a.pushbackDetails}"
            </Text>
          ) : null}
        </View>
        {isExp ? <ChevronUp size={14} color={colors.textTertiary} /> : <ChevronDown size={14} color={colors.textTertiary} />}
      </Pressable>
      {isExp && chore.description && (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, padding: 12 }}>
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{chore.description}</Text>
        </View>
      )}
    </View>
  );
}
