import { useState, useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { ChevronUp, ChevronDown, ClipboardList, AlertCircle, Car, PartyPopper } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import { useChoreStore } from '@/store/choreStore';
import { MyAdultQuestCard } from './backlog/MyAdultQuestCard';
import { OthersAdultQuestCard } from './backlog/OthersAdultQuestCard';
import { DirectPendingCard } from './backlog/DirectPendingCard';
import { AcceptedQuestCard } from './backlog/AcceptedQuestCard';
import { PoolQuestCard } from './backlog/PoolQuestCard';
import { HelperEventCard } from './backlog/HelperEventCard';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';
import type { Quest } from '@/store/questStore';
import type { ChoreTask, ParentQuestAssignment } from '@/store/choreStore';

export function HouseholdBacklogSection({
  active, members, colors, isDark,
  questPool, myAdultQuests, othersAdultQuests, myDirectPending, myLockedItems, myAccepted, myHelperEvents,
  systemBIds, parentAssignments,
  updateQuest, updateEvent, completeParentQuest, respondToParentQuest, appreciationPing, handlePullTask,
  onAddTask, onDelegate, onRespond,
}: {
  active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean;
  questPool: (ChoreTask & { _isQuestRow?: boolean })[];
  myAdultQuests: Quest[]; othersAdultQuests: Quest[];
  myDirectPending: ParentQuestAssignment[]; myLockedItems: ParentQuestAssignment[]; myAccepted: ParentQuestAssignment[];
  myHelperEvents: FamilyEvent[];
  systemBIds: Set<string>; parentAssignments: ParentQuestAssignment[];
  updateQuest: (id: string, patch: Partial<Quest>) => void;
  updateEvent: (id: string, patch: Partial<FamilyEvent>) => void;
  completeParentQuest: (assignmentId: string, completedBy: string) => void;
  respondToParentQuest: (id: string, response: { action: 'ACCEPT' }) => void;
  appreciationPing: (assignmentId: string, fromId: string, message: string) => void;
  handlePullTask: (chore: ChoreTask) => void;
  onAddTask: () => void;
  onDelegate: (choreId: string, title: string) => void;
  onRespond: (assignmentId: string, choreTitle: string) => void;
}) {
  // Auto-opens only when there's something pending on THIS parent — their own
  // claimed items, the open pool, or a helper request — not just because
  // someone else's spouse has a task sitting there.
  const [expanded, setExpanded] = useState(false);
  const myPendingCount = questPool.length + myAdultQuests.length + myHelperEvents.length
    + myDirectPending.length + myAccepted.length + myLockedItems.length;
  useEffect(() => {
    if (myPendingCount > 0) setExpanded(true);
  }, [myPendingCount > 0]);

  const badgeCount = questPool.length + myAdultQuests.length + othersAdultQuests.length + myHelperEvents.length;
  const unclaimedPool = questPool.filter(c =>
    !systemBIds.has(c.id) &&
    !parentAssignments.find(a => a.choreId === c.id && a.status !== 'COMPLETED' && a.status !== 'DECLINED')
  );
  const isEmpty = questPool.length === 0 && myDirectPending.length === 0 && myAccepted.length === 0 && myHelperEvents.length === 0;

  // Soonest due date first within a group — undated items sort last so
  // something with a deadline never gets buried under whatever loaded first.
  const byDueDate = <T extends { dueDate?: string }>(items: T[]): T[] =>
    [...items].sort((a, b) => (a.dueDate ?? '9999') < (b.dueDate ?? '9999') ? -1 : 1);
  const sortedMyAdultQuests = byDueDate(myAdultQuests);
  const sortedUnclaimedPool = byDueDate(unclaimedPool);

  return (
    <View style={{ paddingHorizontal: 16 }}>
      <View style={{
        backgroundColor: colors.card,
        borderRadius: 20, borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0',
        overflow: 'hidden', marginBottom: 12,
      }}>
        <Pressable onPress={() => setExpanded(e => !e)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, paddingBottom: 12 }}>
          <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: BRAND.purple + '20', alignItems: 'center', justifyContent: 'center' }}>
            <ClipboardList size={18} color={BRAND.purple} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>Household Backlog</Text>
              {badgeCount > 0 && (
                <View style={{ backgroundColor: BRAND.purple, borderRadius: 10, minWidth: 20, paddingHorizontal: 6, paddingVertical: 2, alignItems: 'center' }}>
                  <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: '#fff' }}>{badgeCount}</Text>
                </View>
              )}
            </View>
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 1 }}>
              pull what you can handle
            </Text>
          </View>
          <Pressable onPress={onAddTask}
            style={{ backgroundColor: BRAND.purple, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, marginRight: 6 }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>+ Add</Text>
          </Pressable>
          {expanded ? <ChevronUp size={16} color={colors.textTertiary} /> : <ChevronDown size={16} color={colors.textTertiary} />}
        </Pressable>

        {expanded && (
          <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 8 }}>
            {myAdultQuests.length > 0 && (
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.purple, marginBottom: 2 }}>Assigned to you</Text>
                {sortedMyAdultQuests.map(q => (
                  <MyAdultQuestCard key={q.id} q={q} parentAssignments={parentAssignments} active={active}
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
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.amber, marginBottom: 2 }}>Assigned to you — needs response</Text>
                {myDirectPending.map(a => {
                  const chore = questPool.find(c => c.id === a.choreId);
                  if (!chore) return null;
                  return (
                    <DirectPendingCard key={a.id} a={a} chore={chore} members={members} colors={colors} isDark={isDark}
                      respondToParentQuest={respondToParentQuest} onRespond={onRespond} />
                  );
                })}
              </View>
            )}

            {myLockedItems.map(a => {
              const chore = questPool.find(c => c.id === a.choreId);
              if (!chore) return null;
              return (
                <View key={a.id} style={{
                  borderRadius: 14, borderWidth: 1.5, borderColor: `${colors.danger}40`,
                  backgroundColor: isDark ? `${colors.danger}10` : '#FEF2F2', padding: 12, flexDirection: 'row', gap: 10, alignItems: 'center',
                }}>
                  <AlertCircle size={16} color={colors.danger} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{chore.title}</Text>
                    <Text style={{ fontSize: TYPO.label, color: colors.danger, marginTop: 2 }}>Discuss offline — bounced twice</Text>
                  </View>
                </View>
              );
            })}

            {myAccepted.map(a => {
              const chore = questPool.find(c => c.id === a.choreId);
              if (!chore) return null;
              return (
                <AcceptedQuestCard key={a.id} a={a} chore={chore} active={active} colors={colors} isDark={isDark}
                  completeParentQuest={completeParentQuest} appreciationPing={appreciationPing} />
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
                  <Car size={12} color={BRAND.teal} />
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.teal }}>You're the driver / helper</Text>
                </View>
                {myHelperEvents.map(ev => (
                  <HelperEventCard key={ev.id} ev={ev} members={members} active={active} colors={colors} isDark={isDark} updateEvent={updateEvent} />
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
        )}
      </View>
    </View>
  );
}
