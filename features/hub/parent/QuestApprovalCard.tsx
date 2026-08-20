import { useState } from 'react';
import { View, Text, Alert, Image, TouchableOpacity, Pressable, Modal } from 'react-native';
import { Camera, Coins, X, AlertTriangle } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import FamilyAvatar from '@/components/FamilyAvatar';
import { CollapsibleCard, QuestLiveness } from '../hubComponents';
import { useCelebrationStore } from '@/store/celebrationStore';
import type { FamilyMember } from '@/store/familyStore';
import type { Quest } from '@/store/questStore';

// A kid's submitted-for-review quest — photo proof (or a missing-proof
// warning), completion note, and the approve/decline decision.
export function QuestApprovalCard({ q, active, members, allNames, colors, isDark, approveQuest, declineQuest, onDeclinePress }: {
  q: Quest; active: FamilyMember; members: FamilyMember[]; allNames: string[];
  colors: any; isDark: boolean;
  approveQuest: (id: string, by: string) => void;
  declineQuest: (id: string, by: string, reason: string) => void;
  // Override the built-in Alert.prompt decline flow — e.g. ParentReviewDeck
  // uses this to open its own preset-reason RedoSheet instead.
  onDeclinePress?: () => void;
}) {
  const kid = members.find(m => m.id === q.assignedToId);
  const hasBonus = q.bonusCoins > 0;
  const totalCoins = q.coins + (hasBonus ? q.bonusCoins : 0);
  const [photoOpen, setPhotoOpen] = useState(false);

  return (
    <CollapsibleCard accent={colors.primary} colors={colors} isDark={isDark} defaultExpanded
      summary={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Camera size={16} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.primary }} numberOfLines={1}>
              Quest done — {q.title}
            </Text>
            {kid && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                <FamilyAvatar name={kid.name} emoji={kid.emoji} avatarUrl={kid.avatarUrl}
                  siblings={allNames} size={14} ringColor={colors.primary} ringWidth={1} />
                <Coins size={11} color={colors.kid} />
                <Text style={{ fontSize: TYPO.label, color: colors.primary, fontWeight: '600' }}>
                  {kid.name.split(' ')[0]} wants {q.coins} coins
                </Text>
                {hasBonus && (
                  <View style={{ backgroundColor: colors.warningLight, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: colors.warningDark }}>
                      🔥 +{q.bonusCoins} bonus
                    </Text>
                  </View>
                )}
              </View>
            )}
            <QuestLiveness history={q.history} members={members} colors={colors} />
          </View>
          <View style={{ backgroundColor: colors.primary + '30', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.primary }}>Review</Text>
          </View>
        </View>
      }>
      {q.photoUrl ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <TouchableOpacity onPress={() => setPhotoOpen(true)} style={{ borderRadius: 10, overflow: 'hidden' }}>
            <Image
              source={{ uri: q.photoUrl }}
              style={{ width: 56, height: 56, backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }}
              resizeMode="cover"
            />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>Photo proof attached</Text>
            {q.completionNote ? (
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, fontStyle: 'italic', marginTop: 2 }} numberOfLines={2}>
                "{q.completionNote}"
              </Text>
            ) : (
              <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 2 }}>Tap to view full size</Text>
            )}
          </View>
        </View>
      ) : q.photoRequired ? (
        <View style={{ borderRadius: 12, marginBottom: 10, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 6,
          backgroundColor: isDark ? colors.warning + '14' : colors.warningLight, borderWidth: 1, borderColor: colors.warning + '60' }}>
          <AlertTriangle size={13} color={colors.warningDark} />
          <Text style={{ fontSize: TYPO.label, color: colors.warningDark, fontWeight: '700' }}>Photo proof missing</Text>
        </View>
      ) : null}
      {q.completionNote && !q.photoUrl ? (
        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, fontStyle: 'italic', marginBottom: 10 }}>
          "{q.completionNote}"
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={() => onDeclinePress ? onDeclinePress() : Alert.prompt(
            'Decline Chore',
            `Let ${kid?.name.split(' ')[0] ?? 'them'} know why "${q.title}" needs another try.`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Decline', style: 'destructive', onPress: (reason: string | undefined) => declineQuest(q.id, active.id, reason?.trim() || 'Needs another try') },
            ],
            'plain-text',
          )}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: `${colors.danger}15`, borderWidth: 1, borderColor: `${colors.danger}40`,
            paddingVertical: 10, borderRadius: 12 }}>
          <X size={13} color={colors.danger} />
          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.danger }}>Decline</Text>
        </Pressable>
        <Pressable onPress={() => { approveQuest(q.id, active.id); useCelebrationStore.getState().trigger(); }}
          style={{ flex: 2, backgroundColor: colors.primary, paddingVertical: 10, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          <Coins size={14} color="#fff" />
          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>
            Approve & Pay {totalCoins} Coins{hasBonus ? ` (incl. ${q.bonusCoins} bonus)` : ''}
          </Text>
        </Pressable>
      </View>

      {q.photoUrl && (
        <Modal visible={photoOpen} transparent animationType="fade" onRequestClose={() => setPhotoOpen(false)}>
          <Pressable
            onPress={() => setPhotoOpen(false)}
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' }}>
            <Image source={{ uri: q.photoUrl }} style={{ width: '100%', height: '70%' }} resizeMode="contain" />
            <Pressable onPress={() => setPhotoOpen(false)}
              style={{ position: 'absolute', top: 56, right: 20, width: 36, height: 36, borderRadius: 18,
                backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
              <X size={18} color="#fff" />
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </CollapsibleCard>
  );
}
