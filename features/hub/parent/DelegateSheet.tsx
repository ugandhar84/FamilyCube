import { View, Text, Pressable } from 'react-native';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import AppBottomSheet from '@/components/AppBottomSheet';
import { useChoreStore } from '@/store/choreStore';
import type { FamilyMember } from '@/store/familyStore';
import type { ChoreTask } from '@/store/choreStore';

export function DelegateSheet({ target, questPool, members, active, colors, isDark, onClose, updateQuest, addParentQuest }: {
  target: { choreId: string; choreTitle: string } | null;
  questPool: (ChoreTask & { _isQuestRow?: boolean })[];
  members: FamilyMember[]; active: FamilyMember; colors: any; isDark: boolean;
  onClose: () => void;
  updateQuest: (id: string, patch: Record<string, any>) => void;
  addParentQuest: (choreId: string, assignedBy: string, assignedTo: string, mode: 'DIRECT') => void;
}) {
  const currentChore = target ? questPool.find(c => c.id === target.choreId) : null;
  const isGPOpen = !!(currentChore as any)?.openToGP;

  return (
    <AppBottomSheet
      visible={!!target}
      onClose={onClose}
      title={`Delegate: ${target?.choreTitle ?? ''}`}
      subtitle="Assign to a parent"
      accentColor={BRAND.teal}
      minHeight="40%"
      maxHeight="70%">
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
          {members.filter(m => m.role === 'parent').map(m => (
            <Pressable key={m.id} onPress={() => {
              if (!target) return;
              const isQRow = questPool.find(c => c.id === target.choreId && (c as any)._isQuestRow);
              if (isQRow) {
                updateQuest(target.choreId, { assignedToId: m.id, status: 'todo' });
              } else {
                addParentQuest(target.choreId, active.id, m.id, 'DIRECT');
              }
              onClose();
            }} style={{
              alignItems: 'center', gap: 6,
              paddingVertical: 12, paddingHorizontal: 16,
              borderRadius: 16, borderWidth: 1.5, borderColor: colors.border,
              backgroundColor: isDark ? colors.surface : '#F8FAFC',
            }}>
              <Text style={{ fontSize: 40 }}>{m.emoji || '👤'}</Text>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary }}>{m.name}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={() => {
            if (!target) return;
            useChoreStore.getState().updateChore(target.choreId, { openToGP: !isGPOpen } as any);
          }}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
            marginTop: 6,
            borderRadius: 16, borderWidth: 1.5,
            borderColor: isGPOpen ? '#8B5CF6' : (isDark ? '#475569' : '#CBD5E1'),
            backgroundColor: isGPOpen ? '#8B5CF620' : (isDark ? colors.surface : '#F8FAFC'),
          }}>
          <View style={{
            width: 44, height: 44, borderRadius: 22,
            borderWidth: 2,
            borderColor: isGPOpen ? '#8B5CF6' : (isDark ? '#64748B' : '#94A3B8'),
            backgroundColor: isGPOpen ? '#8B5CF6' : 'transparent',
            alignItems: 'center', justifyContent: 'center',
          }}>
            {isGPOpen ? <Text style={{ fontSize: 20, color: '#fff' }}>✓</Text> : <Text style={{ fontSize: 20 }}>😊</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>😊 GP Welcome</Text>
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Grandparents can see and claim this task</Text>
          </View>
        </Pressable>
      </View>
    </AppBottomSheet>
  );
}
