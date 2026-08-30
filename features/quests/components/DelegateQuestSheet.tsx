import React from 'react';
import { View, Text, Pressable } from 'react-native';
import AppBottomSheet from '@/components/AppBottomSheet';
import FamilyAvatar from '@/components/FamilyAvatar';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useChoreStore } from '@/store/choreStore';

interface Props {
  delegateTarget: { id: string; title: string } | null;
  setDelegateTarget: (t: { id: string; title: string } | null) => void;
  members: any[];
  updateQuest: (id: string, patch: any, byId?: string) => void;
  activeMemberId?: string;
  colors: any;
  isDark: boolean;
}

// Delegate sheet — AppBottomSheet, parents only, no GP force-assign
export function DelegateQuestSheet({ delegateTarget, setDelegateTarget, members, updateQuest, activeMemberId, colors, isDark }: Props) {
  return (
    <AppBottomSheet
      visible={!!delegateTarget}
      onClose={() => setDelegateTarget(null)}
      title={`Delegate: ${delegateTarget?.title ?? ''}`}
      subtitle="Assign to a parent · GPs self-claim"
      accentColor={BRAND.teal}
      minHeight="40%"
      maxHeight="70%">
      <View style={{ gap: 10 }}>
        {members.filter(m => m.role === 'parent').map(m => (
          <Pressable key={m.id} onPress={() => {
            if (delegateTarget && activeMemberId) {
              const prevAssigneeId = useChoreStore.getState().chores.find(c => c.id === delegateTarget.id)?.assignedToId;
              supabase.rpc('reassign_chore', {
                p_chore_id: delegateTarget.id, p_new_member_id: m.id, p_by_member_id: activeMemberId,
              }).then(({ error }) => {
                if (error) { console.warn('[DelegateQuestSheet] reassign_chore failed', error.message); return; }
                // Was a raw RPC bypassing choreStore.updateChore entirely —
                // the co-parent this got delegated to never got a real
                // notification. Same quest-event-notifier event every
                // other reassignment path uses.
                const familyId = useChoreStore.getState().chores.find(c => c.id === delegateTarget.id)?.familyId;
                if (familyId) {
                  supabase.functions.invoke('quest-event-notifier', {
                    body: {
                      event: 'quest_reassigned', questId: delegateTarget.id, questTitle: delegateTarget.title,
                      familyId, triggeredById: activeMemberId,
                      assigneeId: prevAssigneeId, newAssigneeId: m.id,
                    },
                  }).catch((e: any) => console.warn('[DelegateQuestSheet] reassign notify failed', e?.message));
                }
              });
              setDelegateTarget(null);
            }
          }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
            borderRadius: 16, borderWidth: 1.5, borderColor: colors.border,
            backgroundColor: isDark ? colors.surface : '#F8FAFC' }}>
            <FamilyAvatar name={m.name} emoji={m.emoji} avatarUrl={(m as any).avatarUrl}
              siblings={members.map(x => x.name)} size={44} ringColor={BRAND.purple} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{m.name}</Text>
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Parent</Text>
            </View>
            <Text style={{ fontSize: TYPO.caption, color: BRAND.teal, fontWeight: '800' }}>Assign →</Text>
          </Pressable>
        ))}
      </View>
    </AppBottomSheet>
  );
}
