import { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import { Check, HeartHandshake } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';
import AppBottomSheet from '@/components/AppBottomSheet';
import { useChoreStore } from '@/store/choreStore';
import { useChatStore } from '@/store/chatStore';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/AppToast';
import type { FamilyMember } from '@/store/familyStore';
import type { ChoreTask } from '@/store/choreStore';

// GP Welcome toggle accent — deliberately distinct from brand pink/lavender
// so the grandparent-facing toggle reads as its own state color.
const GP_VIOLET = '#8B5CF6';

export function DelegateSheet({ target, questPool, members, active, onClose, updateQuest, addParentQuest }: {
  target: { choreId: string; choreTitle: string } | null;
  questPool: (ChoreTask & { _isQuestRow?: boolean })[];
  members: FamilyMember[]; active: FamilyMember;
  onClose: () => void;
  updateQuest: (id: string, patch: Record<string, any>) => void;
  addParentQuest: (choreId: string, assignedBy: string, assignedTo: string, mode: 'DIRECT', note?: string) => void;
}) {
  const { colors, isDark } = useTheme();
  const liveChore = useChoreStore(s => s.chores.find(c => c.id === target?.choreId));
  const isGPOpen = !!liveChore?.inviteGrandparents;
  const [note, setNote] = useState('');
  const hasGrandparents = members.some(m => m.role === 'senior');
  const borderColor = isDark ? colors.border : 'rgba(223,97,60,0.10)';

  return (
    <AppBottomSheet
      visible={!!target}
      onClose={() => { setNote(''); onClose(); }}
      title={`Delegate: ${target?.choreTitle ?? ''}`}
      subtitle="Assign to a parent or grandparent"
      accentColor={colors.teal}
      minHeight="40%"
      maxHeight="70%"
    >
      <View style={{ gap: 12 }}>
        {/* Note field */}
        <View style={{ gap: 6 }}>
          <Text style={[s.overline, { color: colors.textTertiary }]}>NOTE (OPTIONAL)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Why you're passing this along…"
            placeholderTextColor={colors.textTertiary}
            multiline
            style={{
              fontSize: TYPO.label, color: colors.textPrimary, minHeight: 44,
              borderRadius: 14, borderWidth: 1, borderColor,
              backgroundColor: colors.surface,
              paddingHorizontal: 14, paddingVertical: 12,
            }}
          />
        </View>

        {/* Member chips */}
        <View style={{ gap: 6 }}>
          <Text style={[s.overline, { color: colors.textTertiary }]}>ASSIGN TO</Text>
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            {members
              .filter(m => m.id !== active.id && (m.role === 'parent' || (m.role === 'senior' && isGPOpen)))
              .map(m => (
                <Pressable
                  key={m.id}
                  onPress={() => {
                    if (!target) return;
                    const priorAssignment = useChoreStore.getState().getLiveAssignmentForChore(target.choreId);
                    const priorAssigneeId = priorAssignment
                      ? (priorAssignment.assignedTo === active.id ? priorAssignment.assignedBy : priorAssignment.assignedTo)
                      : undefined;
                    const isQRow = questPool.find(c => c.id === target.choreId && (c as any)._isQuestRow);
                    if (isQRow) {
                      supabase.rpc('reassign_chore', {
                        p_chore_id: target.choreId, p_new_member_id: m.id, p_by_member_id: active.id,
                      }).then(({ error }) => {
                        if (error) { console.warn('[DelegateSheet] reassign_chore failed', error.message); return; }
                        showToast(`Delegated to ${m.name.split(' ')[0]} ✓`);
                        supabase.functions.invoke('quest-event-notifier', {
                          body: {
                            event: 'quest_reassigned', questId: target.choreId, questTitle: target.choreTitle,
                            familyId: liveChore?.familyId, triggeredById: active.id,
                            assigneeId: priorAssigneeId, newAssigneeId: m.id, coins: liveChore?.coinsReward,
                          },
                        }).catch((e: any) => console.warn('[DelegateSheet] reassign notify failed', e?.message));
                      });
                    } else {
                      addParentQuest(target.choreId, active.id, m.id, 'DIRECT', note.trim() || undefined);
                      showToast(`Delegated to ${m.name.split(' ')[0]} ✓`);
                    }
                    if (priorAssigneeId && priorAssigneeId !== m.id && priorAssigneeId !== active.id) {
                      useChatStore.getState().sendMessage(priorAssigneeId, active.id,
                        `↪️ ${active.name.split(' ')[0]} reassigned "${target.choreTitle}" to ${m.name.split(' ')[0]}.`);
                    }
                    setNote('');
                    onClose();
                  }}
                  style={({ pressed }) => ({
                    alignItems: 'center', gap: 6,
                    paddingVertical: 14, paddingHorizontal: 18,
                    borderRadius: 18, borderWidth: 1, borderColor,
                    backgroundColor: isDark ? colors.surface : colors.card,
                    opacity: pressed ? 0.75 : 1,
                  })}
                >
                  <Text style={{ fontSize: 40 }}>{m.emoji || '👤'}</Text>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary }}>{m.name.split(' ')[0]}</Text>
                </Pressable>
              ))
            }
          </View>
        </View>

        {/* GP Welcome toggle */}
        {hasGrandparents && (
          <Pressable
            onPress={() => {
              if (!target) return;
              useChoreStore.getState().updateChore(target.choreId, { inviteGrandparents: !isGPOpen } as any);
            }}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
              marginTop: 4,
              borderRadius: 18, borderWidth: 1,
              borderColor: isGPOpen ? GP_VIOLET : borderColor,
              backgroundColor: isGPOpen ? `${GP_VIOLET}18` : colors.surface,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <View style={{
              width: 44, height: 44, borderRadius: 22,
              borderWidth: 2,
              borderColor: isGPOpen ? GP_VIOLET : (isDark ? colors.border : 'rgba(223,97,60,0.20)'),
              backgroundColor: isGPOpen ? GP_VIOLET : 'transparent',
              alignItems: 'center', justifyContent: 'center',
            }}>
              {isGPOpen
                ? <Check size={20} color="#fff" />
                : <HeartHandshake size={20} color={isDark ? colors.textTertiary : 'rgba(223,97,60,0.40)'} />
              }
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>GP Welcome</Text>
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Grandparents can see and claim this task</Text>
            </View>
          </Pressable>
        )}
      </View>
    </AppBottomSheet>
  );
}

const s = StyleSheet.create({
  overline: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.9,
  },
});
