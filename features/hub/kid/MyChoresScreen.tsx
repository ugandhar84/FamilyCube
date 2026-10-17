import { useRef, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, PanResponder } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClipboardList, Clock, CheckCircle2, Plus, Gem } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { GEMINI } from '@/constants/geminiRhythm';
import { PageHeading } from '@/components/PageHeading';
import FullPageOverlay from '@/components/FullPageOverlay';
import { hideTabBar, showTabBar } from '@/lib/tabBarVisibility';
import { useUIStore } from '@/store/uiStore';
import { KidQuestCard } from './KidQuestCard';
import { QuestDetailModal } from '@/features/quests/components/QuestDetailModal';
import { ChoreProposalPage } from './forms/ChoreProposalPage';
import type { FamilyMember } from '@/store/familyStore';
import type { Quest } from '@/store/questStore';

// My Chores — full-page "action center" for the My Chores Quick Action
// tile, following the Meals module's exact landing-page rhythm
// (MealsScreen.tsx): PageHeading + a banner card up top, then flat status
// groups below, with a stacked FullPageOverlay for the one sub-page
// ("Propose a Chore" → the EXISTING ChoreProposalPage, unchanged) and the
// same edge-swipe-back PanResponder. [live-requested: "When we click
// chores tile it should open chores landing page with banner propose a
// chore and down to that todo pending review completed... We must follow
// parents meals module rhythm with headers and gestures pages"]
export function MyChoresScreen({
  onClose, active, members, familyId,
  todoQuests, inProgressQuests, reviewQuests, declinedQuests, approvedQuests, poolQuests, allQuests,
  colors, isDark,
  onClaim, onStart, onSubmit, onAcceptGpQuest, onDeclineGpQuest,
  initialTab,
}: {
  onClose: () => void;
  active: FamilyMember; members: FamilyMember[]; familyId: string;
  todoQuests: Quest[]; inProgressQuests: Quest[]; reviewQuests: Quest[];
  declinedQuests: Quest[]; approvedQuests: Quest[]; poolQuests: Quest[]; allQuests: Quest[];
  colors: any; isDark: boolean;
  onClaim: (id: string) => void;
  onStart: (id: string) => void;
  onSubmit: (q: Quest) => void;
  onAcceptGpQuest: (id: string) => void;
  onDeclineGpQuest: (q: Quest) => void;
  // Which status tab opens first — e.g. the Needs You card's own
  // most-urgent item should land the kid directly on that item's tab
  // ('review'/'todo'/'bounty') instead of always defaulting to 'todo'.
  initialTab?: 'todo' | 'review' | 'done' | 'bounty';
}) {
  const insets = useSafeAreaInsets();
  const canvas = isDark ? colors.background : GEMINI.canvas;
  const cardBg = isDark ? colors.card : GEMINI.cardBg;

  const [showPropose, setShowPropose] = useState(false);
  const [detailQuest, setDetailQuest] = useState<Quest | null>(null);

  useEffect(() => {
    if (showPropose) hideTabBar();
    // Don't showTabBar here when closing — this screen's own parent
    // overlay keeps the tab bar hidden for as long as THIS screen is open.
  }, [showPropose]);

  const subPageOpen = useRef(false);
  useEffect(() => { subPageOpen.current = showPropose || !!detailQuest; }, [showPropose, detailQuest]);

  const swipePan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) =>
      !subPageOpen.current && g.dx > 10 && Math.abs(g.dy) < 40 && g.moveX - g.dx < 30,
    onPanResponderRelease: (_, g) => {
      if (!subPageOpen.current && (g.dx > 100 || g.vx > 0.8)) onClose();
    },
  })).current;

  const bountyQuests = poolQuests.filter(q => q.questType === 'bounty');

  const groups: { key: string; label: string; quests: Quest[]; accent: string; Icon: any }[] = [
    { key: 'todo',     label: 'To Do',          quests: [...todoQuests, ...inProgressQuests, ...declinedQuests], accent: colors.teal, Icon: ClipboardList },
    { key: 'review',   label: 'Submitted',      quests: reviewQuests,   accent: colors.amber,   Icon: Clock },
    { key: 'done',     label: 'Approved',       quests: approvedQuests, accent: colors.primary, Icon: CheckCircle2 },
    { key: 'bounty',   label: 'Bounty',         quests: bountyQuests,   accent: colors.pink,    Icon: Gem },
  ];
  const totalOpen = todoQuests.length + inProgressQuests.length + declinedQuests.length;

  const [activeTab, setActiveTab] = useState<string>(initialTab ?? 'todo');
  const activeGroup = groups.find(g => g.key === activeTab) ?? groups[0];

  return (
    <View style={{ flex: 1, backgroundColor: canvas }} {...swipePan.panHandlers}>
      <View style={{ backgroundColor: canvas }}>
        <PageHeading
          eyebrow="FAMILY CUBE · MY CHORES"
          title="Chores"
          subtitle="What's left, what's waiting, and what you've finished."
          accent="teal"
          Icon={ClipboardList}
          onTitlePress={onClose}
          topInset={insets.top}
        />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: insets.bottom + 32 }}>

        {/* ── Propose a Chore banner — same Figma rhythm as Health's
            "Health documents" banner (HealthRecordsScreen.tsx): bright
            white card on the warm canvas, bordered, real drop shadow
            (GEMINI.cardShadow) instead of a flat tinted-fill card with no
            shadow [live-reported: "Banner should have proper shadow also
            CTA button styles and colors also should match with heath
            records" / "Cards should be rhythm of Figma"]. ── */}
        <Pressable
          onPress={() => setShowPropose(true)}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', gap: 12,
            backgroundColor: cardBg, borderRadius: 16,
            borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border,
            padding: 16, opacity: pressed ? 0.88 : 1,
            ...(isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow),
          })}
        >
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: GEMINI.blue + '15', alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={22} color={GEMINI.blue} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: isDark ? colors.textPrimary : GEMINI.titleColor }}>Propose a Chore</Text>
            <Text style={{ fontSize: 12, fontWeight: '500', color: isDark ? colors.textSecondary : GEMINI.bodyColor }}>Suggest one for yourself or a sibling</Text>
          </View>
        </Pressable>

        {totalOpen === 0 && reviewQuests.length === 0 && approvedQuests.length === 0 && (
          <View style={{ borderRadius: 16, backgroundColor: cardBg, borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border,
            padding: 28, alignItems: 'center', gap: 8, ...(isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow) }}>
            <ClipboardList size={36} color={colors.teal} />
            <Text style={{ fontSize: 17, fontWeight: '900', color: colors.teal, marginTop: 4 }}>All caught up!</Text>
            <Text style={{ fontSize: 13, color: colors.textTertiary, textAlign: 'center' }}>Propose a chore above to get started</Text>
          </View>
        )}

        {/* ── Stat cards double as the filter/tabs — each group keeps its
            own icon-on-top / count / label card shape AND its own pastel
            fill (group.accent Light-tint), while also being the tappable
            filter that drives activeGroup below [live-requested: "keep the
            stip cards for the counters use the same as filters/tabs"].
            Active card gets the full-strength accent fill + white
            icon/text; inactive cards get the soft *Light tint with
            accent-colored icon/text. ── */}
        {groups.some(g => g.quests.length > 0) && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {groups.map(group => {
              const isActive = activeTab === group.key;
              return (
                <Pressable key={group.key} onPress={() => setActiveTab(group.key)}
                  style={{ flex: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center', gap: 4,
                    backgroundColor: isActive ? group.accent : group.accent + '18' }}>
                  <group.Icon size={18} color={isActive ? '#fff' : group.accent} />
                  <Text style={{ fontSize: 16, fontWeight: '900', color: isActive ? '#fff' : group.accent }}>
                    {group.quests.length}
                  </Text>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: isActive ? '#fff' : group.accent }} numberOfLines={1}>
                    {group.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {activeGroup.quests.length === 0 ? (
          totalOpen > 0 || reviewQuests.length > 0 || approvedQuests.length > 0 ? (
            <View style={{ borderRadius: 16, backgroundColor: cardBg, borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border,
              padding: 24, alignItems: 'center', gap: 6, ...(isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow) }}>
              <Text style={{ fontSize: 13, color: colors.textTertiary }}>Nothing here right now</Text>
            </View>
          ) : null
        ) : (
          <View style={{ backgroundColor: cardBg, borderRadius: 16,
            borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border,
            padding: 16, gap: 10, ...(isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow) }}>
            {activeGroup.quests.map((q, i) => (
              <View key={q.id} style={{ gap: 0 }}>
                <KidQuestCard q={q} active={active} members={members} allQuests={allQuests} colors={colors} isDark={isDark}
                  onClaim={onClaim} onStart={onStart} onSubmit={onSubmit}
                  onAcceptGpQuest={onAcceptGpQuest} onDeclineGpQuest={onDeclineGpQuest}
                  onOpenDetail={setDetailQuest} />
                {i < activeGroup.quests.length - 1 && (
                  <View style={{ height: 1, backgroundColor: colors.border, marginTop: 10 }} />
                )}
              </View>
            ))}
          </View>
        )}

      </ScrollView>

      <FullPageOverlay visible={showPropose} onDismiss={() => setShowPropose(false)} zIndex={60} backgroundColor={canvas}>
        {(requestAnimatedClose: () => void) => (
          <ChoreProposalPage active={active} members={members} familyId={familyId} onClose={requestAnimatedClose} />
        )}
      </FullPageOverlay>

      {/* Detail page is the SAME QuestDetailModal the Tasks tab/Parent side
          opens (features/quests/components/QuestDetailModal.tsx), not a
          separate kid-only implementation — two components independently
          rendering the same chore's submission/approval state was a real
          sync-drift source (e.g. an "Edit submission" flow built only on
          the kid-only copy, missing QuestDetailModal's already-existing
          chore_submissions history). QuestDetailModal reads activeMemberId
          from the store itself and derives its own actions via
          deriveQuestActions (features/tasks/lib/deriveCardActions.ts) —
          canApprove/canReopen already require isParentOrSenior, so it's
          safe to open here with no isParent/canEdit props (those only add
          parent-only extras like the activity log) [live direction: "use
          the tasks tab -> questcard -> questdetails page as common"].
          Landing page/cards above (KidQuestCard, claim/start/submit quick
          actions) are unchanged — only what opens on tap changes. */}
      {detailQuest && (
        <QuestDetailModal
          quest={allQuests.find(q => q.id === detailQuest.id) ?? detailQuest}
          onClose={() => setDetailQuest(null)}
        />
      )}
    </View>
  );
}
