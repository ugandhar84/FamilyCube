import { View, Text, Pressable } from 'react-native';
import { Check, HeartHandshake } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import AppBottomSheet from '@/components/AppBottomSheet';
import { useChoreStore } from '@/store/choreStore';
import type { FamilyMember } from '@/store/familyStore';
import type { ChoreTask } from '@/store/choreStore';

// Violet — "GP Welcome" toggle selection accent, deliberately distinct from
// BRAND.purple (#9261C7) so the grandparent-facing toggle reads as its own
// state color; kept as one local constant instead of a repeated bare hex.
const GP_VIOLET = '#8B5CF6';

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
      accentColor={colors.parent}
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
              {/* intentional: 40 is this sheet's avatar-emoji size; no TYPO token is close without a visible size change */}
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
            borderColor: isGPOpen ? GP_VIOLET : (isDark ? '#475569' : '#CBD5E1'),
            backgroundColor: isGPOpen ? `${GP_VIOLET}20` : (isDark ? colors.surface : '#F8FAFC'),
          }}>
          <View style={{
            width: 44, height: 44, borderRadius: 22,
            borderWidth: 2,
            borderColor: isGPOpen ? GP_VIOLET : (isDark ? '#64748B' : '#94A3B8'),
            backgroundColor: isGPOpen ? GP_VIOLET : 'transparent',
            alignItems: 'center', justifyContent: 'center',
          }}>
            {isGPOpen ? <Check size={20} color="#fff" /> : <HeartHandshake size={20} color={isDark ? '#64748B' : '#94A3B8'} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>GP Welcome</Text>
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Grandparents can see and claim this task</Text>
          </View>
        </Pressable>
      </View>
    </AppBottomSheet>
  );
}
