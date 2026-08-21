import { View, Text } from 'react-native';
import { ClipboardList, Car, PartyPopper } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { SectionCard } from '../hubComponents';
import { useChoreStore } from '@/store/choreStore';
import { MyAdultQuestCard } from './backlog/MyAdultQuestCard';
import { OthersAdultQuestCard } from './backlog/OthersAdultQuestCard';
import { DirectPendingCard } from './backlog/DirectPendingCard';
import { OutgoingPendingCard } from './backlog/OutgoingPendingCard';
import { LockedAssignmentCard } from './backlog/LockedAssignmentCard';
import { PoolQuestCard } from './backlog/PoolQuestCard';
import { HelperEventCard } from './backlog/HelperEventCard';
import { RideCoordinationRow } from './backlog/RideCoordinationRow';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';
import type { Quest } from '@/store/questStore';
import type { ChoreTask, ParentQuestAssignment } from '@/store/choreStore';

export function HouseholdBacklogSection({
  active, members, colors, isDark,
  questPool, myAdultQuests, othersAdultQuests, myDirectPending, myLockedItems, myOutgoingPending, myHelperEvents,
  familyRideCoordination,
  systemBIds, parentAssignments,
  updateQuest, updateEvent, updateEventScoped, completeParentQuest, respondToParentQuest, cancelLockedAssignment, recallParentQuest, appreciationPing, handlePullTask,
  onAddTask, onDelegate, onRespond,
}: {
  active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean;
  questPool: (ChoreTask & { _isQuestRow?: boolean })[];
  myAdultQuests: Quest[]; othersAdultQuests: Quest[];
  myDirectPending: ParentQuestAssignment[]; myLockedItems: ParentQuestAssignment[];
  myOutgoingPending: ParentQuestAssignment[];
  myHelperEvents: FamilyEvent[];
  // Read-only — a co-parent's ride still finding a driver. Optional so any
  // call site not yet updated still compiles.
  familyRideCoordination?: FamilyEvent[];
  systemBIds: Set<string>; parentAssignments: ParentQuestAssignment[];
  updateQuest: (id: string, patch: Partial<Quest>) => void;
  updateEvent: (id: string, patch: Partial<FamilyEvent>) => void;
  updateEventScoped?: (id: string, patch: Partial<FamilyEvent>, scope: 'this' | 'following' | 'all') => void;
  completeParentQuest: (assignmentId: string, completedBy: string) => void;
  respondToParentQuest: (id: string, response: { action: 'ACCEPT' }) => void;
  cancelLockedAssignment: (assignmentId: string) => void;
  recallParentQuest: (assignmentId: string, recallerId: string) => void;
  appreciationPing: (assignmentId: string, fromId: string, message: string) => void;
  handlePullTask: (chore: ChoreTask) => void;
  onAddTask: () => void;
  onDelegate: (choreId: string, title: string) => void;
  onRespond: (assignmentId: string, choreTitle: string, assignedBy: string, assignedTo: string) => void;
}) {
  // Opens by default only when there's something pending on THIS parent —
  // their own claimed items, the open pool, or a helper request — not just
  // because someone else's spouse has a task sitting there. SectionCard's
  // expand state is uncontrolled (read once via defaultExpanded), so this
  // is computed up front instead of an effect that flips it open later.
  // Raw chore list — questPool deliberately excludes anything with a live
  // System-A assignment (PENDING/SNOOZED/locked), so cards for those states
  // (DirectPendingCard, the locked box, OutgoingPendingCard) have to look
  // the chore up here instead, or their title/description/due date would
  // resolve to nothing now that they're correctly out of the open pool.
  const allChores = useChoreStore(s => s.chores);

  const myPendingCount = questPool.length + myAdultQuests.length + myHelperEvents.length
    + myDirectPending.length + myLockedItems.length + myOutgoingPending.length;

  const badgeCount = questPool.length + myAdultQuests.length + othersAdultQuests.length + myHelperEvents.length
    + myDirectPending.length + myLockedItems.length + myOutgoingPending.length;
  const unclaimedPool = questPool.filter(c =>
    !systemBIds.has(c.id) &&
    !parentAssignments.find(a => a.choreId === c.id && a.status !== 'COMPLETED' && a.status !== 'DECLINED')
  );
  // Was missing othersAdultQuests and myAdultQuests from this sum — the
  // "🎉 Backlog is clear" empty state rendered directly underneath a real
  // card (e.g. "Assigned to others" showing a live delegation with Nudge/
  // Reclaim actions) whenever every OTHER tracked list happened to be
  // empty, even though the section visibly had content.
  const isEmpty = questPool.length === 0 && myDirectPending.length === 0
    && myHelperEvents.length === 0 && myLockedItems.length === 0 && myOutgoingPending.length === 0
    && othersAdultQuests.length === 0 && myAdultQuests.length === 0
    && !familyRideCoordination?.length;

  // Soonest due date first within a group — undated items sort last so
  // something with a deadline never gets buried under whatever loaded first.
  const byDueDate = <T extends { dueDate?: string }>(items: T[]): T[] =>
    [...items].sort((a, b) => (a.dueDate ?? '9999') < (b.dueDate ?? '9999') ? -1 : 1);
  const sortedMyAdultQuests = byDueDate(myAdultQuests);
  const sortedUnclaimedPool = byDueDate(unclaimedPool);

  return (
    <View style={{ paddingHorizontal: 16 }}>
      <SectionCard
        icon={<ClipboardList size={16} color={colors.warning} />}
        title="Household Backlog"
        subtitle="pull what you can handle"
        accent={colors.warning}
        badge={badgeCount} badgeLabel="Active" badgeColor={colors.warning}
        // Was `myPendingCount > 0` — that count excludes othersAdultQuests
        // and familyRideCoordination, both of which render real visible
        // content in this card (an "Assigned to others" delegation, a
        // family ride coordination row) — so a parent could see genuine
        // content here yet the section still defaulted to collapsed. Use
        // the same !isEmpty check the card's own render logic uses, so
        // "has content" and "expanded by default" always agree.
        collapsible defaultExpanded={!isEmpty}
        colors={colors} isDark={isDark}>
        <View style={{ gap: 8 }}>
            {myAdultQuests.length > 0 && (
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.primary, marginBottom: 2 }}>Assigned to you</Text>
                {sortedMyAdultQuests.map(q => (
                  <MyAdultQuestCard key={q.id} q={q} parentAssignments={parentAssignments} active={active} members={members}
                    colors={colors} isDark={isDark} completeParentQuest={completeParentQuest}
                    updateQuest={updateQuest} onDelegate={onDelegate} />
                ))}
              </View>
            )}

            {othersAdultQuests.length > 0 && (
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, marginBottom: 2 }}>Assigned to others</Text>
                {othersAdultQuests.map(q => (
                  <OthersAdultQuestCard key={q.id} q={q} active={active} members={members} colors={colors} isDark={isDark} updateQuest={updateQuest} />
                ))}
              </View>
            )}

            {myDirectPending.length > 0 && (
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.warning, marginBottom: 2 }}>Assigned to you — needs response</Text>
                {myDirectPending.map(a => {
                  const chore = allChores.find(c => c.id === a.choreId);
                  if (!chore) return null;
                  return (
                    <DirectPendingCard key={a.id} a={a} chore={chore} members={members} colors={colors} isDark={isDark}
                      respondToParentQuest={respondToParentQuest} onRespond={onRespond} />
                  );
                })}
              </View>
            )}

            {myOutgoingPending.length > 0 && (
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textTertiary, marginBottom: 2 }}>Waiting on response</Text>
                {myOutgoingPending.map(a => {
                  const chore = allChores.find(c => c.id === a.choreId);
                  if (!chore) return null;
                  return (
                    <OutgoingPendingCard key={a.id} a={a} chore={chore} members={members} active={active} colors={colors} isDark={isDark}
                      onRecall={a.status === 'PENDING' ? () => recallParentQuest(a.id, active.id) : undefined} />
                  );
                })}
              </View>
            )}

            {myLockedItems.map(a => {
              const chore = allChores.find(c => c.id === a.choreId);
              if (!chore) return null;
              return (
                <LockedAssignmentCard key={a.id} a={a} chore={chore} active={active} members={members}
                  colors={colors} isDark={isDark} onDelegate={onDelegate}
                  cancelLockedAssignment={cancelLockedAssignment} />
              );
            })}

            {sortedUnclaimedPool.map(chore => (
              <PoolQuestCard key={chore.id} chore={chore} members={members} colors={colors} isDark={isDark}
                onTakeIt={(c) => {
                  if ((c as any)._isQuestRow) {
                    updateQuest(c.id, { assignedToId: active.id, status: 'in_progress' } as any);
                    useChoreStore.getState().updateChore(c.id, { isPool: false });
                  } else {
                    handlePullTask(c);
                  }
                }}
                onDelegate={onDelegate} />
            ))}

            {myHelperEvents.length > 0 && (
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                  <Car size={12} color={colors.parent} />
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.parent }}>You're the driver / helper</Text>
                </View>
                {myHelperEvents.map(ev => (
                  <HelperEventCard key={ev.id} ev={ev} members={members} active={active} colors={colors} isDark={isDark} updateEvent={updateEvent} updateEventScoped={updateEventScoped} />
                ))}
              </View>
            )}

            {!!familyRideCoordination?.length && (
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                  <Car size={12} color={colors.textTertiary} />
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textTertiary }}>Family ride status</Text>
                </View>
                {familyRideCoordination.map(ev => (
                  <RideCoordinationRow key={ev.id} ev={ev} members={members} colors={colors} isDark={isDark} />
                ))}
              </View>
            )}

            {isEmpty && (
              <View style={{ alignItems: 'center', paddingVertical: 12, gap: 4 }}>
                <PartyPopper size={18} color={colors.textTertiary} />
                <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, textAlign: 'center' }}>
                  Backlog is clear
                </Text>
              </View>
            )}
        </View>
      </SectionCard>
    </View>
  );
}
