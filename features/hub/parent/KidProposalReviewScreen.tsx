import { PageHeading } from '@/components/PageHeading';
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TouchableOpacity,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useChoreStore, type ChoreTask } from '@/store/choreStore';
import { useFamilyStore, type FamilyMember } from '@/store/familyStore';
import { GEMINI } from '@/constants/geminiRhythm';

function firstName(id: string | undefined, members: FamilyMember[]): string {
  if (!id) return 'Someone';
  const m = members.find(m => m.id === id);
  return m ? (m.name.split(' ')[0] ?? m.name) : 'Someone';
}

function isQuestCategory(t: ChoreTask): boolean {
  return t.categoryType === 'bounty' || t.categoryType === 'grandparent_quest';
}

function ApproveModal({ chore, reviewerId, onDone, onCancel }: {
  chore: ChoreTask; reviewerId: string; onDone: () => void; onCancel: () => void;
}) {
  const { colors, isDark } = useTheme();
  const [coins, setCoins] = useState(String(chore.coinsReward ?? 10));
  const { approveKidProposedChore } = useChoreStore();

  async function handleApprove() {
    const parsed = parseInt(coins, 10);
    await approveKidProposedChore(chore.id, reviewerId, isNaN(parsed) ? 10 : parsed);
    onDone();
  }

  return (
    <Modal supportedOrientations={['portrait', 'landscape']} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)' }}
      >
        <View style={{ width: '85%', backgroundColor: colors.card, borderRadius: 22, padding: 24, gap: 16 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: (isDark ? colors.textPrimary : GEMINI.titleColor) }}>Set coin reward</Text>
          <Text style={{ fontSize: 13, color: (isDark ? colors.textSecondary : GEMINI.bodyColor) }}>"{chore.title}"</Text>
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.9, color: colors.textTertiary }}>COINS FOR THIS CHORE</Text>
            <TextInput
              value={coins}
              onChangeText={setCoins}
              keyboardType="number-pad"
              style={{
                backgroundColor: isDark ? colors.surface : GEMINI.canvas, borderRadius: 12, padding: 12,
                fontSize: 15, color: (isDark ? colors.textPrimary : GEMINI.titleColor),
                borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border,
              }}
              placeholderTextColor={colors.textTertiary}
              placeholder="10"
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => ({
                flex: 1, borderRadius: 12, paddingVertical: 12, backgroundColor: colors.surface,
                borderWidth: 1, borderColor: colors.border, alignItems: 'center', opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: (isDark ? colors.textSecondary : GEMINI.bodyColor) }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleApprove}
              style={({ pressed }) => ({
                flex: 1, borderRadius: 12, paddingVertical: 12, backgroundColor: colors.teal,
                alignItems: 'center', opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF' }}>Approve →</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ProposalCard({ chore, members, activeMemberId, isQuest }: {
  chore: ChoreTask; members: FamilyMember[]; activeMemberId: string | null; isQuest: boolean;
}) {
  const { colors, isDark } = useTheme();
  const { declineKidProposedChore } = useChoreStore();
  const [showApproveModal, setShowApproveModal] = useState(false);

  const accentColor = isQuest ? colors.pink : colors.teal;
  const bgColor = isQuest ? colors.pinkLight : colors.tealLight;
  const pillLabel = isQuest ? 'Kid-proposed quest' : 'Kid-proposed chore';
  const proposerInitial = (() => {
    const m = members.find(m => m.id === chore.createdById);
    return (m?.name?.[0] ?? '?').toUpperCase();
  })();

  async function handleDecline() {
    if (!activeMemberId) return;
    await declineKidProposedChore(chore.id, activeMemberId);
  }

  return (
    <>
      <View style={[s.proposalCard, { backgroundColor: bgColor, borderColor: (isQuest ? colors.pink : colors.teal) + '30' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: accentColor, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>{proposerInitial}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: (isDark ? colors.textPrimary : GEMINI.titleColor) }}>{chore.title}</Text>
            <Text style={{ fontSize: 12, color: (isDark ? colors.textSecondary : GEMINI.bodyColor), marginTop: 1 }}>
              Proposed by {firstName(chore.createdById, members)} · {chore.coinsReward} coins
            </Text>
          </View>
          <View style={{ backgroundColor: `${accentColor}33`, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: accentColor }}>{pillLabel}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          <Pressable
            onPress={() => setShowApproveModal(true)}
            style={({ pressed }) => ({
              flex: 1, borderRadius: 12, paddingVertical: 12, backgroundColor: accentColor,
              alignItems: 'center', opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF' }}>Approve →</Text>
          </Pressable>
          <Pressable
            onPress={handleDecline}
            style={({ pressed }) => ({
              flex: 1, borderRadius: 12, paddingVertical: 12, backgroundColor: colors.surface,
              borderWidth: 1, borderColor: colors.border, alignItems: 'center', opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: (isDark ? colors.textSecondary : GEMINI.bodyColor) }}>Decline</Text>
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

export function KidProposalReviewScreen({ onClose }: { onClose: () => void }) {
  const { colors, isDark } = useTheme();
  const chores = useChoreStore(s => s.chores);
  const members = useFamilyStore(s => s.members);
  const activeMemberId = useFamilyStore(s => s.activeMemberId);
  const familyName = useFamilyStore(s => s.familyName);
  const activeMember = members.find(m => m.id === activeMemberId);

  const proposals = useMemo(() => chores.filter(c => c.status === 'pending_kid_proposal'), [chores]);
  const choreProposals = useMemo(() => proposals.filter(c => !isQuestCategory(c)), [proposals]);
  const questProposals = useMemo(() => proposals.filter(c => isQuestCategory(c)), [proposals]);
  const total = proposals.length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      <PageHeading
        eyebrow="FAMILY CUBE · REVIEW"
        title="Kid proposals"
        accent="teal"
        topInset={0}
        onTitlePress={onClose}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, gap: 24, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{ fontSize: 15, fontWeight: '500', color: (isDark ? colors.textSecondary : GEMINI.bodyColor) }}>
          {total} {total === 1 ? 'item needs' : 'items need'} a decision
        </Text>

        {total === 0 && (
          <View style={{ alignItems: 'center', paddingTop: 40, gap: 12 }}>
            <Text style={{ fontSize: 40 }}>🚀</Text>
            <Text style={{ fontSize: 15, color: colors.textTertiary, textAlign: 'center' }}>
              No proposals right now
            </Text>
          </View>
        )}

        {choreProposals.length > 0 && (
          <View style={{ gap: 12 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.9, color: colors.textTertiary }}>
              PROPOSED CHORES
            </Text>
            {choreProposals.map(chore => (
              <ProposalCard key={chore.id} chore={chore} members={members} activeMemberId={activeMemberId} isQuest={false} />
            ))}
          </View>
        )}

        {questProposals.length > 0 && (
          <View style={{ gap: 12 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.9, color: colors.textTertiary }}>
              PROPOSED QUESTS
            </Text>
            {questProposals.map(chore => (
              <ProposalCard key={chore.id} chore={chore} members={members} activeMemberId={activeMemberId} isQuest />
            ))}
          </View>
        )}

        <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textTertiary, textAlign: 'center', letterSpacing: 0.3 }}>
          Connect. Organize. Care. Grow.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  proposalCard: {
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    gap: 12,
  },
});
