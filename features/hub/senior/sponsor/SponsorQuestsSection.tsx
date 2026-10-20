import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { ChevronDown, Star, Coins } from 'lucide-react-native';
import { GEMINI } from '@/constants/geminiRhythm';
import { RHYTHM } from '@/constants/theme';
import { GP } from '../seniorTheme';
import { MatchRulesCard } from './MatchRulesCard';
import { AwaitingParentCard } from './AwaitingParentCard';
import { TurnedDownCard } from './TurnedDownCard';
import { ApprovedWaitingClaimCard } from './ApprovedWaitingClaimCard';
import { InProgressCard } from './InProgressCard';
import { PendingVerifyCheerCard } from './PendingVerifyCheerCard';
import { CompletedCard } from './CompletedCard';
import type { FamilyMember } from '@/store/familyStore';
import type { ChoreTask, GrandparentMatch } from '@/store/choreStore';

type Tab = 'check' | 'waiting' | 'active' | 'done' | 'declined';
const TABS: { key: Tab; label: string }[] = [
  { key: 'check', label: 'To check' }, { key: 'waiting', label: 'Waiting' }, { key: 'active', label: 'Active' },
  { key: 'done', label: 'Done' }, { key: 'declined', label: 'Turned down' },
];

// Quests I Sponsor — the grandparent's own quest hub: savings match setup +
// the full lifecycle of grandparent-sponsored quests (awaiting parent gate,
// turned down, approved/waiting claim, in progress, pending verify, done).
export function SponsorQuestsSection({
  active, kids, members, allNames, colors, isDark,
  chores, grandparentMatches, pendingGpApproval,
  cheerSticker, setCheerSticker,
  updateChore, updateMember, handleApproveAndCheer, handleRequestGpRedo,
  onOpenMatchModal, onOpenCreateQuestModal, onEditQuest,
}: {
  active: FamilyMember; kids: FamilyMember[]; members: FamilyMember[]; allNames: string[]; colors: any; isDark: boolean;
  chores: ChoreTask[]; grandparentMatches: GrandparentMatch[]; pendingGpApproval: ChoreTask[];
  cheerSticker: string; setCheerSticker: (s: string) => void;
  updateChore: (id: string, patch: Partial<ChoreTask>) => void;
  updateMember: (id: string, updates: Partial<FamilyMember>) => void;
  handleApproveAndCheer: (choreId: string) => void;
  handleRequestGpRedo: (choreId: string, reason: string) => void;
  onOpenMatchModal: () => void;
  onOpenCreateQuestModal: () => void;
  onEditQuest?: (c: ChoreTask) => void;
}) {
  const myMatches = grandparentMatches.filter(m => m.grandparentId === active.id && m.isActive);
  const mySponsored = (statuses: string[]) => chores.filter(c =>
    c.categoryType === 'grandparent_quest' && c.sponsorUserId === active.id && statuses.includes(c.status));
  const awaitingParent = mySponsored(['pending_parent_approval']);
  const approvedWaitingClaim = mySponsored(['todo']);
  const inProgress = mySponsored(['in_progress', 'pending_approval', 'redo_requested']);
  const turnedDown = mySponsored(['declined']);
  // grandparentApproveAndCheer sets 'completed', not 'approved' — all three verified statuses count.
  const done = mySponsored(['approved', 'auto_approved', 'completed']);
  const counts: Record<Tab, number> = {
    check: pendingGpApproval.length, waiting: awaitingParent.length + approvedWaitingClaim.length,
    active: inProgress.length, done: done.length, declined: turnedDown.length,
  };
  const firstWithItems = (TABS.find(t => counts[t.key] > 0)?.key ?? 'waiting') as Tab;
  const [tab, setTab] = useState<Tab | null>(null);
  const cur: Tab = tab ?? firstWithItems;
  const title = isDark ? colors.textPrimary : GEMINI.titleColor;
  const body = isDark ? colors.textSecondary : GEMINI.bodyColor;
  const cardBg = isDark ? colors.card : GEMINI.cardBg;
  const shadow = isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <View style={{ gap: RHYTHM.item }}>
      {/* Banner: start a new sponsored chore. */}
      <Pressable onPress={onOpenCreateQuestModal} accessibilityRole="button" accessibilityLabel="Sponsor a new chore"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: RHYTHM.card, borderRadius: 22, backgroundColor: colors.tealLight,
          borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border, ...shadow }}>
        <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: cardBg, alignItems: 'center', justifyContent: 'center' }}>
          <Star size={26} color={colors.teal} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: GP.title, fontWeight: '800', color: title }}>Sponsor a chore</Text>
          <Text style={{ fontSize: GP.sub, fontWeight: '600', color: body, marginTop: 2 }}>Set a challenge and a reward for a grandchild.</Text>
        </View>
        <View style={{ paddingHorizontal: 16, minHeight: 44, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: GP.sub, fontWeight: '800', color: colors.textInverse }}>New chore</Text>
        </View>
      </Pressable>

      <Pressable onPress={onOpenMatchModal} accessibilityRole="button" accessibilityLabel="Set up savings match"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: RHYTHM.card, borderRadius: 18, backgroundColor: cardBg, ...shadow }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.pinkLight, alignItems: 'center', justifyContent: 'center' }}>
          <Coins size={18} color={colors.pink} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: GP.body, fontWeight: '800', color: title }}>Savings match</Text>
          <Text style={{ fontSize: GP.sub, fontWeight: '600', color: body }}>Match a % or fixed amount when kids save</Text>
        </View>
        <ChevronDown size={16} color={colors.textTertiary} />
      </Pressable>
      <MatchRulesCard myMatches={myMatches} kids={kids} colors={colors} isDark={isDark} />

      <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', color: isDark ? colors.textTertiary : GEMINI.bodyColorLight }}>My sponsored chores</Text>
      <View style={{ flexDirection: 'row', gap: 4, backgroundColor: colors.surface, borderRadius: 16, padding: 4 }}>
        {TABS.map(t => {
          const on = cur === t.key;
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)} accessibilityRole="button" accessibilityLabel={`${t.label} ${counts[t.key]}`}
              style={{ flex: 1, minHeight: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2, backgroundColor: on ? colors.card : 'transparent' }}>
              <Text style={{ fontSize: 11, fontWeight: on ? '800' : '600', color: on ? colors.textPrimary : colors.textSecondary }} numberOfLines={1}>
                {t.label}{counts[t.key] > 0 ? ` ${counts[t.key]}` : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {counts[cur] === 0 && (
        <View style={{ backgroundColor: cardBg, borderRadius: 18, padding: RHYTHM.card, alignItems: 'center', gap: 6, ...shadow }}>
          {total === 0 && <Text style={{ fontSize: 30 }}>🌟</Text>}
          <Text style={{ fontSize: GP.sub, fontWeight: '700', color: body, textAlign: 'center', lineHeight: 20 }}>
            {total === 0 ? 'Create in-person or video-call chores: cook together, tell family stories, quiz them before exams.'
              : { check: 'Nothing waiting for you to check.', waiting: 'Nothing waiting on a parent or a grandchild.', active: 'Nothing in progress.', done: 'Nothing completed yet.', declined: 'Nothing turned down.' }[cur]}
          </Text>
        </View>
      )}

      {cur === 'check' && (
        <PendingVerifyCheerCard
          pendingGpApproval={pendingGpApproval} allChores={chores} kids={kids} allNames={allNames}
          colors={colors} isDark={isDark} cheerSticker={cheerSticker} setCheerSticker={setCheerSticker}
          onApproveAndCheer={handleApproveAndCheer} onRequestRedo={handleRequestGpRedo} members={members} active={active} />
      )}
      {cur === 'waiting' && (
        <>
          <AwaitingParentCard quests={awaitingParent} colors={colors} isDark={isDark} active={active} onEdit={onEditQuest} />
          <ApprovedWaitingClaimCard quests={approvedWaitingClaim} kids={kids} colors={colors} isDark={isDark} />
        </>
      )}
      {cur === 'active' && <InProgressCard quests={inProgress} kids={kids} colors={colors} isDark={isDark} active={active} />}
      {cur === 'done' && <CompletedCard done={done} allChores={chores} kids={kids} allNames={allNames} colors={colors} isDark={isDark} active={active} />}
      {cur === 'declined' && <TurnedDownCard quests={turnedDown} members={members} colors={colors} isDark={isDark} updateChore={updateChore} active={active} />}
    </View>
  );
}
