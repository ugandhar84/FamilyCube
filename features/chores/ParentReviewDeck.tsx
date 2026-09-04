/**
 * ParentReviewDeck — All approval flows for parents:
 *   1. Grandparent quests pending PARENT approval
 *   2. Child chore submissions (pending_approval)
 *   3. Cash-out requests
 *   4. Redo requests / pushback (Two-Bounce rule → lock)
 */
import React, { useMemo, useState, useEffect } from 'react';
import {
  View, Text, Pressable, TextInput, Alert,
  ActivityIndicator, Image, Modal, KeyboardAvoidingView,
  ScrollView, Platform, Keyboard, StyleSheet, TouchableOpacity,
} from 'react-native';
import { CheckCircle2 } from 'lucide-react-native';
import { Ionicons } from '@expo/vector-icons';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO } from '@/constants/theme';
import FamilyAvatar from '@/components/FamilyAvatar';
import {
  useChoreStore, REJECTION_PRESETS,
  type ChoreTask, type RejectionPresetKey, type BountyClaim,
} from '@/store/choreStore';
import { choreToQuest } from '@/store/choreAdapter';
import { QuestApprovalCard } from '../hub/parent/QuestApprovalCard';
import { useKeyboardAwareMaxHeight } from '@/lib/useKeyboardAwareMaxHeight';
import { GpOfferReviewCard } from '../hub/parent/GpOfferReviewCard';
import type { FamilyMember } from '@/store/familyStore';

// ─── Countdown hook ───────────────────────────────────────────────────────────

function useCountdown(expiryIso?: string) {
  const [hoursLeft, setHoursLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!expiryIso) { setHoursLeft(null); return; }
    const tick = () => {
      const diff = (new Date(expiryIso).getTime() - Date.now()) / 3600_000;
      setHoursLeft(Math.max(0, diff));
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [expiryIso]);
  return hoursLeft;
}

// ─── Auto-approve badge ───────────────────────────────────────────────────────

function AutoApproveBadge({ expiresAt, colors }: { expiresAt?: string; colors: any }) {
  const hoursLeft = useCountdown(expiresAt);
  if (hoursLeft === null) return null;
  const urgent = hoursLeft < 4;
  return (
    <View style={{ backgroundColor: urgent ? '#FEE2E2' : '#F3F4F6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ fontSize: 10, fontWeight: '600', color: urgent ? '#EF4444' : colors.textTertiary }}>
        {hoursLeft < 1 ? 'Auto-approves soon ⚡' : `Auto in ${Math.round(hoursLeft)}h`}
      </Text>
    </View>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ emoji, title, count, colors }: {
  emoji: string; title: string; count: number; colors: any;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, paddingHorizontal: 4 }}>
      <Text style={{ fontSize: 18 }}>{emoji}</Text>
      <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '800', color: colors.textPrimary }}>{title}</Text>
      <View style={{ backgroundColor: BRAND.purple + '20', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
        <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: BRAND.purple }}>{count}</Text>
      </View>
    </View>
  );
}

// ─── Child submission review card ─────────────────────────────────────────────

interface ReviewCardProps {
  task: ChoreTask; members: FamilyMember[];
  colors: any; isDark: boolean;
  onApprove: (t: ChoreTask) => void;
  onRedo: (t: ChoreTask) => void;
}
function ReviewCard({ task, members, colors, isDark, onApprove, onRedo }: ReviewCardProps) {
  const child = members.find(m => m.id === task.assignedToId);
  const isGP  = task.categoryType === 'grandparent_quest';
  const { acknowledgeGPReimbursement } = useChoreStore();
  const hasReceipt  = !!task.receiptPhotoUrl || !!task.receiptAmount;
  const reimbursed  = !!task.receiptReimbursedAt;

  return (
    <View style={{
      backgroundColor: isDark ? colors.card : '#fff',
      borderRadius: 16, borderWidth: 1, borderColor: colors.border,
      marginBottom: 12, padding: 16,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {child && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 4 }}>
            <FamilyAvatar name={child.name} emoji={(child as any).emoji} avatarUrl={(child as any).avatarUrl} size={26} />
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>{child.name.split(' ')[0]}</Text>
          </View>
        )}
        {isGP && (
          <View style={{ backgroundColor: isDark ? colors.infoLight : '#DBEAFE', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: isDark ? colors.info : '#2563EB' }}>GP Chore</Text>
          </View>
        )}
        {/* GPs are never paid coins (master-flow R_COINS) — this read
            task.basePoints directly with no isGP guard, so a GP quest's
            review card showed a fake "+N pts" payout badge even though
            grandparentApproveAndCheer/approveChore never actually credits
            the GP anything. ChildChoreBoard.tsx already had this guard;
            this card didn't. */}
        {!isGP && task.basePoints > 0 && (
          <View style={{ backgroundColor: isDark ? colors.amberLight : '#FEF3C7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: isDark ? colors.amber : '#D97706' }}>+{task.basePoints} pts</Text>
          </View>
        )}
        {task.requiresPhotoProof && <Text style={{ fontSize: 14 }}>📸</Text>}
        <View style={{ flex: 1 }} />
        <AutoApproveBadge expiresAt={task.approvalWindowExpiresAt} colors={colors} />
      </View>

      <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary, marginBottom: 2 }}>{task.title}</Text>

      {/* Photo proof submitted by kid */}
      {task.submissionPhotoUrl && (
        <View style={{ marginTop: 8, marginBottom: 8, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: isDark ? colors.successLight : '#BBF7D0' }}>
          <Image source={{ uri: task.submissionPhotoUrl }} style={{ width: '100%', height: 180 }} resizeMode="cover" />
          <View style={{ backgroundColor: isDark ? colors.successLight : '#F0FDF4', paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: isDark ? colors.success : '#059669' }}>📸 Proof photo attached</Text>
          </View>
        </View>
      )}
      {task.requiresPhotoProof && !task.submissionPhotoUrl && (
        <View style={{ backgroundColor: isDark ? colors.amberLight : '#FEF3C7', borderRadius: 8, padding: 8, marginTop: 6, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 13 }}>⚠️</Text>
          <Text style={{ fontSize: TYPO.caption, color: isDark ? colors.amber : '#92400E', fontWeight: '600' }}>No photo submitted — photo was required</Text>
        </View>
      )}

      {task.submissionNote && (
        <View style={{ backgroundColor: isDark ? colors.surface : '#F9FAFB', borderRadius: 10, padding: 10, marginBottom: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textTertiary, marginBottom: 2 }}>CHILD'S NOTE</Text>
          <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, lineHeight: 18 }}>{task.submissionNote}</Text>
        </View>
      )}
      {(task.redoCount ?? 0) > 0 && (
        <Text style={{ fontSize: TYPO.caption, color: '#D97706', fontWeight: '600', marginBottom: 8 }}>
          ↩ Submitted {task.redoCount} time{task.redoCount === 1 ? '' : 's'} — next redo auto-approves
        </Text>
      )}

      {/* GP Receipt block */}
      {hasReceipt && (
        <View style={{ borderRadius: 14, borderWidth: 1.5,
          borderColor: reimbursed ? '#BBF7D0' : '#FDE68A',
          backgroundColor: reimbursed ? '#F0FDF4' : (isDark ? '#1C1500' : '#FFFBEB'),
          overflow: 'hidden', marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8,
            borderBottomWidth: task.receiptPhotoUrl ? 1 : 0,
            borderBottomColor: reimbursed ? '#BBF7D0' : '#FDE68A40' }}>
            <Text style={{ fontSize: 16 }}>🧾</Text>
            <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '800',
              color: reimbursed ? '#059669' : '#92400E' }}>
              {reimbursed ? 'Receipt reimbursed ✓' : 'GP submitted a receipt'}
            </Text>
            {task.receiptAmount != null && (
              <View style={{ backgroundColor: reimbursed ? '#059669' : '#F59E0B', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: '#fff' }}>
                  ${task.receiptAmount.toFixed(2)}
                </Text>
              </View>
            )}
          </View>
          {task.receiptPhotoUrl && (
            <Image source={{ uri: task.receiptPhotoUrl }} style={{ width: '100%', height: 160 }} resizeMode="cover" />
          )}
          {task.receiptNote && (
            <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ fontSize: TYPO.label, color: isDark ? '#FCD34D' : '#78350F', fontStyle: 'italic' }}>
                "{task.receiptNote}"
              </Text>
            </View>
          )}
          {!reimbursed && (
            <Pressable
              onPress={() => {
                Alert.alert(
                  'Mark as Reimbursed?',
                  task.receiptAmount != null
                    ? `Confirm you've paid $${task.receiptAmount.toFixed(2)} back to ${child?.name?.split(' ')[0] ?? 'the helper'}.`
                    : `Confirm you've reimbursed ${child?.name?.split(' ')[0] ?? 'the helper'} for this receipt.`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: '💳 Reimbursed', onPress: () => acknowledgeGPReimbursement(task.id) },
                  ]
                );
              }}
              style={({ pressed }) => ({ margin: 10, backgroundColor: '#F59E0B', borderRadius: 10,
                paddingVertical: 10, alignItems: 'center', opacity: pressed ? 0.8 : 1 })}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: '#fff' }}>💳 Mark Reimbursed</Text>
            </Pressable>
          )}
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
        <Pressable
          onPress={() => onRedo(task)}
          style={({ pressed }) => ({
            flex: 1, backgroundColor: isDark ? colors.surface : '#FEF2F2',
            borderRadius: 12, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#FCA5A5',
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#EF4444' }}>↩ Redo</Text>
        </Pressable>
        <Pressable
          onPress={() => onApprove(task)}
          style={({ pressed }) => ({
            flex: 2, backgroundColor: '#059669', borderRadius: 12, padding: 10,
            alignItems: 'center', opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#fff' }}>✓ Approve</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Multi-slot bounty claim review card ──────────────────────────────────────
// Coordinated live-DB QA (Round 19) found submitBountyClaim only ever updates
// the bounty_claims row, never chore_tasks.status — so a multi-slot bounty's
// individual claim submissions never reached pendingSubmissions above (which
// filters on the parent chore's own status), leaving them completely absent
// from the parent's primary review surface. A parent had no way to find a
// pending bounty claim short of already knowing to open the Quests tab.

interface BountyClaimCardProps {
  chore: ChoreTask; claim: BountyClaim; members: FamilyMember[];
  colors: any; isDark: boolean;
  onApprove: (choreId: string, memberId: string) => void;
  onDecline: (choreId: string, memberId: string) => void;
}
function BountyClaimReviewCard({ chore, claim, members, colors, isDark, onApprove, onDecline }: BountyClaimCardProps) {
  const child = members.find(m => m.id === claim.memberId);
  const coins = (chore.basePoints > 0 ? chore.basePoints : chore.coinsReward) + (chore.bonusCoins ?? 0);

  return (
    <View style={{
      backgroundColor: isDark ? colors.card : '#fff',
      borderRadius: 16, borderWidth: 1, borderColor: colors.border,
      marginBottom: 12, padding: 16,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {child && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 4 }}>
            <FamilyAvatar name={child.name} emoji={(child as any).emoji} avatarUrl={(child as any).avatarUrl} size={26} />
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>{child.name.split(' ')[0]}</Text>
          </View>
        )}
        <View style={{ backgroundColor: isDark ? colors.amberLight : '#FEF3C7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: isDark ? colors.amber : '#D97706' }}>Bounty · +{coins} pts</Text>
        </View>
      </View>

      <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary, marginBottom: 2 }}>{chore.title}</Text>

      {claim.submissionPhotoUrl && (
        <View style={{ marginTop: 8, marginBottom: 8, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: isDark ? colors.successLight : '#BBF7D0' }}>
          <Image source={{ uri: claim.submissionPhotoUrl }} style={{ width: '100%', height: 180 }} resizeMode="cover" />
          <View style={{ backgroundColor: isDark ? colors.successLight : '#F0FDF4', paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: isDark ? colors.success : '#059669' }}>📸 Proof photo attached</Text>
          </View>
        </View>
      )}
      {chore.requiresPhotoProof && !claim.submissionPhotoUrl && (
        <View style={{ backgroundColor: isDark ? colors.amberLight : '#FEF3C7', borderRadius: 8, padding: 8, marginTop: 6, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 13 }}>⚠️</Text>
          <Text style={{ fontSize: TYPO.caption, color: isDark ? colors.amber : '#92400E', fontWeight: '600' }}>No photo submitted — photo was required</Text>
        </View>
      )}
      {claim.submissionNote && (
        <View style={{ backgroundColor: isDark ? colors.surface : '#F9FAFB', borderRadius: 10, padding: 10, marginBottom: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textTertiary, marginBottom: 2 }}>CHILD'S NOTE</Text>
          <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, lineHeight: 18 }}>{claim.submissionNote}</Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
        <Pressable
          onPress={() => Alert.alert('Decline this claim?', `${child?.name?.split(' ')[0] ?? 'This claimant'}'s slot goes back for a redo.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Decline', style: 'destructive', onPress: () => onDecline(chore.id, claim.memberId) },
          ])}
          style={({ pressed }) => ({
            flex: 1, backgroundColor: isDark ? colors.surface : '#FEF2F2',
            borderRadius: 12, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#FCA5A5',
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#EF4444' }}>↩ Decline</Text>
        </Pressable>
        <Pressable
          onPress={() => onApprove(chore.id, claim.memberId)}
          style={({ pressed }) => ({
            flex: 2, backgroundColor: '#059669', borderRadius: 12, padding: 10,
            alignItems: 'center', opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#fff' }}>✓ Approve</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Cash-out approval card ───────────────────────────────────────────────────

function CashOutCard({ req, member, colors, isDark }: {
  req: any; member?: FamilyMember; colors: any; isDark: boolean;
}) {
  const { approveCashOut, denyCashOut } = useChoreStore();
  const ratio = useChoreStore(s => s.householdSettings.pointsToFiatRatio);
  const currencySymbol = useChoreStore(s => s.householdSettings.currencySymbol);

  return (
    <View style={{
      backgroundColor: isDark ? colors.card : '#F0FDF4',
      borderRadius: 16, borderWidth: 1, borderColor: isDark ? colors.successLight : '#BBF7D0',
      marginBottom: 12, padding: 16,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {member && <FamilyAvatar name={member.name} emoji={(member as any).emoji} size={28} />}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textPrimary }}>Cash-Out Request</Text>
          <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary }}>{member?.name?.split(' ')[0] ?? req.userId}</Text>
        </View>
        <Text style={{ fontSize: TYPO.heading, fontWeight: '900', color: '#059669' }}>
          {currencySymbol}{(req.amount * ratio).toFixed(2)}
        </Text>
      </View>

      <View style={{ backgroundColor: isDark ? colors.surface : '#ECFDF5', borderRadius: 12, padding: 12, marginBottom: 12 }}>
        {[
          { l: '🛍️ Spend', v: req.spendAllocation },
          { l: '🏦 Save',  v: req.saveAllocation  },
          { l: '❤️ Give',  v: req.giveAllocation  },
        ].map(j => (
          <View key={j.l} style={{ flexDirection: 'row', marginBottom: 4 }}>
            <Text style={{ flex: 1, fontSize: TYPO.caption, color: colors.textSecondary }}>{j.l}</Text>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#059669' }}>
              {j.v} pts ({currencySymbol}{(j.v * ratio).toFixed(2)})
            </Text>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable
          onPress={() => Alert.alert('Deny Cash-Out?', "Funds stay in their wallet.", [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Deny', style: 'destructive', onPress: () => denyCashOut(req.id) },
          ])}
          style={({ pressed }) => ({
            flex: 1, backgroundColor: isDark ? colors.surface : '#FEF2F2',
            borderRadius: 12, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#FCA5A5',
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#EF4444' }}>Deny</Text>
        </Pressable>
        <Pressable
          onPress={() => approveCashOut(req.id)}
          style={({ pressed }) => ({
            flex: 2, backgroundColor: '#059669', borderRadius: 12, padding: 10,
            alignItems: 'center', opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#fff' }}>💵 Approve Payout</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Redo sheet with preset reasons ──────────────────────────────────────────

function RedoSheet({ task, visible, onClose, isDark, colors, reviewerId }: {
  task: ChoreTask | null; visible: boolean; onClose: () => void;
  isDark: boolean; colors: any; reviewerId: string;
}) {
  const { requestRedo } = useChoreStore();
  const [preset, setPreset]   = useState<RejectionPresetKey | null>(null);
  const [customMsg, setCustomMsg] = useState('');
  const [loading, setLoading]     = useState(false);
  const keyboardAwareMaxHeight = useKeyboardAwareMaxHeight(90);

  const handleSend = () => {
    if (!task) return;
    const msg = preset === 'CUSTOM'
      ? customMsg.trim()
      : REJECTION_PRESETS.find(p => p.key === preset)?.label ?? '';
    if (!msg) { Alert.alert('Pick a reason', 'Choose a preset or type a custom message.'); return; }
    setLoading(true);
    // Spec 4.1/4.4: "the record should always show who acted." This
    // previously passed '' for reviewerId, so every redo request from this
    // sheet wrote a blank reviewed_by_id — approvals correctly recorded the
    // reviewer, declines from here silently didn't.
    requestRedo(task.id, reviewerId, msg, preset ?? undefined);
    setLoading(false);
    setPreset(null); setCustomMsg('');
    onClose();
  };

  if (!task) return null;

  const dismiss = () => { Keyboard.dismiss(); onClose(); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismiss} />
          <View style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12,
            maxHeight: keyboardAwareMaxHeight ?? '90%', backgroundColor: colors.card }}>

            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }} />

            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12,
              borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 20, fontWeight: '900', letterSpacing: -0.3, color: colors.textPrimary }}>Request Redo</Text>
              </View>
              <TouchableOpacity
                onPress={dismiss}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }}>
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="always"
              contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary, marginBottom: 16 }}>
          {task.title}
        </Text>

        {(task.redoCount ?? 0) >= 1 && (
          <View style={{ backgroundColor: isDark ? colors.amberLight : '#FEF3C7', borderRadius: 12, padding: 12, marginBottom: 16 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: isDark ? colors.amber : '#D97706' }}>
              ⚠️ This has already been sent back once. Next rejection will auto-approve.
            </Text>
          </View>
        )}

        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, marginBottom: 10 }}>
          What needs fixing?
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {REJECTION_PRESETS.map(p => (
            <Pressable
              key={p.key}
              onPress={() => setPreset(p.key)}
              style={({ pressed }) => ({
                backgroundColor: preset === p.key ? BRAND.purple : isDark ? colors.surface : '#F3F4F6',
                borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
                borderWidth: 1, borderColor: preset === p.key ? BRAND.purple : colors.border,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: preset === p.key ? '#fff' : colors.textSecondary }}>
                {p.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {preset === 'CUSTOM' && (
          <TextInput
            value={customMsg}
            onChangeText={setCustomMsg}
            placeholder="Describe what needs to be fixed…"
            placeholderTextColor={colors.textTertiary}
            multiline numberOfLines={3}
            style={{
              backgroundColor: isDark ? colors.surface : '#F9FAFB',
              borderRadius: 12, borderWidth: 1, borderColor: colors.border,
              padding: 12, fontSize: TYPO.body, color: colors.textPrimary,
              minHeight: 80, textAlignVertical: 'top', marginBottom: 16,
            }}
          />
        )}

        <View style={{ flexDirection: 'row', gap: 10, marginTop: preset === 'CUSTOM' ? 0 : 8 }}>
          <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: isDark ? colors.surface : '#F3F4F6', borderRadius: 14, padding: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={handleSend}
            disabled={loading || !preset}
            style={({ pressed }) => ({
              flex: 2, backgroundColor: preset ? '#EF4444' : colors.border,
              borderRadius: 14, padding: 14, alignItems: 'center', opacity: pressed || loading ? 0.7 : 1,
            })}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: preset ? '#fff' : colors.textTertiary }}>↩ Send Redo</Text>
            }
          </Pressable>
        </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ParentReviewDeckProps {
  parent: FamilyMember;
  members: FamilyMember[];
  colors: any;
  isDark: boolean;
  // ChoreReviewSection renders its own single empty state for the whole
  // section (covering every sub-list, not just this deck's) — without this,
  // that empty state and this deck's own "All caught up" stacked whenever
  // both had nothing, showing two near-identical empty messages at once.
  hideEmptyState?: boolean;
  // Reports this deck's own totalCount up to the parent so ChoreReviewSection
  // can fold cash-out requests (only tracked in here, via getPendingCashOuts)
  // into its own hasContent/empty-state decision instead of guessing.
  onContentCountChange?: (count: number) => void;
}

export function ParentReviewDeck({ parent, members, colors, isDark, hideEmptyState, onContentCountChange }: ParentReviewDeckProps) {
  const {
    approveChore, requestRedo, acceptGPOffer, declineGPOffer,
    approveBountyClaim, declineBountyClaim,
    resetDueRecurringChores, syncFromDB, loadFromStorage,
  } = useChoreStore();
  const allNames = members.map(m => m.name);

  const chores       = useChoreStore(s => s.chores);
  const transactions = useChoreStore(s => s.transactions);
  const getPendingCashOuts = useChoreStore(s => s.getPendingCashOuts);

  const { pendingSubmissions, pendingCashOuts, gpOffersPending, pendingBountyClaims } = useMemo(() => ({
    // pending_grandparent_approval is that GP's own completion review, not
    // the parent's — this deck's Approve button calls approveChore, which
    // requires status === 'pending_approval' and silently no-ops on
    // anything else, so including it here rendered a dead "Approve" button
    // for a chore only the sponsoring grandparent can actually complete.
    pendingSubmissions: chores.filter(c => c.status === 'pending_approval'),
    pendingCashOuts:    getPendingCashOuts(),
    // Scenario 1.6 — a caregiver GP holding a temporary-approver grant
    // passes canApprove()'s authorization check for acceptGPOffer/
    // declineGPOffer, but this deck (their only review surface — see
    // SeniorView.tsx's hasCaregiverAccess-gated render) had no card at all
    // for it, leaving them authorized with nothing to act on.
    gpOffersPending:    chores.filter(c => c.status === 'gp_offer_pending'),
    // A multi-slot bounty's per-claim submissions live entirely in
    // chore_tasks.claims (bounty_claims), never touching the parent chore's
    // own status — pendingSubmissions above can't see them at all. Flatten
    // every chore's pending_approval claims into their own review cards.
    pendingBountyClaims: chores.flatMap(c =>
      (c.claims ?? [])
        .filter(cl => cl.status === 'pending_approval')
        .map(cl => ({ chore: c, claim: cl })),
    ),
  }), [chores, transactions]);

  const [redoTask, setRedoTask] = useState<ChoreTask | null>(null);
  const [redoOpen, setRedoOpen] = useState(false);

  useEffect(() => {
    loadFromStorage().then(() => { syncFromDB(); resetDueRecurringChores(); });
  }, []);

  const totalCount = pendingSubmissions.length + pendingCashOuts.length + gpOffersPending.length + pendingBountyClaims.length;

  useEffect(() => { onContentCountChange?.(totalCount); }, [totalCount]);

  if (totalCount === 0) {
    if (hideEmptyState) return null;
    // Matches HouseholdBacklogSection's empty state — compact single-line
    // treatment, not a large heading+subtext box, so every Hub section's
    // "nothing here" moment reads the same.
    return (
      <View style={{ alignItems: 'center', paddingVertical: 12, gap: 4 }}>
        <CheckCircle2 size={18} color={colors.textTertiary} />
        <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, textAlign: 'center' }}>
          All caught up
        </Text>
      </View>
    );
  }

  return (
    <>
      {/* Plain View, not a ScrollView — this only ever renders nested inside
          ChoreReviewSection's own SectionCard, which already sits inside the
          Hub's outer ScrollView. A second ScrollView here caused scroll-
          inside-scroll AND double horizontal padding (this component's own
          16px on top of the section's), which visibly narrowed these cards
          versus the section header and every sibling card above them. */}
      <View>

        {/* 1. Child chore submissions — same card design as the (removed)
             duplicate that used to also show in Action Needed, so a
             submission only ever looks one way, in one place. Receipt-
             bearing submissions (a GP's purchase receipt awaiting
             reimbursement) keep the richer ReviewCard — QuestApprovalCard
             has no receipt/reimbursement UI at all, so routing those
             through it would silently drop that feature. No "Waiting for
             Review" sub-header here — when this deck renders inside
             ChoreReviewSection (the Hub), that section's own header
             ("Chore Reviews · N pending approval") already says the same
             thing; repeating it directly above the list read as a bug. */}
        {pendingSubmissions.length > 0 && (
          <>
            {pendingSubmissions.map(task => (
              task.receiptPhotoUrl || task.receiptAmount != null ? (
                <ReviewCard
                  key={task.id} task={task} members={members}
                  colors={colors} isDark={isDark}
                  onApprove={(t) => Alert.alert('Approve?', `Award ${t.basePoints} pts for "${t.title}"?`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: '✓ Approve', onPress: () => approveChore(t.id, parent.id) },
                  ])}
                  onRedo={(t) => { setRedoTask(t); setRedoOpen(true); }}
                />
              ) : (
                <QuestApprovalCard
                  key={task.id} q={choreToQuest(task)} active={parent} members={members} allNames={allNames}
                  colors={colors} isDark={isDark}
                  approveQuest={(id) => approveChore(id, parent.id)}
                  declineQuest={(id, by, reason) => requestRedo(id, by, reason)}
                  onDeclinePress={() => { setRedoTask(task); setRedoOpen(true); }}
                />
              )
            ))}
          </>
        )}

        {/* 1b. Multi-slot bounty claims — see pendingBountyClaims comment above */}
        {pendingBountyClaims.length > 0 && (
          <>
            <SectionHeader emoji="🏆" title="Bounty Claims" count={pendingBountyClaims.length} colors={colors} />
            {pendingBountyClaims.map(({ chore, claim }) => (
              <BountyClaimReviewCard
                key={claim.id} chore={chore} claim={claim} members={members}
                colors={colors} isDark={isDark}
                onApprove={(choreId, memberId) => approveBountyClaim(choreId, memberId, parent.id)}
                onDecline={(choreId, memberId) => declineBountyClaim(choreId, memberId, parent.id)}
              />
            ))}
          </>
        )}

        {/* 2. GP offers awaiting Accept/Decline */}
        {gpOffersPending.length > 0 && (
          <>
            <SectionHeader emoji="🤝" title="Grandparent Offers" count={gpOffersPending.length} colors={colors} />
            {gpOffersPending.map(c => (
              <GpOfferReviewCard
                key={c.id} c={c} members={members} colors={colors} isDark={isDark} active={parent}
                acceptGPOffer={acceptGPOffer} declineGPOffer={declineGPOffer}
              />
            ))}
          </>
        )}

        {/* 3. Cash-out requests */}
        {pendingCashOuts.length > 0 && (
          <>
            <SectionHeader emoji="💵" title="Cash-Out Requests" count={pendingCashOuts.length} colors={colors} />
            {pendingCashOuts.map((req: any) => (
              <CashOutCard
                key={req.id} req={req} member={members.find(m => m.id === req.userId)}
                colors={colors} isDark={isDark}
              />
            ))}
          </>
        )}
      </View>

      <RedoSheet
        task={redoTask} visible={redoOpen}
        onClose={() => { setRedoOpen(false); setRedoTask(null); }}
        isDark={isDark} colors={colors} reviewerId={parent.id}
      />
    </>
  );
}
