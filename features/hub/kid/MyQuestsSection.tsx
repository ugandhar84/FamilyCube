import { useState, useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { ChevronUp, ChevronDown, Trophy, Coins } from 'lucide-react-native';
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
  active, members, colors, isDark, title = 'My Chores',
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

  // Collapsed by default when there's nothing to show, expanded whenever
  // there's real content — was gated on actionableCount (todo/in-progress/
  // review/declined only), which excluded poolQuests and cancelledToday.
  // Both of those render real visible cards in this same section (bounty
  // chores up for grabs, today's cancellations), so a kid with ONLY pool
  // quests available — a common, ordinary case, not an edge case — saw
  // this default to collapsed despite having something worth seeing.
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (combined.length > 0) setExpanded(true);
  }, [combined.length > 0]);

  const visible = combined.slice(0, VISIBLE_LIMIT);
  const overflow = combined.length - visible.length;
  console.log(`[UserAction] FILTER screen=Hub role=kid member=${active.name} list=MyQuestsSection.combined totalSource=${todoQuests.length + inProgressQuests.length + declinedQuests.length + reviewQuests.length + poolQuests.length + cancelledToday.length} afterFilter=${combined.length} visible=${visible.length} overflow=${overflow} [features/hub/kid/MyQuestsSection.tsx:52]`);

  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 18 }}>
      <View style={{ borderRadius: 20, borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0',
        backgroundColor: colors.card, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
          <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: BRAND.purple + '20', alignItems: 'center', justifyContent: 'center' }}>
            <Trophy size={20} color={BRAND.purple} />
          </View>
          <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=kid member=${active.name} tapped "${title} header" on "MyQuestsSection" → toggle expanded from ${expanded} to ${!expanded} [features/hub/kid/MyQuestsSection.tsx:60]`); setExpanded(e => !e); }} style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: KID.title, fontWeight: '800', color: colors.textPrimary }}>{title}</Text>
              {combined.length > 0 && (
                <View style={{ backgroundColor: BRAND.purple, borderRadius: 10, minWidth: 22, paddingHorizontal: 7, paddingVertical: 3, alignItems: 'center' }}>
                  <Text style={{ fontSize: KID.tiny, fontWeight: '900', color: '#fff' }}>{combined.length}</Text>
                </View>
              )}
              {poolQuests.length > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: BRAND.amber, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 }}>
                  <Coins size={11} color="#fff" />
                  <Text style={{ fontSize: KID.tiny, fontWeight: '900', color: '#fff' }}>{poolQuests.length}</Text>
                </View>
              )}
            </View>
            <Text style={{ fontSize: KID.sub, color: colors.textSecondary, marginTop: 2 }}>
              {combined.length > 0 ? `${combined.length} chore${combined.length !== 1 ? 's' : ''} — what to do first` : 'All caught up'}
            </Text>
          </Pressable>
          {todoQuests.length > 0 && (
            <View style={{ backgroundColor: colors.danger + '18', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
              flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: KID.tiny, fontWeight: '900', color: colors.danger }}>
                {todoQuests.length} pending
              </Text>
            </View>
          )}
          <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=kid member=${active.name} tapped "chevron" on "MyQuestsSection" → toggle expanded from ${expanded} to ${!expanded} [features/hub/kid/MyQuestsSection.tsx:82]`); setExpanded(e => !e); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            {expanded ? <ChevronUp size={18} color={colors.textTertiary} /> : <ChevronDown size={18} color={colors.textTertiary} />}
          </Pressable>
        </View>

        {expanded && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 8 }}>
            {combined.length === 0 ? (
              <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=kid member=${active.name} tapped "All caught up!" on "MyQuestsSection empty state" → navigate to /(tabs)/quests [features/hub/kid/MyQuestsSection.tsx:90]`); router.push('/(tabs)/quests'); }}
                style={{ borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: BRAND.purple + '50',
                  backgroundColor: BRAND.purple + '14', padding: 28, alignItems: 'center', gap: 8 }}>
                <Trophy size={40} color={BRAND.purple} />
                <Text style={{ fontSize: KID.title, fontWeight: '900', color: BRAND.purple, marginTop: 4 }}>All caught up!</Text>
                <Text style={{ fontSize: KID.sub, color: colors.textTertiary, textAlign: 'center' }}>
                  {poolQuests.length > 0 ? `${poolQuests.length} bounty chores up for grabs 💰` : 'Complete chores to earn coins'}
                </Text>
              </Pressable>
            ) : visible.map(q => (
              <KidQuestCard key={q.id} q={q} active={active} members={members} allQuests={allQuests} colors={colors} isDark={isDark}
                onClaim={onClaim} onStart={onStart} onSubmit={onSubmit}
                onAcceptGpQuest={onAcceptGpQuest} onDeclineGpQuest={onDeclineGpQuest} />
            ))}
            {overflow > 0 && (
              <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=kid member=${active.name} tapped "+${overflow} more quests →" on "MyQuestsSection" → navigate to /(tabs)/quests [features/hub/kid/MyQuestsSection.tsx:105]`); router.push('/(tabs)/quests'); }}
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
