import { useState, useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { ChevronUp, ChevronDown } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { KidQuestCard } from './KidQuestCard';
import type { FamilyMember } from '@/store/familyStore';
import type { Quest } from '@/store/questStore';

const VISIBLE_LIMIT = 6;

// The kid's own "Action Needed" — ordered by what needs attention: todo → in
// progress → submitted (waiting on parent) → bounty pool → cancelled last.
// Once a parent approves a quest it's removed entirely (nothing left to do),
// which is why "approved" never appears in this list.
export function MyQuestsSection({
  todoQuests, inProgressQuests, reviewQuests, poolQuests, cancelledToday, allQuests,
  active, members, colors, isDark,
  onClaim, onStart, onSubmit, onAcceptGpQuest, onDeclineGpQuest,
}: {
  todoQuests: Quest[]; inProgressQuests: Quest[]; reviewQuests: Quest[]; poolQuests: Quest[]; cancelledToday: Quest[];
  allQuests: Quest[]; active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean;
  onClaim: (id: string) => void;
  onStart: (id: string) => void;
  onSubmit: (q: Quest) => void;
  onAcceptGpQuest: (id: string) => void;
  onDeclineGpQuest: (q: Quest) => void;
}) {
  const combined = [...todoQuests, ...inProgressQuests, ...reviewQuests, ...poolQuests, ...cancelledToday];
  const actionableCount = todoQuests.length + inProgressQuests.length + reviewQuests.length;

  // Collapsed by default like every Hub section — auto-opens the moment
  // there's something to do.
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (actionableCount > 0) setExpanded(true);
  }, [actionableCount > 0]);

  const visible = combined.slice(0, VISIBLE_LIMIT);
  const overflow = combined.length - visible.length;

  return (
    <View style={{ paddingHorizontal: 16 }}>
      <View style={{ borderRadius: 20, borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0',
        backgroundColor: isDark ? colors.card : '#fff', overflow: 'hidden', marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: BRAND.purple + '20', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 18 }}>🏆</Text>
          </View>
          <Pressable onPress={() => setExpanded(e => !e)} style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary }}>My Quests</Text>
              {combined.length > 0 && (
                <View style={{ backgroundColor: BRAND.purple, borderRadius: 10, minWidth: 20, paddingHorizontal: 6, paddingVertical: 2, alignItems: 'center' }}>
                  <Text style={{ fontSize: 10, fontWeight: '900', color: '#fff' }}>{combined.length}</Text>
                </View>
              )}
            </View>
            <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
              {combined.length > 0 ? `${combined.length} quest${combined.length !== 1 ? 's' : ''} — what to do first` : 'All caught up'}
            </Text>
          </Pressable>
          <Pressable onPress={() => router.push('/(tabs)/quests')}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: BRAND.purple }}>All Quests →</Text>
          </Pressable>
          <Pressable onPress={() => setExpanded(e => !e)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            {expanded ? <ChevronUp size={18} color={colors.textTertiary} /> : <ChevronDown size={18} color={colors.textTertiary} />}
          </Pressable>
        </View>

        {expanded && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 8 }}>
            {combined.length === 0 ? (
              <Pressable onPress={() => router.push('/(tabs)/quests')}
                style={{ borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: BRAND.purple + '50',
                  backgroundColor: BRAND.purple + '08', padding: 28, alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 40 }}>🏆</Text>
                <Text style={{ fontSize: 15, fontWeight: '900', color: BRAND.purple }}>All caught up!</Text>
                <Text style={{ fontSize: 12, color: colors.textTertiary, textAlign: 'center' }}>
                  {poolQuests.length > 0 ? `${poolQuests.length} bounty quests up for grabs 💰` : 'Complete quests to earn coins'}
                </Text>
              </Pressable>
            ) : visible.map(q => (
              <KidQuestCard key={q.id} q={q} active={active} members={members} allQuests={allQuests} colors={colors} isDark={isDark}
                onClaim={onClaim} onStart={onStart} onSubmit={onSubmit}
                onAcceptGpQuest={onAcceptGpQuest} onDeclineGpQuest={onDeclineGpQuest} />
            ))}
            {overflow > 0 && (
              <Pressable onPress={() => router.push('/(tabs)/quests')}
                style={{ borderRadius: 14, backgroundColor: BRAND.purple + '12', borderWidth: 1, borderColor: BRAND.purple + '30',
                  paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: BRAND.purple }}>+{overflow} more quests →</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
}
