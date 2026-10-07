import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import { useRewardStore } from '@/store/rewardStore';
import { useFamilyStore } from '@/store/familyStore';

interface Props {
  redemptionId: string;
  onClose: () => void;
}

export function RewardReviewScreen({ redemptionId, onClose }: Props) {
  const { colors, isDark } = useTheme();
  const redemptions = useRewardStore(s => s.redemptions);
  const rewards = useRewardStore(s => s.rewards);
  const approveRedemption = useRewardStore(s => s.approveRedemption);
  const members = useFamilyStore(s => s.members);
  const activeMemberId = useFamilyStore(s => s.activeMemberId);

  const redemption = redemptions.find(r => r.id === redemptionId);
  const reward = rewards.find(r => r.id === redemption?.rewardId);
  const member = members.find(m => m.id === redemption?.memberId);
  const initial = (member?.name ?? '?')[0].toUpperCase();

  const borderColor = isDark ? colors.border : 'rgba(223,97,60,0.10)';

  const handleApprove = () => {
    if (activeMemberId) {
      approveRedemption(redemptionId, activeMemberId);
    }
    onClose();
  };

  const handleDecline = () => {
    onClose();
  };

  if (!redemption) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.background }]}>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          Redemption not found.
        </Text>
      </View>
    );
  }

  const rewardTitle = reward?.title ?? redemption.rewardTitle ?? 'Reward';
  const rewardDescription = reward?.description;
  const coinCost = redemption.deductedCoins;
  const category = reward?.category ?? null;
  const isCashout = category === 'Shopping' || category === 'Special';
  const categoryLabel = isCashout ? 'Cash out' : 'Store reward';

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* Back link */}
      <TouchableOpacity onPress={onClose} style={styles.backRow}>
        <Text style={[styles.backText, { color: colors.teal }]}>{'← Reward Review'}</Text>
      </TouchableOpacity>

      {/* Title */}
      <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Reward request</Text>

      {/* Status pill */}
      <View style={[styles.pill, { backgroundColor: colors.amberLight }]}>
        <Text style={[styles.pillText, { color: colors.amber }]}>Pending approval</Text>
      </View>

      {/* Requester card */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor }]}>
        <View style={styles.assigneeRow}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={styles.assigneeInfo}>
            <Text style={[styles.assigneeName, { color: colors.textPrimary }]}>
              {member?.name ?? 'Unknown'}
            </Text>
            <Text style={[styles.assigneeSub, { color: colors.textSecondary }]}>
              wants to redeem a reward
            </Text>
          </View>
        </View>
      </View>

      {/* Reward card */}
      <View style={[styles.rewardCard, { backgroundColor: colors.amberLight }]}>
        <Text style={[styles.rewardTitle, { color: colors.textPrimary }]}>{rewardTitle}</Text>
        {rewardDescription ? (
          <Text style={[styles.rewardDescription, { color: colors.textSecondary }]}>
            {rewardDescription}
          </Text>
        ) : null}
        <View style={styles.coinsRow}>
          <View style={[styles.coinIcon, { backgroundColor: colors.amber }]}>
            <Text style={styles.coinIconText}>₵</Text>
          </View>
          <Text style={[styles.coinsText, { color: colors.textPrimary }]}>
            {coinCost} coins
          </Text>
        </View>
      </View>

      {/* Category pill */}
      <View style={[styles.categoryPill, { backgroundColor: colors.card, borderColor }]}>
        <Text style={[styles.categoryPillText, { color: colors.textSecondary }]}>
          {categoryLabel}
        </Text>
      </View>

      {/* Action buttons */}
      <View style={styles.buttonsWrapper}>
        <TouchableOpacity
          onPress={handleApprove}
          style={[styles.btn, { backgroundColor: colors.primary }]}
          activeOpacity={0.85}
        >
          <Text style={[styles.btnText, { color: '#FFFFFF' }]}>Approve redemption</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleDecline}
          style={[styles.btn, styles.btnOutline, { backgroundColor: colors.surface, borderColor }]}
          activeOpacity={0.85}
        >
          <Text style={[styles.btnText, { color: colors.danger }]}>Decline</Text>
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
  rewardCard: {
    borderRadius: RADIUS.xxl,
    padding: 20,
  },
  rewardTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  rewardDescription: {
    fontSize: 13,
    fontWeight: '400',
    marginTop: 6,
  },
  coinsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
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
  categoryPill: {
    alignSelf: 'flex-start',
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
  },
  categoryPillText: {
    fontSize: 12,
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
