import { PageHeading } from '@/components/PageHeading';
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
import { GEMINI } from '@/constants/geminiRhythm';

interface Props {
  redemptionId: string;
  onClose: () => void;
}

export function RewardReviewScreen({ redemptionId, onClose }: Props) {
  const { colors, isDark } = useTheme();
  const redemptions = useRewardStore(s => s.redemptions);
  const rewards = useRewardStore(s => s.rewards);
  const approveRedemption = useRewardStore(s => s.approveRedemption);
  const rejectRedemption = useRewardStore(s => s.rejectRedemption);
  const members = useFamilyStore(s => s.members);
  const activeMemberId = useFamilyStore(s => s.activeMemberId);
  const familyName = useFamilyStore(s => s.familyName);

  const redemption = redemptions.find(r => r.id === redemptionId);
  const reward = rewards.find(r => r.id === redemption?.rewardId);
  const member = members.find(m => m.id === redemption?.memberId);
  const activeMember = members.find(m => m.id === activeMemberId);
  const initial = (member?.name ?? '?')[0].toUpperCase();
  const firstName = member?.name?.split(' ')[0] ?? 'them';

  const isPending = redemption?.status === 'pending';
  const isApproved = redemption?.status === 'approved';
  const isDeclined = redemption?.status === 'rejected';
  const resolvedBy = members.find(m => m.id === (redemption?.approvedBy ?? redemption?.rejectedBy));
  const fmtWhen = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${date} · ${time}`;
  };

  const borderColor = isDark ? colors.border : GEMINI.border;

  const handleApprove = () => {
    if (activeMemberId) approveRedemption(redemptionId, activeMemberId);
    onClose();
  };

  // Was a bare onClose() with no actual decline call — tapping "Decline"
  // silently did nothing (no refund, no status change, reopening the same
  // redemption still showed it as pending) [part of the live-reported
  // "this flow kind of wrong" audit].
  const handleDecline = () => {
    if (activeMemberId) rejectRedemption(redemptionId, activeMemberId);
    onClose();
  };

  if (!redemption) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: (isDark ? colors.textSecondary : GEMINI.bodyColor), fontSize: 15 }}>Redemption not found.</Text>
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
      <PageHeading
        eyebrow="FAMILY CUBE · REVIEW"
        title="Reward request"
        accent="amber"
        topInset={0}
        onTitlePress={onClose}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, gap: 24, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Status pill */}
        <View style={{
          alignSelf: 'flex-start', borderRadius: 100, paddingHorizontal: 12, paddingVertical: 5,
          backgroundColor: isDeclined ? colors.primaryLight : isApproved ? colors.tealLight : colors.amberLight,
        }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: isDeclined ? colors.danger : isApproved ? colors.teal : colors.amber }}>
            {isDeclined ? 'Declined' : isApproved ? 'Approved' : 'Pending approval'}
          </Text>
        </View>

        {/* Requester card */}
        <View style={[s.card, { backgroundColor: colors.card, borderColor }]}>
          <Text style={[s.overline, { color: colors.textTertiary }]}>REQUESTED BY</Text>
          <View style={s.memberRow}>
            <View style={[s.avatar, { backgroundColor: colors.amber }]}>
              <Text style={s.avatarText}>{initial}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.memberName, { color: (isDark ? colors.textPrimary : GEMINI.titleColor) }]}>{member?.name ?? 'Unknown'}</Text>
              <Text style={[s.memberSub, { color: (isDark ? colors.textSecondary : GEMINI.bodyColor) }]}>wants to redeem a reward</Text>
            </View>
          </View>
        </View>

        {/* Reward card */}
        <View style={[s.card, { backgroundColor: colors.amberLight, borderColor: 'transparent' }]}>
          <Text style={[s.overline, { color: colors.amber }]}>REWARD</Text>
          <Text style={[s.rewardTitle, { color: (isDark ? colors.textPrimary : GEMINI.titleColor) }]}>{rewardTitle}</Text>
          {rewardDescription ? (
            <Text style={[s.bodyText, { color: (isDark ? colors.textSecondary : GEMINI.bodyColor) }]}>{rewardDescription}</Text>
          ) : null}
          <View style={[s.coinsBadge, { backgroundColor: colors.card, alignSelf: 'flex-start' }]}>
            <Text style={[s.coinsBadgeText, { color: colors.amber }]}>{coinCost} coins · {categoryLabel}</Text>
          </View>
        </View>

        {/* What happens next — coins are already debited at request time
            (redeem_reward), not on approval, so this must not claim
            approval is what deducts them [live-reported: "ive approved it
            still showing the ... this flow kind of wrong"]. */}
        {isPending && (
          <View style={[s.card, { backgroundColor: colors.tealLight, borderColor: 'transparent' }]}>
            <Text style={[s.cardTitle, { color: (isDark ? colors.textPrimary : GEMINI.titleColor) }]}>What happens on approval</Text>
            <Text style={[s.bodyText, { color: (isDark ? colors.textSecondary : GEMINI.bodyColor) }]}>
              {firstName}'s {coinCost} coins were already set aside when they sent this request. Approving marks it fulfilled — declining refunds the coins back to {firstName}.
            </Text>
          </View>
        )}

        {/* Activity log — who acted, when, and the balance change, per
            [live-reported: "see this redumption approval activity log
            also being displayed here both kids and parents.. who
            approved and when what was previous bal and what is after
            approval??"]. Only renders once resolved (balanceBefore/After
            are only ever set at request time or at decline time — see
            migration 20261013040000). */}
        <View style={[s.card, { backgroundColor: colors.card, borderColor }]}>
          <Text style={[s.overline, { color: colors.textTertiary }]}>ACTIVITY LOG</Text>
          <View style={{ gap: 10 }}>
            <View>
              <Text style={[s.bodyText, { color: (isDark ? colors.textPrimary : GEMINI.titleColor), fontWeight: '600' }]}>
                {firstName} requested this reward
              </Text>
              <Text style={[s.memberSub, { color: colors.textTertiary }]}>{fmtWhen(redemption?.redeemedAt)}</Text>
              {redemption?.kidNote ? (
                <Text style={[s.memberSub, { color: colors.textTertiary, marginTop: 2 }]}>Note from {firstName}: {redemption.kidNote}</Text>
              ) : null}
            </View>
            {!isPending && (
              <View>
                <Text style={[s.bodyText, { color: (isDark ? colors.textPrimary : GEMINI.titleColor), fontWeight: '600' }]}>
                  {resolvedBy?.name ?? 'A parent'} {isDeclined ? 'declined' : 'approved'} the request
                </Text>
                <Text style={[s.memberSub, { color: colors.textTertiary }]}>{fmtWhen(redemption?.respondedAt)}</Text>
                {redemption?.note ? (
                  <Text style={[s.memberSub, { color: colors.textTertiary, marginTop: 2 }]}>Note: {redemption.note}</Text>
                ) : null}
              </View>
            )}
            {(redemption?.balanceBefore !== undefined && redemption?.balanceAfter !== undefined) ? (
              <View style={[s.coinsBadge, { backgroundColor: colors.surface, alignSelf: 'flex-start' }]}>
                <Text style={[s.coinsBadgeText, { color: (isDark ? colors.textPrimary : GEMINI.titleColor) }]}>
                  {redemption.balanceBefore} → {redemption.balanceAfter} coins
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Action buttons */}
        {isPending && (
          <View style={{ gap: 12, marginTop: 4 }}>
            <TouchableOpacity onPress={handleApprove} style={[s.btnPrimary, { backgroundColor: colors.pink }]} activeOpacity={0.85}>
              <Text style={[s.btnText, { color: '#FFFFFF' }]}>Approve redemption →</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDecline} style={[s.btnOutline, { backgroundColor: colors.surface, borderColor }]} activeOpacity={0.85}>
              <Text style={[s.btnText, { color: colors.danger }]}>Decline</Text>
            </TouchableOpacity>
          </View>
        )}

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
