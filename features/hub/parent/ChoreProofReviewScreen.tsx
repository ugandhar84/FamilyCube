import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import { useChoreStore } from '@/store/choreStore';
import { useFamilyStore } from '@/store/familyStore';

interface Props {
  choreId: string;
  onClose: () => void;
}

export function ChoreProofReviewScreen({ choreId, onClose }: Props) {
  const { colors, isDark } = useTheme();
  const chores = useChoreStore(s => s.chores);
  const approveChore = useChoreStore(s => s.approveChore);
  const members = useFamilyStore(s => s.members);
  const activeMemberId = useFamilyStore(s => s.activeMemberId);
  const familyName = useFamilyStore(s => s.familyName);
  const [note, setNote] = useState('');
  const chore = chores.find(c => c.id === choreId);
  const assignee = members.find(m => m.id === chore?.assignedToId);
  const activeMember = members.find(m => m.id === activeMemberId);
  const initial = (assignee?.name ?? '?')[0].toUpperCase();

  const borderColor = isDark ? colors.border : 'rgba(223,97,60,0.10)';

  const handleApprove = async () => {
    if (chore && activeMemberId) {
      await approveChore(choreId, activeMemberId);
    }
    onClose();
  };

  const handleRedo = () => {
    onClose();
  };

  const handleDecline = () => {
    onClose();
  };

  if (!chore) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.background }]}>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Chore not found.</Text>
      </View>
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
      contentContainerStyle={[styles.container, { paddingTop: 20 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Status pill */}
      <View style={[styles.pill, { backgroundColor: colors.primaryLight }]}>
        <Text style={[styles.pillText, { color: colors.primary }]}>Pending review</Text>
      </View>

      {/* Assignee card */}
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
              {'Submitted for review · '}{chore.coinsReward}{' coins'}
            </Text>
          </View>
        </View>
      </View>

      {/* Proof card */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor }]}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Their proof</Text>

        {chore.submissionPhotoUrl ? (
          <View style={[styles.photoPlaceholder, { backgroundColor: colors.surface }]}>
            <Text style={[styles.photoPlaceholderText, { color: colors.textTertiary }]}>
              Photo proof
            </Text>
          </View>
        ) : null}

        {chore.proofNotes ? (
          <Text style={[styles.proofNote, { color: colors.textPrimary }]}>{chore.proofNotes}</Text>
        ) : chore.submissionNote ? (
          <Text style={[styles.proofNote, { color: colors.textPrimary }]}>{chore.submissionNote}</Text>
        ) : !chore.submissionPhotoUrl ? (
          <Text style={[styles.noNote, { color: colors.textTertiary }]}>No note added</Text>
        ) : null}
      </View>

      {/* Decision note field */}
      <View style={styles.fieldWrapper}>
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
          Add a note (optional)
        </Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          multiline
          style={[
            styles.textInput,
            {
              backgroundColor: colors.surface,
              borderColor,
              color: colors.textPrimary,
            },
          ]}
          placeholderTextColor={colors.textTertiary}
          placeholder="Write something for the kid..."
          textAlignVertical="top"
        />
      </View>

      {/* Coins impact card */}
      <View style={[styles.coinsCard, { backgroundColor: colors.amberLight }]}>
        <View style={styles.coinsRow}>
          <View style={[styles.coinIcon, { backgroundColor: colors.amber }]}>
            <Text style={styles.coinIconText}>₵</Text>
          </View>
          <Text style={[styles.coinsText, { color: colors.textPrimary }]}>
            {chore.coinsReward} coins will be awarded
          </Text>
        </View>
      </View>

      {/* Action buttons */}
      <View style={styles.buttonsWrapper}>
        <TouchableOpacity
          onPress={handleApprove}
          style={[styles.btn, { backgroundColor: colors.primary }]}
          activeOpacity={0.85}
        >
          <Text style={[styles.btnText, { color: '#FFFFFF' }]}>Approve &amp; award coins</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleRedo}
          style={[styles.btn, styles.btnOutline, { backgroundColor: colors.surface, borderColor }]}
          activeOpacity={0.85}
        >
          <Text style={[styles.btnText, { color: colors.textPrimary }]}>Request a redo</Text>
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
    </SafeAreaView>
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
    fontWeight: '400',
    marginTop: 2,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
  },
  photoPlaceholder: {
    height: 160,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  photoPlaceholderText: {
    fontSize: 13,
  },
  proofNote: {
    fontSize: 15,
    lineHeight: 22,
  },
  noNote: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  fieldWrapper: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  textInput: {
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
    borderWidth: 1,
    height: 80,
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
