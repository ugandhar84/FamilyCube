import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { ChevronUp, ChevronDown } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import { useChoreStore } from '@/store/choreStore';
import type { ChoreTask } from '@/store/choreStore';
import type { FamilyMember } from '@/store/familyStore';

// An unclaimed backlog item — "pull what you can handle". Take it yourself,
// delegate it to a co-parent, or disable it (hide without deleting).
export function PoolQuestCard({ chore, members, colors, isDark, onTakeIt, onDelegate }: {
  chore: ChoreTask & { _isQuestRow?: boolean };
  members: FamilyMember[]; colors: any; isDark: boolean;
  onTakeIt: (chore: ChoreTask) => void;
  onDelegate: (choreId: string, title: string) => void;
}) {
  const [isExp, setExp] = useState(false);
  const isDisabled = (chore as any).isDisabled ?? false;
  const hasDetail = chore.description || chore.dueDate || (chore as any).shoppingItems?.length > 0;

  const creatorId = (chore as any).createdById;
  const creator = creatorId ? members.find(m => m.id === creatorId) : null;
  const creatorName = creator ? creator.name.split(' ')[0] : 'Someone';

  const createdAt = (chore as any).createdAt;
  let timeAgo = '';
  if (createdAt) {
    const diffMins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
    if (diffMins < 60) timeAgo = `${diffMins}m ago`;
    else if (diffMins < 1440) timeAgo = `${Math.floor(diffMins / 60)}h ago`;
    else timeAgo = `${Math.floor(diffMins / 1440)}d ago`;
  }

  return (
    <View style={{
      borderRadius: 14, borderWidth: 1,
      borderColor: isDisabled ? (isDark ? '#334155' : '#CBD5E1') : (isDark ? colors.border : '#E2E8F0'),
      backgroundColor: isDisabled ? (isDark ? '#0F172A' : '#F1F5F9') : (isDark ? colors.surface : '#F8FAFC'),
      opacity: isDisabled ? 0.55 : 1, overflow: 'hidden',
    }}>
      <Pressable onPress={() => hasDetail && setExp(e => !e)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, paddingBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: colors.textPrimary }}>{chore.title}</Text>
          {(creatorName || timeAgo) && (
            <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 2 }}>
              {creatorName && `By ${creatorName}`}{creatorName && timeAgo && ' · '}{timeAgo}
            </Text>
          )}
          {(chore as any).shoppingItems?.length > 0 && !isExp ? (
            <Text style={{ fontSize: TYPO.micro, color: isDark ? '#2DD4BF' : '#0D9488', marginTop: 2 }}>
              🛍️ {(chore as any).shoppingItems.length} item{(chore as any).shoppingItems.length !== 1 ? 's' : ''}
              {(chore as any).shoppingStore ? ` · ${(chore as any).shoppingStore}` : ''}
              {(chore as any).openToGP && ' · 😊 GP Welcome'}
            </Text>
          ) : chore.dueDate && !isExp ? (
            <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 2 }}>
              Due {chore.dueDate}{(chore as any).openToGP && ' · 😊 GP Welcome'}
            </Text>
          ) : (chore as any).openToGP && !isExp ? (
            <Text style={{ fontSize: TYPO.micro, color: '#8B5CF6', marginTop: 2 }}>😊 GP Welcome</Text>
          ) : null}
        </View>
        <Pressable onPress={() => { const { updateChore } = useChoreStore.getState(); updateChore(chore.id, { isPrivateParent: !isDisabled } as any); }}
          style={{ padding: 6 }}>
          <Text style={{ fontSize: 15 }}>{isDisabled ? '🔒' : '✅'}</Text>
        </Pressable>
        {hasDetail ? (isExp ? <ChevronUp size={14} color={colors.textTertiary} /> : <ChevronDown size={14} color={colors.textTertiary} />) : null}
      </Pressable>

      {!isDisabled && (
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 12 }}>
          <Pressable onPress={() => onTakeIt(chore)}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
              backgroundColor: BRAND.purple, borderRadius: 10, paddingVertical: 7 }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>✋ Take It</Text>
          </Pressable>
          <Pressable onPress={() => onDelegate(chore.id, chore.title)}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
              borderWidth: 1.5, borderColor: BRAND.teal + '80',
              borderRadius: 10, paddingVertical: 7 }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: BRAND.teal }}>📤 Delegate</Text>
          </Pressable>
        </View>
      )}

      {isExp && (
        <View style={{ borderTopWidth: 1, borderTopColor: isDark ? colors.border : '#E2E8F0', padding: 12, gap: 8 }}>
          {chore.description ? <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{chore.description}</Text> : null}
          {chore.dueDate ? <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }}>Due {chore.dueDate}</Text> : null}
          {(chore as any).shoppingItems?.length > 0 && (
            <View style={{ borderRadius: 10, borderWidth: 1,
              borderColor: isDark ? '#2DD4BF40' : '#99F6E4',
              backgroundColor: isDark ? '#2DD4BF10' : '#F0FDFA', overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6,
                borderBottomWidth: 1, borderBottomColor: isDark ? '#2DD4BF30' : '#99F6E4' }}>
                <Text style={{ fontSize: 12 }}>🛍️</Text>
                <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '700', color: isDark ? '#2DD4BF' : '#0D9488' }}>
                  {(chore as any).shoppingStore ?? 'Shopping List'}
                </Text>
                {(chore as any).shoppingBudget != null && (
                  <Text style={{ fontSize: TYPO.micro, color: isDark ? '#6EE7B7' : '#065F46' }}>
                    Budget ${(chore as any).shoppingBudget}
                  </Text>
                )}
              </View>
              {(chore as any).shoppingItems.map((item: string, i: number) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 5,
                  borderBottomWidth: i < (chore as any).shoppingItems.length - 1 ? 1 : 0,
                  borderBottomColor: isDark ? '#2DD4BF20' : '#CCFBF1' }}>
                  <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: isDark ? '#2DD4BF' : '#0D9488' }} />
                  <Text style={{ fontSize: TYPO.label, color: colors.textPrimary }}>{item}</Text>
                </View>
              ))}
            </View>
          )}
          {(chore as any).shoppingItems?.length > 0 && (
            <Pressable
              onPress={() => {
                const { updateChore } = useChoreStore.getState();
                updateChore(chore.id, { openToGP: !(chore as any).openToGP } as any);
              }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                borderRadius: 10, borderWidth: 1.5,
                borderColor: (chore as any).openToGP ? '#8B5CF6' : (isDark ? '#475569' : '#CBD5E1'),
                backgroundColor: (chore as any).openToGP ? '#8B5CF620' : 'transparent',
                padding: 10,
              }}>
              <View style={{
                width: 20, height: 20, borderRadius: 10,
                borderWidth: 2, borderColor: (chore as any).openToGP ? '#8B5CF6' : (isDark ? '#64748B' : '#94A3B8'),
                backgroundColor: (chore as any).openToGP ? '#8B5CF6' : 'transparent',
                alignItems: 'center', justifyContent: 'center',
              }}>
                {(chore as any).openToGP && <Text style={{ fontSize: 12, color: '#fff' }}>✓</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>😊 GP Welcome</Text>
                <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>Grandparents can see and claim this task</Text>
              </View>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
