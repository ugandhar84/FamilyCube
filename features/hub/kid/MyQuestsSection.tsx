import { useState, useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { ChevronUp, ChevronDown, Trophy } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { KID } from './kidTheme';
import { KidQuestCard } from './KidQuestCard';
import type { FamilyMember } from '@/store/familyStore';
import type { Quest } from '@/store/questStore';

const VISIBLE_LIMIT = 6;

// The kid's own "Action Needed" — ordered by what needs attention: todo → in
// progress → submitted (waiting on parent) → bounty pool → cancelled last.
// Once a parent approves a quest it's removed entirely (nothing left to do),
// which is why "approved" never appears in this list.
export function MyQuestsSection({
  todoQuests, inProgressQuests, reviewQuests, poolQuests, cancelledToday, declinedQuests = [], allQuests,
  active, members, colors, isDark, title = 'My Quests',
  onClaim, onStart, onSubmit, onAcceptGpQuest, onDeclineGpQuest,
}: {
  todoQuests: Quest[]; inProgressQuests: Quest[]; reviewQuests: Quest[]; poolQuests: Quest[]; cancelledToday: Quest[];
  declinedQuests?: Quest[];
  allQuests: Quest[]; active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean;
  title?: string;
  onClaim: (id: string) => void;
  onStart: (id: string) => void;
  onSubmit: (q: Quest) => void;
  onAcceptGpQuest: (id: string) => void;
  onDeclineGpQuest: (q: Quest) => void;
}) {
  // Declined-needs-resubmit is real work waiting on the kid — sits right
  // after in-progress, ahead of the passive pool listing, so it doesn't get
  // buried under quests nobody's blocked on yet.
  const combined = [...todoQuests, ...inProgressQuests, ...declinedQuests, ...reviewQuests, ...poolQuests, ...cancelledToday];
  const actionableCount = todoQuests.length + inProgressQuests.length + reviewQuests.length + declinedQuests.length;

  // Collapsed by default like every Hub section — auto-opens once there's
  // more than one thing to do. A single actionable quest is easy to spot
  // collapsed (the count badge already says "1"); it's only once there's
  // a real list worth scanning that auto-opening earns the screen space.
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (actionableCount > 1) setExpanded(true);
  }, [actionableCount > 1]);

  const visible = combined.slice(0, VISIBLE_LIMIT);
  const overflow = combined.length - visible.length;

  return (
    <View style={{ paddingHorizontal: 16 }}>
      <View style={{ borderRadius: 20, borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0',
        backgroundColor: colors.card, overflow: 'hidden', marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
          <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: BRAND.purple + '20', alignItems: 'center', justifyContent: 'center' }}>
            <Trophy size={20} color={BRAND.purple} />
          </View>
          <Pressable onPress={() => setExpanded(e => !e)} style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: KID.title, fontWeight: '800', color: colors.textPrimary }}>{title}</Text>
              {combined.length > 0 && (
                <View style={{ backgroundColor: BRAND.purple, borderRadius: 10, minWidth: 22, paddingHorizontal: 7, paddingVertical: 3, alignItems: 'center' }}>
                  <Text style={{ fontSize: KID.tiny, fontWeight: '900', color: '#fff' }}>{combined.length}</Text>
                </View>
              )}
            </View>
            <Text style={{ fontSize: KID.sub, color: colors.textSecondary, marginTop: 2 }}>
              {combined.length > 0 ? `${combined.length} quest${combined.length !== 1 ? 's' : ''} — what to do first` : 'All caught up'}
            </Text>
          </Pressable>
          <Pressable onPress={() => router.push('/(tabs)/quests')}>
            <Text style={{ fontSize: KID.sub, fontWeight: '700', color: BRAND.purple }}>All Quests →</Text>
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
                <Trophy size={40} color={BRAND.purple} />
                <Text style={{ fontSize: KID.title, fontWeight: '900', color: BRAND.purple, marginTop: 4 }}>All caught up!</Text>
                <Text style={{ fontSize: KID.sub, color: colors.textTertiary, textAlign: 'center' }}>
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
                  paddingVertical: 13, alignItems: 'center' }}>
                <Text style={{ fontSize: KID.sub, fontWeight: '800', color: BRAND.purple }}>+{overflow} more quests →</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
}
