import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { ChevronUp, ChevronDown, ThumbsUp, Check, CheckCircle2, ShoppingBag } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import type { ChoreTask, ParentQuestAssignment } from '@/store/choreStore';
import type { FamilyMember } from '@/store/familyStore';
import { useChatStore } from '@/store/chatStore';

// A task this parent has already accepted and is working — mark it done, or
// expand to see the shopping list / send an appreciation ping to whoever
// assigned it.
export function AcceptedQuestCard({ a, chore, active, members, colors, isDark, completeParentQuest, appreciationPing }: {
  a: ParentQuestAssignment; chore: ChoreTask; active: { id: string }; members: FamilyMember[]; colors: any; isDark: boolean;
  completeParentQuest: (assignmentId: string, completedBy: string) => void;
  appreciationPing: (assignmentId: string, fromId: string, message: string) => void;
}) {
  const [isExp, setExp] = useState(false);
  const hasDetail = chore.description || (chore as any).shoppingItems?.length > 0;

  return (
    <View style={{
      borderRadius: 14, borderWidth: 1, borderColor: isDark ? colors.border : 'rgba(225,218,203,0.7)',
      backgroundColor: isDark ? colors.card : '#FFFFFF', overflow: 'hidden',
      borderLeftWidth: 3, borderLeftColor: colors.parent,
      shadowColor: isDark ? '#000' : 'rgba(80,60,40,0.10)',
      shadowOpacity: isDark ? 0.4 : 1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
      elevation: isDark ? 3 : 2,
    }}>
      <Pressable onPress={() => hasDetail && setExp(e => !e)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, paddingBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{chore.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <CheckCircle2 size={11} color={colors.parent} />
            <Text style={{ fontSize: TYPO.label, color: colors.parent }}>You've got this one</Text>
          </View>
        </View>
        {hasDetail ? (isExp ? <ChevronUp size={14} color={colors.textTertiary} /> : <ChevronDown size={14} color={colors.textTertiary} />) : null}
      </Pressable>
      <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
        <Pressable onPress={() => {
          completeParentQuest(a.id, active.id);
          // completeParentQuest itself sends no notification — the assigner
          // (a.assignedBy) otherwise only learns their delegation was
          // finished by noticing the card gone next time they open the app.
          if (a.assignedBy !== active.id) {
            const doer = members.find(m => m.id === active.id);
            useChatStore.getState().sendMessage(a.assignedBy, active.id,
              `✅ ${doer?.name?.split(' ')[0] ?? 'They'} finished "${chore.title}"`);
          }
        }}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.parent, borderRadius: 10, paddingVertical: 8 }}>
          <Check size={14} color="#fff" />
          <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>Done</Text>
        </Pressable>
      </View>
      {isExp && (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.parent + '30', padding: 12, gap: 8 }}>
          {chore.description ? <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{chore.description}</Text> : null}
          {(chore as any).shoppingItems?.length > 0 && (
            <View style={{ borderRadius: 10, borderWidth: 1,
              borderColor: colors.parent + '40',
              backgroundColor: isDark ? colors.parent + '08' : colors.parentLight, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7,
                borderBottomWidth: 1, borderBottomColor: colors.parent + '30' }}>
                <ShoppingBag size={13} color={colors.parent} />
                <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '700', color: colors.parent }}>
                  {(chore as any).shoppingStore ? `Shop at ${(chore as any).shoppingStore}` : 'Shopping List'}
                </Text>
                {(chore as any).shoppingBudget != null && (
                  <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.success }}>
                    Budget ${(chore as any).shoppingBudget}
                  </Text>
                )}
              </View>
              {(chore as any).shoppingItems.map((item: string, i: number) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6,
                  borderBottomWidth: i < (chore as any).shoppingItems.length - 1 ? 1 : 0,
                  borderBottomColor: colors.parent + '20' }}>
                  <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: colors.parent }} />
                  <Text style={{ fontSize: TYPO.label, color: colors.textPrimary }}>{item}</Text>
                </View>
              ))}
            </View>
          )}
          <Pressable onPress={() => appreciationPing(a.id, active.id, 'Thanks for handling that!')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <ThumbsUp size={13} color={colors.parent} />
            <Text style={{ fontSize: TYPO.label, color: colors.parent }}>Send appreciation ping</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
