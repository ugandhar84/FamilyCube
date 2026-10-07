import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import { useChoreStore } from '@/store/choreStore';
import { useFamilyStore } from '@/store/familyStore';

interface Props {
  choreId: string;
  onClose: () => void;
}

export function QuestReviewScreen({ choreId, onClose }: Props) {
  const { colors, isDark } = useTheme();
  const chores = useChoreStore(s => s.chores);
  const approveChore = useChoreStore(s => s.approveChore);
  const members = useFamilyStore(s => s.members);
  const activeMemberId = useFamilyStore(s => s.activeMemberId);

  const chore = chores.find(c => c.id === choreId);
  const assignee = members.find(m => m.id === chore?.assignedToId);
  const initial = (assignee?.name ?? '?')[0].toUpperCase();

  const borderColor = isDark ? colors.border : 'rgba(223,97,60,0.10)';

  const handleComplete = async () => {
    if (chore && activeMemberId) {
      await approveChore(choreId, activeMemberId);
    }
    onClose();
  };

  const handleMoreProof = () => {
    onClose();
  };

  const handleDecline = () => {
    onClose();
  };

  if (!chore) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.background }]}>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Quest not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* Back link */}
      <TouchableOpacity onPress={onClose} style={styles.backRow}>
        <Text style={[styles.backText, { color: colors.teal }]}>{'← Quest Review'}</Text>
      </TouchableOpacity>

      {/* Title */}
      <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>{chore.title}</Text>

      {/* Status pill */}
      <View style={[styles.pill, { backgroundColor: colors.pinkLight }]}>
        <Text style={[styles.pillText, { color: colors.pink }]}>Quest submitted</Text>
      </View>

      {/* Quest info card */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor }]}>
        <View style={styles.assigneeRow}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={styles.assigneeInfo}>
            <Text style={[styles.assigneeName, { color: colors.textPrimary }]}>
              {assignee?.name ?? 'Unknown'}
            </Text>
            <Text style={[styles.assigneeSub, { color: colors.textSecondary }]}>
              submitted this quest
            </Text>
          </View>
        </View>
      </View>

      {/* Progress card */}
      <View style={[styles.progressCard, { backgroundColor: colors.pinkLight }]}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Quest progress</Text>
        <View style={[styles.progressTrack, { backgroundColor: colors.surface }]}>
          <View style={[styles.progressFill, { backgroundColor: colors.pink }]} />
        </View>
        <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>
          Quest complete — ready to claim
        </Text>
      </View>

      {/* Evidence card */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor }]}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Proof submitted</Text>
        {chore.proofNotes ? (
          <Text style={[styles.evidenceText, { color: colors.textPrimary }]}>
            {chore.proofNotes}
          </Text>
        ) : chore.submissionNote ? (
          <Text style={[styles.evidenceText, { color: colors.textPrimary }]}>
            {chore.submissionNote}
          </Text>
        ) : (
          <Text style={[styles.noEvidence, { color: colors.textTertiary }]}>
            No evidence provided
          </Text>
        )}
      </View>

      {/* Coins impact card */}
      <View style={[styles.coinsCard, { backgroundColor: colors.tealLight }]}>
        <View style={styles.coinsRow}>
          <View style={[styles.coinIcon, { backgroundColor: colors.teal }]}>
            <Text style={styles.coinIconText}>₵</Text>
          </View>
          <Text style={[styles.coinsText, { color: colors.textPrimary }]}>
            {chore.coinsReward} coins — quest reward
          </Text>
        </View>
      </View>

      {/* Action buttons */}
      <View style={styles.buttonsWrapper}>
        <TouchableOpacity
          onPress={handleComplete}
          style={[styles.btn, { backgroundColor: colors.primary }]}
          activeOpacity={0.85}
        >
          <Text style={[styles.btnText, { color: '#FFFFFF' }]}>Complete quest &amp; award coins</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleMoreProof}
          style={[styles.btn, styles.btnOutline, { backgroundColor: colors.surface, borderColor }]}
          activeOpacity={0.85}
        >
          <Text style={[styles.btnText, { color: colors.textPrimary }]}>Ask for more proof</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleDecline}
          style={[styles.btn, styles.btnOutline, { backgroundColor: colors.surface, borderColor }]}
          activeOpacity={0.85}
        >
          <Text style={[styles.btnText, { color: colors.danger }]}>Decline quest</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 20,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: TYPO.body,
  },
  backRow: {
    marginBottom: 0,
  },
  backText: {
    fontSize: 13,
    fontWeight: '500',
  },
  screenTitle: {
    fontSize: 29,
    fontWeight: '700',
    lineHeight: 34,
  },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  card: {
    borderRadius: RADIUS.xxl,
    padding: 18,
    borderWidth: 1,
  },
  assigneeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  assigneeInfo: {
    flex: 1,
  },
  assigneeName: {
    fontSize: 16,
    fontWeight: '600',
  },
  assigneeSub: {
    fontSize: 13,
    marginTop: 2,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
  },
  progressCard: {
    borderRadius: RADIUS.xxl,
    padding: 20,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    width: '70%',
    height: 8,
    borderRadius: 4,
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 8,
  },
  evidenceText: {
    fontSize: 15,
    lineHeight: 22,
  },
  noEvidence: {
    fontSize: 13,
  },
  coinsCard: {
    borderRadius: RADIUS.xxl,
    padding: 20,
  },
  coinsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  coinIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinIconText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  coinsText: {
    fontSize: 15,
    fontWeight: '600',
  },
  buttonsWrapper: {
    gap: 12,
  },
  btn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutline: {
    borderWidth: 1,
  },
  btnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
