import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { ChevronUp, ChevronDown, Check, MessageCircle } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import type { ChoreTask, ParentQuestAssignment } from '@/store/choreStore';
import type { FamilyMember } from '@/store/familyStore';

// Money-green — "Accept" action accent, distinct from brand amber used
// elsewhere in this card. Not colors.success (which IS brand teal in this
// app) — kept as one local constant.
const MONEY_GREEN = '#10B981';

// A co-parent directly assigned this to you — accept it, or push back
// (snooze / blocker / trade / discuss) via the pushback sheet.
export function DirectPendingCard({ a, chore, members, colors, isDark, respondToParentQuest, onRespond }: {
  a: ParentQuestAssignment; chore: ChoreTask; members: FamilyMember[]; colors: any; isDark: boolean;
  respondToParentQuest: (id: string, response: { action: 'ACCEPT' }) => void;
  onRespond: (assignmentId: string, choreTitle: string) => void;
}) {
  const [isExp, setExp] = useState(false);
  const assigner = members.find(m => m.id === a.assignedBy);

  return (
    <View style={{
      borderRadius: 14, borderWidth: 1, borderColor: isDark ? colors.border : 'rgba(225,218,203,0.7)',
      backgroundColor: isDark ? colors.card : '#FFFFFF', overflow: 'hidden',
      borderLeftWidth: 3, borderLeftColor: colors.warning,
      shadowColor: isDark ? '#000' : 'rgba(80,60,40,0.10)',
      shadowOpacity: isDark ? 0.4 : 1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
      elevation: isDark ? 3 : 2,
    }}>
      <Pressable onPress={() => setExp(e => !e)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, paddingBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{chore.title}</Text>
          <Text style={{ fontSize: TYPO.label, color: colors.warning, marginTop: 2 }}>
            From {assigner?.name ?? 'Partner'}
          </Text>
        </View>
        {isExp ? <ChevronUp size={14} color={colors.textTertiary} /> : <ChevronDown size={14} color={colors.textTertiary} />}
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 12 }}>
        <Pressable onPress={() => respondToParentQuest(a.id, { action: 'ACCEPT' })}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
            backgroundColor: MONEY_GREEN, borderRadius: 10, paddingVertical: 8 }}>
          <Check size={14} color="#fff" />
          <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>Accept</Text>
        </Pressable>
        <Pressable onPress={() => onRespond(a.id, chore.title)}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
            borderWidth: 1.5, borderColor: colors.warning + '60',
            borderRadius: 10, paddingVertical: 8 }}>
          <MessageCircle size={14} color={colors.warning} />
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.warning }}>Respond</Text>
        </Pressable>
      </View>
      {isExp && chore.description && (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.warning + '30', padding: 12 }}>
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{chore.description}</Text>
        </View>
      )}
    </View>
  );
}
