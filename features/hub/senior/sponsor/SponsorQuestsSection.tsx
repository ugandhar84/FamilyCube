import { View, Text, Pressable } from 'react-native';
import { ChevronDown, Star, Coins } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { SectionCard } from '../../hubComponents';
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

// Quests I Sponsor — the grandparent's own quest hub: savings match setup +
// the full lifecycle of grandparent-sponsored quests (awaiting parent gate,
// turned down, approved/waiting claim, in progress, pending verify, done).
export function SponsorQuestsSection({
  active, kids, members, allNames, colors, isDark,
  chores, grandparentMatches, pendingGpApproval,
  cheerSticker, setCheerSticker,
  updateChore, handleApproveAndCheer,
  onOpenMatchModal, onOpenCreateQuestModal,
}: {
  active: FamilyMember; kids: FamilyMember[]; members: FamilyMember[]; allNames: string[]; colors: any; isDark: boolean;
  chores: ChoreTask[]; grandparentMatches: GrandparentMatch[]; pendingGpApproval: ChoreTask[];
  cheerSticker: string; setCheerSticker: (s: string) => void;
  updateChore: (id: string, patch: Partial<ChoreTask>) => void;
  handleApproveAndCheer: (choreId: string) => void;
  onOpenMatchModal: () => void;
  onOpenCreateQuestModal: () => void;
}) {
  const myMatches = grandparentMatches.filter(m => m.grandparentId === active.id && m.isActive);
  const mySponsored = (status?: ChoreTask['status']) => chores.filter(c =>
    c.categoryType === 'grandparent_quest' &&
    c.sponsorUserId === active.id &&
    (status ? c.status === status : true)
  );
  const awaitingParent = mySponsored('pending_parent_approval');
  const turnedDown = mySponsored('declined');
  const approvedWaitingClaim = mySponsored('todo');
  const inProgress = mySponsored('in_progress');
  // grandparentApproveAndCheer sets 'completed', not 'approved' — this
  // filter must include all three verified statuses or a GP's own verified
  // quests never show up here at all.
  const done = chores.filter(c =>
    c.categoryType === 'grandparent_quest' &&
    c.sponsorUserId === active.id &&
    ['approved', 'auto_approved', 'completed'].includes(c.status)
  );
  const totalSponsored = mySponsored().length;

  return (
    <View style={{ paddingHorizontal: 16 }}>
      <SectionCard
        large
        icon={<Star size={18} color={BRAND.teal} />}
        title="Quests I Sponsor"
        subtitle={pendingGpApproval.length > 0
          ? `${pendingGpApproval.length} waiting for you to check`
          : 'Set up a quest or a savings match'}
        badge={(pendingGpApproval.length) || undefined} badgeColor={BRAND.teal}
        actionBtn={{ label: 'New Quest', onPress: onOpenCreateQuestModal }}
        collapsible defaultExpanded={pendingGpApproval.length > 0}
        colors={colors} isDark={isDark}>

        {/* Match Setup shortcut */}
        <Pressable onPress={onOpenMatchModal}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14,
            borderBottomWidth: 1, borderBottomColor: isDark ? colors.border : '#F1F5F9', marginBottom: 4 }}>
          <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: BRAND.purple + '20', alignItems: 'center', justifyContent: 'center' }}>
            <Coins size={16} color={BRAND.purple} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: GP.body, fontWeight: '700', color: colors.textPrimary }}>Set up Savings Match</Text>
            <Text style={{ fontSize: GP.sub, color: colors.textSecondary }}>Match a % or fixed amount when kids save</Text>
          </View>
          <ChevronDown size={14} color={colors.textTertiary} />
        </Pressable>

        <MatchRulesCard myMatches={myMatches} kids={kids} colors={colors} isDark={isDark} />
        <AwaitingParentCard quests={awaitingParent} colors={colors} isDark={isDark} />
        <TurnedDownCard quests={turnedDown} members={members} colors={colors} isDark={isDark} updateChore={updateChore} />
        <ApprovedWaitingClaimCard quests={approvedWaitingClaim} kids={kids} colors={colors} isDark={isDark} />
        <InProgressCard quests={inProgress} kids={kids} colors={colors} isDark={isDark} />
        <PendingVerifyCheerCard
          pendingGpApproval={pendingGpApproval} allChores={chores} kids={kids} allNames={allNames}
          colors={colors} isDark={isDark} cheerSticker={cheerSticker} setCheerSticker={setCheerSticker}
          onApproveAndCheer={handleApproveAndCheer} members={members} />
        <CompletedCard done={done} allChores={chores} kids={kids} allNames={allNames} colors={colors} isDark={isDark} />

        {/* Empty state */}
        {totalSponsored === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 18, gap: 8 }}>
            <Text style={{ fontSize: 32 }}>🌟</Text>
            <Text style={{ fontSize: GP.body, fontWeight: '800', color: colors.textPrimary }}>Sponsor a Connection Quest</Text>
            <Text style={{ fontSize: GP.sub, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 }}>
              Create in-person or virtual quests — cook together, tell family stories, quiz them before exams.
            </Text>
          </View>
        )}
      </SectionCard>
    </View>
  );
}
