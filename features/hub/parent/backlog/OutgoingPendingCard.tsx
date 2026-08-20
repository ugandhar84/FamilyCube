import { useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { ChevronUp, ChevronDown, Clock, Undo2 } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import type { ChoreTask, ParentQuestAssignment } from '@/store/choreStore';
import type { FamilyMember } from '@/store/familyStore';

// A task I delegated that's still waiting on the other parent. Still
// PENDING (not yet accepted/bounced) gets a Recall action — the delegator
// can always take a still-open delegation back, per spec 1.3/6.5; once
// bounced/accepted there's a live negotiation or commitment in progress,
// so recall isn't offered (reassign via DelegateSheet is the equivalent
// action for those states).
export function OutgoingPendingCard({ a, chore, members, colors, isDark, onRecall }: {
  a: ParentQuestAssignment; chore: ChoreTask; members: FamilyMember[]; colors: any; isDark: boolean;
  onRecall?: () => void;
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
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, padding: 12, paddingBottom: onRecall ? 0 : 12 }}>
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{chore.description}</Text>
        </View>
      )}
      {onRecall && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 12, paddingTop: isExp && chore.description ? 8 : 0 }}>
          <Pressable
            onPress={() => Alert.alert(
              'Take this back?',
              `"${chore.title}" will be un-delegated and assigned back to you. ${assignee?.name?.split(' ')[0] ?? 'They'} will be notified.`,
              [{ text: 'Cancel', style: 'cancel' }, { text: 'Recall', onPress: onRecall }],
            )}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingVertical: 8 }}>
            <Undo2 size={13} color={colors.textSecondary} />
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>Recall</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
