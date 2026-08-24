import { useState } from 'react';
import { View, Text, Pressable, Alert, TextInput } from 'react-native';
import { CheckCircle2, Sparkles, Coins } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import type { FamilyMember } from '@/store/familyStore';
import type { ChoreTask } from '@/store/choreStore';

// A kid proposed this chore for themselves or a sibling (propose_kid_chore
// RPC, chore_tasks.status = 'pending_kid_proposal') — the kid never sets a
// coin amount, so Approve requires the parent to pick one here before the
// chore becomes real/claimable. Decline deletes the proposal outright (it
// was never a live chore) via decline_kid_chore.
export function KidProposedChoreCard({ c, members, colors, isDark, active, approveKidProposedChore, declineKidProposedChore }: {
  c: ChoreTask; members: FamilyMember[]; colors: any; isDark: boolean; active: FamilyMember;
  approveKidProposedChore: (choreId: string, reviewerId: string, coins: number) => void;
  declineKidProposedChore: (choreId: string, reviewerId: string, reason?: string) => void;
}) {
  const proposer = members.find(m => m.id === c.createdById);
  const forMember = members.find(m => m.id === c.assignedToId);
  const isForSelf = c.createdById === c.assignedToId;
  const [approving, setApproving] = useState(false);
  const [coins, setCoins] = useState('5');

  const confirmApprove = () => {
    const parsed = parseInt(coins, 10);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    approveKidProposedChore(c.id, active.id, parsed);
    setApproving(false);
  };

  return (
    <View style={{ borderRadius: 14, padding: 12, gap: 8,
      backgroundColor: isDark ? colors.primary + '10' : colors.primaryLight,
      borderWidth: 1.5, borderColor: colors.primary + '40' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Sparkles size={15} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>{c.title}</Text>
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>
            {proposer?.name.split(' ')[0] ?? 'A kid'} proposed this
            {isForSelf ? ' for themselves' : ` for ${forMember?.name.split(' ')[0] ?? 'a sibling'}`}
          </Text>
        </View>
      </View>
      {c.description ? (
        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, lineHeight: 18 }}>{c.description}</Text>
      ) : null}

      {approving ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Coins size={14} color={colors.primary} />
          <TextInput
            value={coins}
            onChangeText={setCoins}
            keyboardType="number-pad"
            autoFocus
            style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: colors.primary + '60',
              backgroundColor: colors.card, paddingHorizontal: 10, paddingVertical: 8,
              fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}
          />
          <Pressable onPress={() => setApproving(false)}
            style={{ paddingHorizontal: 12, paddingVertical: 9 }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
          </Pressable>
          <Pressable onPress={confirmApprove}
            style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: colors.primary }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Set & Approve</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={() => Alert.alert(
              'Decline this chore?',
              `"${c.title}" will not be added — ${proposer?.name.split(' ')[0] ?? 'the kid'} will be notified.`,
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Decline', style: 'destructive', onPress: () => declineKidProposedChore(c.id, active.id) },
              ],
            )}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 12,
              borderWidth: 1.5, borderColor: colors.border }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>Decline</Text>
          </Pressable>
          <Pressable
            onPress={() => setApproving(true)}
            style={{ flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              paddingVertical: 11, borderRadius: 12, backgroundColor: colors.primary }}>
            <CheckCircle2 size={14} color="#fff" />
            <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>Approve</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
