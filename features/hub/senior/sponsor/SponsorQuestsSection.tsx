import { View, Text, Pressable } from 'react-native';
import { ChevronDown, Star, Coins, Users } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { withinLast24h } from '@/lib/dates';
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
  updateChore, updateMember, handleApproveAndCheer, handleRequestGpRedo,
  onOpenMatchModal, onOpenCreateQuestModal,
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
}) {
  const parents = members.filter(m => m.role === 'parent');
  const myMatches = grandparentMatches.filter(m => m.grandparentId === active.id && m.isActive);
  console.log(`[UserAction] FILTER screen=Hub role=senior member=${active.name} list=SponsorQuestsSection.myMatches totalSource=${grandparentMatches.length} afterFilter=${myMatches.length} [features/hub/senior/sponsor/SponsorQuestsSection.tsx:38]`);
  const mySponsored = (status?: ChoreTask['status']) => chores.filter(c =>
    c.categoryType === 'grandparent_quest' &&
    c.sponsorUserId === active.id &&
    (status ? c.status === status : true)
  );
  const awaitingParent = mySponsored('pending_parent_approval');
  const turnedDown = mySponsored('declined');
  const approvedWaitingClaim = mySponsored('todo');
  const inProgress = mySponsored('in_progress');
  console.log(`[UserAction] FILTER screen=Hub role=senior member=${active.name} list=SponsorQuestsSection.awaitingParent totalSource=${chores.length} afterFilter=${awaitingParent.length} [features/hub/senior/sponsor/SponsorQuestsSection.tsx:47]`);
  console.log(`[UserAction] FILTER screen=Hub role=senior member=${active.name} list=SponsorQuestsSection.turnedDown totalSource=${chores.length} afterFilter=${turnedDown.length} [features/hub/senior/sponsor/SponsorQuestsSection.tsx:47]`);
  console.log(`[UserAction] FILTER screen=Hub role=senior member=${active.name} list=SponsorQuestsSection.approvedWaitingClaim totalSource=${chores.length} afterFilter=${approvedWaitingClaim.length} [features/hub/senior/sponsor/SponsorQuestsSection.tsx:47]`);
  console.log(`[UserAction] FILTER screen=Hub role=senior member=${active.name} list=SponsorQuestsSection.inProgress totalSource=${chores.length} afterFilter=${inProgress.length} [features/hub/senior/sponsor/SponsorQuestsSection.tsx:47]`);
  // grandparentApproveAndCheer sets 'completed', not 'approved' — this
  // filter must include all three verified statuses or a GP's own verified
  // quests never show up here at all. Only shown on the Hub for 24h after
  // completion — the chore itself stays fully visible forever in the
  // Chores tab's own history/status tabs, this is just the Hub's
  // "recently done" glanceable view, same 24h window as the Cheer section.
  const done = chores.filter(c =>
    c.categoryType === 'grandparent_quest' &&
    c.sponsorUserId === active.id &&
    ['approved', 'auto_approved', 'completed'].includes(c.status) &&
    withinLast24h(c.approvedAt ?? c.reviewedAt ?? c.createdAt)
  );
  const totalSponsored = mySponsored().length;
  console.log(`[UserAction] FILTER screen=Hub role=senior member=${active.name} list=SponsorQuestsSection.done totalSource=${chores.length} afterFilter=${done.length} [features/hub/senior/sponsor/SponsorQuestsSection.tsx:60]`);

  return (
    <View style={{ paddingHorizontal: 16 }}>
      <SectionCard
        large
        icon={<Star size={18} color={BRAND.teal} />}
        title="Chores I Sponsor"
        subtitle={pendingGpApproval.length > 0
          ? `${pendingGpApproval.length} waiting for you to check`
          : 'Set up a chore or a savings match'}
        badge={(pendingGpApproval.length) || undefined} badgeColor={BRAND.teal}
        actionBtn={{ label: 'New Chore', onPress: () => { console.log(`[UserAction] screen=Hub role=senior member=${active.name} tapped "New Chore" on "Chores I Sponsor" → onOpenCreateQuestModal [features/hub/senior/sponsor/SponsorQuestsSection.tsx:72]`); onOpenCreateQuestModal(); } }}
        collapsible defaultExpanded={pendingGpApproval.length > 0}
        colors={colors} isDark={isDark}>

        {/* Match Setup shortcut */}
        <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=senior member=${active.name} tapped "Set up Savings Match" on "Chores I Sponsor" → onOpenMatchModal [features/hub/senior/sponsor/SponsorQuestsSection.tsx:77]`); onOpenMatchModal(); }}
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

        {/* Whose parent am I? — informational only (both parents can still
            review either side's GP quests), shown when there's more than
            one parent so it's actually ambiguous which side this GP is on. */}
        {parents.length > 1 && (
          <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: isDark ? colors.border : '#F1F5F9', marginBottom: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Users size={13} color={colors.textTertiary} />
              <Text style={{ fontSize: GP.sub, fontWeight: '700', color: colors.textSecondary }}>I'm whose parent?</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {parents.map(p => {
                const picked = active.linkedParentId === p.id;
                return (
                  <Pressable key={p.id} onPress={() => { console.log(`[UserAction] FORM screen=Hub role=senior member=${active.name} selected "${p.name.split(' ')[0]}" for "I'm whose parent?" on "Chores I Sponsor" → updateMember(linkedParentId) [features/hub/senior/sponsor/SponsorQuestsSection.tsx:103]`); updateMember(active.id, { linkedParentId: p.id }); }}
                    style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10,
                      borderWidth: 1.5, borderColor: picked ? BRAND.teal : (isDark ? colors.border : '#E2E8F0'),
                      backgroundColor: picked ? BRAND.teal + '15' : 'transparent' }}>
                    <Text style={{ fontSize: GP.body, fontWeight: '700', color: picked ? BRAND.teal : colors.textPrimary }}>
                      {p.name.split(' ')[0]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <MatchRulesCard myMatches={myMatches} kids={kids} colors={colors} isDark={isDark} />
        <AwaitingParentCard quests={awaitingParent} colors={colors} isDark={isDark} active={active} />
        <TurnedDownCard quests={turnedDown} members={members} colors={colors} isDark={isDark} updateChore={updateChore} active={active} />
        <ApprovedWaitingClaimCard quests={approvedWaitingClaim} kids={kids} colors={colors} isDark={isDark} />
        <InProgressCard quests={inProgress} kids={kids} colors={colors} isDark={isDark} active={active} />
        <PendingVerifyCheerCard
          pendingGpApproval={pendingGpApproval} allChores={chores} kids={kids} allNames={allNames}
          colors={colors} isDark={isDark} cheerSticker={cheerSticker} setCheerSticker={setCheerSticker}
          onApproveAndCheer={handleApproveAndCheer} onRequestRedo={handleRequestGpRedo} members={members} active={active} />
        <CompletedCard done={done} allChores={chores} kids={kids} allNames={allNames} colors={colors} isDark={isDark} active={active} />

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
