/**
 * KidProposalReviewScreen — parent reviews kid-proposed chores/quests.
 *
 * Shows two sections:
 *  1. "Proposed chores" — pending_kid_proposal items with citizenship/routine/shopping category
 *  2. "Proposed quests" — pending_kid_proposal items with bounty/grandparent_quest category
 *
 * Calls approveKidProposedChore / declineKidProposedChore from choreStore.
 */
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useChoreStore, type ChoreTask } from '@/store/choreStore';
import { useFamilyStore, type FamilyMember } from '@/store/familyStore';
import { TYPO, RADIUS } from '@/constants/theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function firstName(id: string | undefined, members: FamilyMember[]): string {
  if (!id) return 'Someone';
  const m = members.find(m => m.id === id);
  return m ? (m.name.split(' ')[0] ?? m.name) : 'Someone';
}

function isQuestCategory(t: ChoreTask): boolean {
  return t.categoryType === 'bounty' || t.categoryType === 'grandparent_quest';
}

// ─── Approve modal ────────────────────────────────────────────────────────────

interface ApproveModalProps {
  chore: ChoreTask;
  reviewerId: string;
  onDone: () => void;
  onCancel: () => void;
}

function ApproveModal({ chore, reviewerId, onDone, onCancel }: ApproveModalProps) {
  const { colors } = useTheme();
  const [coins, setCoins] = useState(String(chore.coinsReward ?? 10));
  const { approveKidProposedChore } = useChoreStore();

  async function handleApprove() {
    const parsed = parseInt(coins, 10);
    await approveKidProposedChore(chore.id, reviewerId, isNaN(parsed) ? 10 : parsed);
    onDone();
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)' }}
      >
        <View style={{
          width: '85%',
          backgroundColor: colors.card,
          borderRadius: RADIUS.xl,
          padding: 24,
          gap: 16,
        }}>
          <Text style={{ fontSize: TYPO.heading, fontWeight: '700', color: colors.textPrimary }}>
            Set coin reward
          </Text>
          <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>
            "{chore.title}"
          </Text>
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '500', color: colors.textSecondary }}>
              Coins for this chore
            </Text>
            <TextInput
              value={coins}
              onChangeText={setCoins}
              keyboardType="number-pad"
              style={{
                backgroundColor: colors.surface,
                borderRadius: RADIUS.md,
                padding: 12,
                fontSize: TYPO.body,
                color: colors.textPrimary,
                borderWidth: 1,
                borderColor: colors.border,
              }}
              placeholderTextColor={colors.textTertiary}
              placeholder="10"
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => ({
                flex: 1,
                borderRadius: RADIUS.md,
                paddingVertical: 10,
                paddingHorizontal: 16,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: colors.textSecondary }}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={handleApprove}
              style={({ pressed }) => ({
                flex: 1,
                borderRadius: RADIUS.md,
                paddingVertical: 10,
                paddingHorizontal: 16,
                backgroundColor: colors.teal,
                alignItems: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: '#FFFFFF' }}>
                Approve →
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Proposal card ────────────────────────────────────────────────────────────

interface ProposalCardProps {
  chore: ChoreTask;
  members: FamilyMember[];
  activeMemberId: string | null;
  isQuest: boolean;
}

function ProposalCard({ chore, members, activeMemberId, isQuest }: ProposalCardProps) {
  const { colors } = useTheme();
  const { declineKidProposedChore } = useChoreStore();
  const [showApproveModal, setShowApproveModal] = useState(false);

  const accentColor = isQuest ? colors.pink : colors.teal;
  const bgColor = isQuest ? colors.pinkLight : colors.tealLight;
  const pillLabel = isQuest ? 'Kid-proposed quest' : 'Kid-proposed chore';

  async function handleDecline() {
    if (!activeMemberId) return;
    await declineKidProposedChore(chore.id, activeMemberId);
  }

  return (
    <>
      <View style={{
        backgroundColor: bgColor,
        borderRadius: RADIUS.xxl,
        padding: 18,
        gap: 12,
        borderWidth: 1,
        borderColor: `rgba(223,97,60,0.10)`,
      }}>
        {/* Status pill */}
        <View style={{ alignSelf: 'flex-start' }}>
          <View style={{
            backgroundColor: `${accentColor}33`,
            borderRadius: 100,
            paddingHorizontal: 12,
            paddingVertical: 5,
          }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: accentColor }}>
              {pillLabel}
            </Text>
          </View>
        </View>

        {/* Title */}
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>
          {chore.title}
        </Text>

        {/* Proposer + coins */}
        <Text style={{ fontSize: TYPO.caption, fontWeight: '400', color: colors.textSecondary }}>
          Proposed by {firstName(chore.createdById, members)} · {chore.coinsReward} coins
        </Text>

        {/* Action buttons */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={() => setShowApproveModal(true)}
            style={({ pressed }) => ({
              flex: 1,
              borderRadius: RADIUS.md,
              paddingVertical: 10,
              paddingHorizontal: 16,
              backgroundColor: accentColor,
              alignItems: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: '#FFFFFF' }}>
              Approve →
            </Text>
          </Pressable>
          <Pressable
            onPress={handleDecline}
            style={({ pressed }) => ({
              flex: 1,
              borderRadius: RADIUS.md,
              paddingVertical: 10,
              paddingHorizontal: 16,
              backgroundColor: colors.surface,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: colors.border,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: colors.textSecondary }}>
              Decline
            </Text>
          </Pressable>
        </View>
      </View>

      {showApproveModal && activeMemberId && (
        <ApproveModal
          chore={chore}
          reviewerId={activeMemberId}
          onDone={() => setShowApproveModal(false)}
          onCancel={() => setShowApproveModal(false)}
        />
      )}
    </>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function KidProposalReviewScreen({ onClose }: { onClose: () => void }) {
  const { colors } = useTheme();
  const chores = useChoreStore(s => s.chores);
  const members = useFamilyStore(s => s.members);
  const activeMemberId = useFamilyStore(s => s.activeMemberId);

  const proposals = useMemo(
    () => chores.filter(c => c.status === 'pending_kid_proposal'),
    [chores],
  );

  const choreProposals = useMemo(
    () => proposals.filter(c => !isQuestCategory(c)),
    [proposals],
  );

  const questProposals = useMemo(
    () => proposals.filter(c => isQuestCategory(c)),
    [proposals],
  );

  const total = proposals.length;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 24, gap: 20, paddingBottom: 48 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Back link */}
      <Pressable onPress={onClose} hitSlop={12}>
        <Text style={{ fontSize: TYPO.caption, fontWeight: '500', color: colors.teal }}>
          ← Kid Proposals
        </Text>
      </Pressable>

      {/* Title + subtitle */}
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 29, fontWeight: '700', color: colors.textPrimary }}>
          Kid proposals
        </Text>
        <Text style={{ fontSize: TYPO.caption, fontWeight: '500', color: colors.textSecondary }}>
          {total} {total === 1 ? 'item needs' : 'items need'} a decision
        </Text>
      </View>

      {/* Empty state */}
      {total === 0 && (
        <View style={{ alignItems: 'center', paddingTop: 40, gap: 12 }}>
          <Text style={{ fontSize: 40 }}>🚀</Text>
          <Text style={{ fontSize: TYPO.body, color: colors.textTertiary, textAlign: 'center' }}>
            No proposals right now
          </Text>
        </View>
      )}

      {/* Chore proposals section */}
      {choreProposals.length > 0 && (
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 20, fontWeight: '600', color: colors.textPrimary }}>
            Proposed chores
          </Text>
          {choreProposals.map(chore => (
            <ProposalCard
              key={chore.id}
              chore={chore}
              members={members}
              activeMemberId={activeMemberId}
              isQuest={false}
            />
          ))}
        </View>
      )}

      {/* Quest proposals section */}
      {questProposals.length > 0 && (
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 20, fontWeight: '600', color: colors.textPrimary }}>
            Proposed quests
          </Text>
          {questProposals.map(chore => (
            <ProposalCard
              key={chore.id}
              chore={chore}
              members={members}
              activeMemberId={activeMemberId}
              isQuest
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}
