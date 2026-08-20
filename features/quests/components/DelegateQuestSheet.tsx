import React from 'react';
import { View, Text, Pressable } from 'react-native';
import AppBottomSheet from '@/components/AppBottomSheet';
import FamilyAvatar from '@/components/FamilyAvatar';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO } from '@/constants/theme';

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
            if (delegateTarget) {
              updateQuest(delegateTarget.id, { assignedToId: m.id, isPool: false }, activeMemberId);
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
