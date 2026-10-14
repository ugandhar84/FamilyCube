import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Trophy } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { GEMINI } from '@/constants/geminiRhythm';
import { KID } from './kidTheme';
import { KidQuestCard } from './KidQuestCard';
import { KidQuestDetailScreen } from './KidQuestDetailScreen';
import type { FamilyMember } from '@/store/familyStore';
import type { Quest } from '@/store/questStore';

const GROUP_SHOW_LIMIT = 4;

// Restyled from one collapsible flat-priority-ordered card (old VISIBLE_LIMIT
// = 6, cut off across every status mixed together) to a status-grouped,
// flattened list — mirrors ReviewInboxScreen's "Recently decided" card
// rhythm (hairline-separated rows inside Gemini-token cards, uppercase
// section labels per group) instead of one undifferentiated stack. Each
// status gets its own labeled card so a kid can tell "what's claimed" from
// "what's waiting on a parent" from "what's up for grabs" at a glance,
// rather than scanning one combined priority order to figure out why a
// card is where it is.
//
// KidQuestCard is still used per-row (explicitly allowed — avoids losing
// any action/derivation logic already centralized there); only the
// grouping/shell around it changed. Every one of onClaim/onStart/onSubmit/
// onAcceptGpQuest/onDeclineGpQuest is still wired through unchanged, since
// KidQuestCard itself owns the per-status action buttons.
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
  const combined = [...todoQuests, ...inProgressQuests, ...declinedQuests, ...reviewQuests, ...poolQuests, ...cancelledToday];
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [detailQuest, setDetailQuest] = useState<Quest | null>(null);
  const toggleGroup = (key: string) => setExpandedGroups(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const cardWhiteBg = isDark ? colors.card : GEMINI.cardBg;
  const cardShadow = isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow;
  const sectionLabel = { fontSize: 11 as const, fontWeight: '800' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const, color: colors.textTertiary };
  const RADIUS = 16;

  const groups: { key: string; label: string; quests: Quest[]; accent: string }[] = [
    { key: 'todo',       label: 'To Do',                     quests: todoQuests,       accent: BRAND.purple },
    { key: 'inprogress', label: 'In Progress',                quests: inProgressQuests, accent: BRAND.teal },
    { key: 'declined',   label: 'Needs Another Try',          quests: declinedQuests,   accent: BRAND.amber },
    { key: 'review',     label: 'Waiting on Parent',          quests: reviewQuests,     accent: BRAND.amber },
    { key: 'pool',       label: 'Up for Grabs',                quests: poolQuests,       accent: '#10B981' },
    { key: 'cancelled',  label: 'Cancelled Today',             quests: cancelledToday,   accent: colors.danger },
  ].filter(g => g.quests.length > 0);

  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 18, gap: 12 }}>
      {/* ── Section intro row — title + total count, no collapse toggle;
          each status group below has its own card and is always visible
          so nothing is hidden behind an extra tap. ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: BRAND.purple + '20', alignItems: 'center', justifyContent: 'center' }}>
          <Trophy size={20} color={BRAND.purple} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: KID.title, fontWeight: '800', color: colors.textPrimary }}>{title}</Text>
          <Text style={{ fontSize: KID.sub, color: colors.textSecondary, marginTop: 2 }}>
            {combined.length > 0 ? `${combined.length} chore${combined.length !== 1 ? 's' : ''} — what to do first` : 'All caught up'}
          </Text>
        </View>
        {todoQuests.length > 0 && (
          <View style={{ backgroundColor: colors.danger + '18', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
            flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: KID.tiny, fontWeight: '900', color: colors.danger }}>
              {todoQuests.length} pending
            </Text>
          </View>
        )}
      </View>

      {combined.length === 0 ? (
        <Pressable onPress={() => { router.push('/(tabs)/quests'); }}
          style={{ borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: BRAND.purple + '50',
            backgroundColor: BRAND.purple + '14', padding: 28, alignItems: 'center', gap: 8 }}>
          <Trophy size={40} color={BRAND.purple} />
          <Text style={{ fontSize: KID.title, fontWeight: '900', color: BRAND.purple, marginTop: 4 }}>All caught up!</Text>
          <Text style={{ fontSize: KID.sub, color: colors.textTertiary, textAlign: 'center' }}>
            Complete chores to earn coins
          </Text>
        </Pressable>
      ) : (
        groups.map(group => {
          const isExpanded = expandedGroups.has(group.key);
          const visible = isExpanded ? group.quests : group.quests.slice(0, GROUP_SHOW_LIMIT);
          const overflow = group.quests.length - visible.length;
          return (
            <View key={group.key} style={{ backgroundColor: cardWhiteBg, borderRadius: RADIUS, padding: 16, gap: 10, ...cardShadow }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={sectionLabel}>{group.label.toUpperCase()}</Text>
                <View style={{ backgroundColor: group.accent + '20', borderRadius: 10, minWidth: 22, paddingHorizontal: 7, paddingVertical: 2, alignItems: 'center' }}>
                  <Text style={{ fontSize: KID.tiny, fontWeight: '900', color: group.accent }}>{group.quests.length}</Text>
                </View>
              </View>
              {visible.map((q, i) => (
                <View key={q.id} style={{ gap: 0 }}>
                  <KidQuestCard q={q} active={active} members={members} allQuests={allQuests} colors={colors} isDark={isDark}
                    onClaim={onClaim} onStart={onStart} onSubmit={onSubmit}
                    onAcceptGpQuest={onAcceptGpQuest} onDeclineGpQuest={onDeclineGpQuest}
                    onOpenDetail={setDetailQuest} />
                  {i < visible.length - 1 && (
                    <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginTop: 10 }} />
                  )}
                </View>
              ))}
              {overflow > 0 && (
                <Pressable onPress={() => toggleGroup(group.key)}
                  style={{ borderRadius: 14, backgroundColor: group.accent + '12', borderWidth: 1, borderColor: group.accent + '30',
                    paddingVertical: 11, alignItems: 'center', marginTop: 2 }}>
                  <Text style={{ fontSize: KID.sub, fontWeight: '800', color: group.accent }}>+{overflow} more →</Text>
                </Pressable>
              )}
              {isExpanded && group.quests.length > GROUP_SHOW_LIMIT && (
                <Pressable onPress={() => toggleGroup(group.key)}
                  style={{ borderRadius: 14, backgroundColor: group.accent + '12', borderWidth: 1, borderColor: group.accent + '30',
                    paddingVertical: 11, alignItems: 'center', marginTop: 2 }}>
                  <Text style={{ fontSize: KID.sub, fontWeight: '800', color: group.accent }}>Show less</Text>
                </Pressable>
              )}
            </View>
          );
        })
      )}

      {detailQuest && (
        <KidQuestDetailScreen
          quest={allQuests.find(q => q.id === detailQuest.id) ?? detailQuest}
          active={active} members={members} allQuests={allQuests}
          onClose={() => setDetailQuest(null)}
          onClaim={onClaim} onStart={onStart} onSubmit={onSubmit}
          onAcceptGpQuest={onAcceptGpQuest} onDeclineGpQuest={onDeclineGpQuest}
        />
      )}
    </View>
  );
}
