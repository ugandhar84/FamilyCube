import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { ChevronUp, ChevronDown, Check, MessageCircle } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
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
      borderRadius: 14, borderWidth: 1.5, borderColor: BRAND.amber + '50',
      backgroundColor: isDark ? BRAND.amber + '10' : BRAND.amber + '08', overflow: 'hidden',
    }}>
      <Pressable onPress={() => setExp(e => !e)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, paddingBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{chore.title}</Text>
          <Text style={{ fontSize: TYPO.label, color: BRAND.amber, marginTop: 2 }}>
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
            borderWidth: 1.5, borderColor: BRAND.amber + '60',
            borderRadius: 10, paddingVertical: 8 }}>
          <MessageCircle size={14} color={BRAND.amber} />
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.amber }}>Respond</Text>
        </Pressable>
      </View>
      {isExp && chore.description && (
        <View style={{ borderTopWidth: 1, borderTopColor: BRAND.amber + '30', padding: 12 }}>
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{chore.description}</Text>
        </View>
      )}
    </View>
  );
}
