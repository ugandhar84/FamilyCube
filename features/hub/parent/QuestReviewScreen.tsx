import React, { useState } from 'react';
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
import { RADIUS } from '@/constants/theme';
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
  const familyName = useFamilyStore(s => s.familyName);

  const chore = chores.find(c => c.id === choreId);
  const assignee = members.find(m => m.id === chore?.assignedToId);
  const activeMember = members.find(m => m.id === activeMemberId);
  const initial = (assignee?.name ?? '?')[0].toUpperCase();
  const firstName = assignee?.name?.split(' ')[0] ?? 'them';

  const borderColor = isDark ? colors.border : 'rgba(223,97,60,0.10)';

  const handleComplete = async () => {
    if (chore && activeMemberId) {
      await approveChore(choreId, activeMemberId);
    }
    onClose();
  };

  const handleMoreProof = () => { onClose(); };
  const handleDecline = () => { onClose(); };

  if (!chore) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.textSecondary, fontSize: 15 }}>Quest not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

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
              {chore.title}
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
        <View style={{ alignSelf: 'flex-start', borderRadius: 100, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: colors.pinkLight }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.pink }}>Quest submitted</Text>
        </View>

        {/* Submitter card */}
        <View style={[s.card, { backgroundColor: colors.card, borderColor }]}>
          <Text style={[s.overline, { color: colors.textTertiary }]}>SUBMITTED BY</Text>
          <View style={s.memberRow}>
            <View style={[s.avatar, { backgroundColor: colors.amber }]}>
              <Text style={s.avatarText}>{initial}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.memberName, { color: colors.textPrimary }]}>{assignee?.name ?? 'Unknown'}</Text>
              <Text style={[s.memberSub, { color: colors.textSecondary }]}>completed this quest</Text>
            </View>
            <View style={[s.coinsBadge, { backgroundColor: colors.amberLight }]}>
              <Text style={[s.coinsBadgeText, { color: colors.amber }]}>+{chore.coinsReward} ₵</Text>
            </View>
          </View>
        </View>

        {/* Evidence card */}
        <View style={[s.card, { backgroundColor: colors.card, borderColor }]}>
          <Text style={[s.overline, { color: colors.textTertiary }]}>PROOF SUBMITTED</Text>
          {chore.proofNotes || chore.submissionNote ? (
            <Text style={[s.evidenceText, { color: colors.textPrimary }]}>
              {chore.proofNotes ?? chore.submissionNote}
            </Text>
          ) : (
            <Text style={[s.noEvidence, { color: colors.textTertiary }]}>No written evidence — review photo if attached</Text>
          )}
        </View>

        {/* Quest progress card */}
        <View style={[s.card, { backgroundColor: colors.pinkLight, borderColor: 'transparent' }]}>
          <Text style={[s.cardTitle, { color: colors.textPrimary }]}>Quest complete</Text>
          <View style={[s.progressTrack, { backgroundColor: colors.surface }]}>
            <View style={[s.progressFill, { backgroundColor: colors.pink, width: '100%' }]} />
          </View>
          <Text style={[s.progressLabel, { color: colors.textSecondary }]}>
            {firstName} says this is done. Your call.
          </Text>
        </View>

        {/* What happens next */}
        <View style={[s.card, { backgroundColor: colors.tealLight, borderColor: 'transparent' }]}>
          <Text style={[s.cardTitle, { color: colors.textPrimary }]}>What happens on approval</Text>
          <Text style={[s.bodyText, { color: colors.textSecondary }]}>
            {chore.coinsReward} coins are awarded to {firstName} immediately. The quest moves to completed.
          </Text>
        </View>

        {/* Action buttons */}
        <View style={{ gap: 12, marginTop: 4 }}>
          <TouchableOpacity onPress={handleComplete} style={[s.btnPrimary, { backgroundColor: colors.primary }]} activeOpacity={0.85}>
            <Text style={[s.btnText, { color: '#FFFFFF' }]}>Complete quest &amp; award coins →</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleMoreProof} style={[s.btnOutline, { backgroundColor: colors.surface, borderColor }]} activeOpacity={0.85}>
            <Text style={[s.btnText, { color: colors.textPrimary }]}>Ask for more proof</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDecline} style={[s.btnOutline, { backgroundColor: colors.surface, borderColor }]} activeOpacity={0.85}>
            <Text style={[s.btnText, { color: colors.danger }]}>Decline quest</Text>
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
  coinsBadge: {
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  coinsBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  evidenceText: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  },
  noEvidence: {
    fontSize: 13,
    fontWeight: '400',
    fontStyle: 'italic',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: '400',
  },
  bodyText: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 20,
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
