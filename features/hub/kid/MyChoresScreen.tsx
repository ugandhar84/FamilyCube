import { useRef, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Platform, PanResponder } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClipboardList, Plus } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { GEMINI } from '@/constants/geminiRhythm';
import { PageHeading } from '@/components/PageHeading';
import FullPageOverlay from '@/components/FullPageOverlay';
import { hideTabBar, showTabBar } from '@/lib/tabBarVisibility';
import { useUIStore } from '@/store/uiStore';
import { KidQuestCard } from './KidQuestCard';
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
  todoQuests, inProgressQuests, reviewQuests, declinedQuests, approvedQuests, allQuests,
  colors, isDark,
  onClaim, onStart, onSubmit, onAcceptGpQuest, onDeclineGpQuest,
}: {
  onClose: () => void;
  active: FamilyMember; members: FamilyMember[]; familyId: string;
  todoQuests: Quest[]; inProgressQuests: Quest[]; reviewQuests: Quest[];
  declinedQuests: Quest[]; approvedQuests: Quest[]; allQuests: Quest[];
  colors: any; isDark: boolean;
  onClaim: (id: string) => void;
  onStart: (id: string) => void;
  onSubmit: (q: Quest) => void;
  onAcceptGpQuest: (id: string) => void;
  onDeclineGpQuest: (q: Quest) => void;
}) {
  const insets = useSafeAreaInsets();
  const canvas = isDark ? colors.background : GEMINI.canvas;
  const cardBg = isDark ? colors.card : GEMINI.cardBg;

  const [showPropose, setShowPropose] = useState(false);

  useEffect(() => {
    if (showPropose) hideTabBar();
    // Don't showTabBar here when closing — this screen's own parent
    // overlay keeps the tab bar hidden for as long as THIS screen is open.
  }, [showPropose]);

  const subPageOpen = useRef(false);
  useEffect(() => { subPageOpen.current = showPropose; }, [showPropose]);

  const swipePan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) =>
      !subPageOpen.current && g.dx > 10 && Math.abs(g.dy) < 40 && g.moveX - g.dx < 30,
    onPanResponderRelease: (_, g) => {
      if (!subPageOpen.current && (g.dx > 100 || g.vx > 0.8)) onClose();
    },
  })).current;

  const groups: { key: string; label: string; quests: Quest[]; accent: 'teal' | 'amber' | 'primary' }[] = [
    { key: 'todo',     label: 'To Do',          quests: [...todoQuests, ...inProgressQuests, ...declinedQuests], accent: 'teal' },
    { key: 'review',   label: 'Pending Review', quests: reviewQuests,   accent: 'amber' },
    { key: 'done',     label: 'Completed',      quests: approvedQuests, accent: 'primary' },
  ];
  const totalOpen = todoQuests.length + inProgressQuests.length + declinedQuests.length;

  return (
    <View style={{ flex: 1, backgroundColor: canvas }} {...swipePan.panHandlers}>
      <View style={{ backgroundColor: canvas }}>
        <PageHeading
          eyebrow="MY CHORES"
          title="Chores"
          subtitle="What's left, what's waiting, and what you've finished."
          accent="teal"
          Icon={ClipboardList}
          onTitlePress={onClose}
          topInset={insets.top}
        />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: insets.bottom + 32 }}>

        {/* ── Propose a Chore banner ── */}
        <Pressable
          onPress={() => setShowPropose(true)}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', gap: 14,
            backgroundColor: colors.tealLight, borderRadius: 20, padding: 18,
            opacity: pressed ? 0.88 : 1,
            ...Platform.select({
              ios: { shadowColor: colors.navy, shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDark ? 0.22 : 0.10, shadowRadius: 14 },
              android: { elevation: 4 },
            }),
          })}
        >
          <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: isDark ? colors.surface : 'rgba(255,255,255,0.75)', alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={26} color={colors.teal} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: isDark ? colors.textPrimary : GEMINI.titleColor }}>Propose a Chore</Text>
            <Text style={{ fontSize: 13, color: isDark ? colors.textSecondary : GEMINI.bodyColor }}>Suggest one for yourself or a sibling</Text>
          </View>
          <Text style={{ fontSize: 22, color: colors.teal }}>›</Text>
        </Pressable>

        {totalOpen === 0 && reviewQuests.length === 0 && approvedQuests.length === 0 && (
          <View style={{ borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.teal + '50',
            backgroundColor: colors.tealLight, padding: 28, alignItems: 'center', gap: 8 }}>
            <ClipboardList size={36} color={colors.teal} />
            <Text style={{ fontSize: 17, fontWeight: '900', color: colors.teal, marginTop: 4 }}>All caught up!</Text>
            <Text style={{ fontSize: 13, color: colors.textTertiary, textAlign: 'center' }}>Propose a chore above to get started</Text>
          </View>
        )}

        {groups.filter(g => g.quests.length > 0).map(group => (
          <View key={group.key} style={{ backgroundColor: cardBg, borderRadius: 18, padding: 16, gap: 10,
            ...Platform.select({
              ios: { shadowColor: colors.navy, shadowOffset: { width: 0, height: 2 }, shadowOpacity: isDark ? 0.16 : 0.07, shadowRadius: 10 },
              android: { elevation: 2 },
            }) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.textTertiary }}>
                {group.label}
              </Text>
              <View style={{ backgroundColor: colors[group.accent] + '20', borderRadius: 10, minWidth: 22, paddingHorizontal: 7, paddingVertical: 2, alignItems: 'center' }}>
                <Text style={{ fontSize: 11, fontWeight: '900', color: colors[group.accent] }}>{group.quests.length}</Text>
              </View>
            </View>
            {group.quests.map((q, i) => (
              <View key={q.id} style={{ gap: 0 }}>
                <KidQuestCard q={q} active={active} members={members} allQuests={allQuests} colors={colors} isDark={isDark}
                  onClaim={onClaim} onStart={onStart} onSubmit={onSubmit}
                  onAcceptGpQuest={onAcceptGpQuest} onDeclineGpQuest={onDeclineGpQuest} />
                {i < group.quests.length - 1 && (
                  <View style={{ height: 1, backgroundColor: colors.border, marginTop: 10 }} />
                )}
              </View>
            ))}
          </View>
        ))}

      </ScrollView>

      <FullPageOverlay visible={showPropose} onDismiss={() => setShowPropose(false)} zIndex={60} backgroundColor={canvas}>
        {(requestAnimatedClose: () => void) => (
          <ChoreProposalPage active={active} members={members} familyId={familyId} onClose={requestAnimatedClose} />
        )}
      </FullPageOverlay>
    </View>
  );
}
