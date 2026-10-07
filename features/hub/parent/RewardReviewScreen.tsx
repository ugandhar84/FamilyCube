import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
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
  const familyName = useFamilyStore(s => s.familyName);

  const redemption = redemptions.find(r => r.id === redemptionId);
  const reward = rewards.find(r => r.id === redemption?.rewardId);
  const member = members.find(m => m.id === redemption?.memberId);
  const activeMember = members.find(m => m.id === activeMemberId);
  const initial = (member?.name ?? '?')[0].toUpperCase();
  const firstName = member?.name?.split(' ')[0] ?? 'them';

  const borderColor = isDark ? colors.border : 'rgba(223,97,60,0.10)';

  const handleApprove = () => {
    if (activeMemberId) approveRedemption(redemptionId, activeMemberId);
    onClose();
  };

  const handleDecline = () => { onClose(); };

  if (!redemption) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.textSecondary, fontSize: 15 }}>Redemption not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const rewardTitle = reward?.title ?? redemption.rewardTitle ?? 'Reward';
  const rewardDescription = reward?.description;
  const coinCost = redemption.deductedCoins;
  const category = reward?.category ?? null;
  const isCashout = category === 'Shopping' || category === 'Special';
  const categoryLabel = isCashout ? 'Cash out' : 'Store reward';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      {/* ── Fixed page header ── */}
      <View style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: isDark ? colors.border : 'rgba(223,97,60,0.08)', gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: colors.textTertiary }}>
            {familyName?.toUpperCase() ?? 'FAMILY'}
          </Text>
          {activeMember ? (
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.teal }}>
              {activeMember.name} · {activeMember.role}
            </Text>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <TouchableOpacity onPress={onClose} style={{ alignSelf: 'flex-start' }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: colors.teal }}>← Review inbox</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 29, fontWeight: '700', letterSpacing: -0.5, lineHeight: 34, marginTop: 4, color: colors.textPrimary }}>
              Reward request
            </Text>
          </View>
          <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
            <X size={16} color={colors.textSecondary} strokeWidth={2.5} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 24, gap: 20, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Status pill */}
        <View style={{ alignSelf: 'flex-start', borderRadius: 100, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: colors.amberLight }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.amber }}>Pending approval</Text>
        </View>

        {/* Requester card */}
        <View style={[s.card, { backgroundColor: colors.card, borderColor }]}>
          <Text style={[s.overline, { color: colors.textTertiary }]}>REQUESTED BY</Text>
          <View style={s.memberRow}>
            <View style={[s.avatar, { backgroundColor: colors.amber }]}>
              <Text style={s.avatarText}>{initial}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.memberName, { color: colors.textPrimary }]}>{member?.name ?? 'Unknown'}</Text>
              <Text style={[s.memberSub, { color: colors.textSecondary }]}>wants to redeem a reward</Text>
            </View>
          </View>
        </View>

        {/* Reward card */}
        <View style={[s.card, { backgroundColor: colors.amberLight, borderColor: 'transparent' }]}>
          <Text style={[s.overline, { color: colors.amber }]}>REWARD</Text>
          <Text style={[s.rewardTitle, { color: colors.textPrimary }]}>{rewardTitle}</Text>
          {rewardDescription ? (
            <Text style={[s.bodyText, { color: colors.textSecondary }]}>{rewardDescription}</Text>
          ) : null}
          <View style={[s.coinsBadge, { backgroundColor: colors.card, alignSelf: 'flex-start' }]}>
            <Text style={[s.coinsBadgeText, { color: colors.amber }]}>₵ {coinCost} coins · {categoryLabel}</Text>
          </View>
        </View>

        {/* What happens next */}
        <View style={[s.card, { backgroundColor: colors.tealLight, borderColor: 'transparent' }]}>
          <Text style={[s.cardTitle, { color: colors.textPrimary }]}>What happens on approval</Text>
          <Text style={[s.bodyText, { color: colors.textSecondary }]}>
            {coinCost} coins are deducted from {firstName}'s balance. The redemption is marked fulfilled.
          </Text>
        </View>

        {/* Action buttons */}
        <View style={{ gap: 12, marginTop: 4 }}>
          <TouchableOpacity onPress={handleApprove} style={[s.btnPrimary, { backgroundColor: colors.primary }]} activeOpacity={0.85}>
            <Text style={[s.btnText, { color: '#FFFFFF' }]}>Approve redemption →</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDecline} style={[s.btnOutline, { backgroundColor: colors.surface, borderColor }]} activeOpacity={0.85}>
            <Text style={[s.btnText, { color: colors.danger }]}>Decline</Text>
          </TouchableOpacity>
        </View>

        <Text style={[s.signature, { color: colors.textTertiary }]}>Connect. Organize. Care. Grow.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    gap: 12,
  },
  overline: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.9,
  },
  memberRow: {
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
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  memberName: {
    fontSize: 15,
    fontWeight: '600',
  },
  memberSub: {
    fontSize: 12,
    fontWeight: '400',
    marginTop: 1,
  },
  rewardTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  bodyText: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 20,
  },
  coinsBadge: {
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  coinsBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  btnPrimary: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnOutline: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  btnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  signature: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
});
