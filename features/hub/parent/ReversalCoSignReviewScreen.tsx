/**
 * ReversalCoSignReviewScreen — "a parent is asking to reverse another
 * parent's approval" decision screen. The second half of the two dispute
 * types this app has — kid-disputed-redo (RedoDisputeReviewScreen) is the
 * OTHER one.
 *
 * requestApprovalReversal (choreStore.ts) sets disputeStatus:
 * 'reversal_requested' on an already-approved/paid chore and does nothing
 * financial yet — coSignReversal is the only thing that actually executes
 * it (via _executeReversal: flips to declined, claws back the coins paid
 * out). coSignReversal's own guard blocks the co-sign unless
 * coSigningParentId === chore.reviewedById — the ORIGINAL approving
 * parent, not the one who requested the reversal, must be the one who
 * signs off. This screen surfaces that as a disabled state with an
 * explanation for the requesting parent, same pattern
 * RedoDisputeReviewScreen uses for its own "can't resolve your own call"
 * guard.
 */
import React, { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TouchableOpacity, ActivityIndicator, Platform, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, ShieldCheck } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useChoreStore } from '@/store/choreStore';
import { useFamilyStore } from '@/store/familyStore';

export function ReversalCoSignReviewScreen({ choreId, onClose }: {
  choreId: string;
  onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const chore = useChoreStore(s => s.chores.find(c => c.id === choreId));
  const coSignReversal = useChoreStore(s => s.coSignReversal);
  const { members, activeMemberId } = useFamilyStore();
  const [busy, setBusy] = useState(false);

  const canvas = isDark ? '#0E0C13' : '#FFFFFF';
  const cardWhiteBg = isDark ? colors.card : '#FFFFFF';
  const cardPeachBg = isDark ? '#1E1210' : '#FFE8E3';
  const statusBg     = isDark ? colors.danger + '22' : '#FFE8E3';
  const statusText   = colors.danger;
  const linkBlue      = colors.teal;

  if (!chore || chore.disputeStatus !== 'reversal_requested') {
    return (
      <View style={{ flex: 1, backgroundColor: canvas, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textSecondary }}>This reversal request is no longer pending.</Text>
      </View>
    );
  }

  const requester = members.find(m => m.id === chore.disputedById);
  const approver  = members.find(m => m.id === chore.reviewedById);
  const assignee  = members.find(m => m.id === chore.assignedToId);
  // Only the ORIGINAL approving parent (chore.reviewedById) can co-sign —
  // coSignReversal's own guard. The requesting parent viewing this screen
  // sees why nothing happens if they tap the button, instead of a generic
  // failed-save toast.
  const canCoSign = activeMemberId === chore.reviewedById;
  const coinsAtStake = (chore.basePoints > 0 ? chore.basePoints : chore.coinsReward) + (chore.bonusCoins ?? 0);

  async function handleCoSign() {
    if (!activeMemberId || !canCoSign) return;
    setBusy(true);
    await coSignReversal(choreId, activeMemberId);
    setBusy(false);
    onClose();
  }

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <View style={{
        paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: isDark ? colors.border : 'rgba(223,97,60,0.08)',
        backgroundColor: canvas, gap: 8,
      }}>
        <View style={{ gap: 4 }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: linkBlue, lineHeight: 18 }}>← Disputes</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
            <Text style={{ flex: 1, fontSize: 29, fontWeight: '700', lineHeight: 41, letterSpacing: -0.5, color: colors.textPrimary }}>
              Co-sign review
            </Text>
            <Pressable
              onPress={onClose}
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}
            >
              <X size={16} color={colors.textSecondary} strokeWidth={2.5} />
            </Pressable>
          </View>
          <View style={{ alignSelf: 'flex-start', backgroundColor: statusBg, borderRadius: 100, paddingVertical: 5, paddingHorizontal: 10 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: statusText }}>Reversal awaiting co-sign</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── What's being asked ── */}
        <View style={{
          backgroundColor: cardWhiteBg, borderRadius: 16, padding: 16, gap: 12,
          ...Platform.select({
            ios: { shadowColor: colors.navy, shadowOffset: { width: 0, height: 2 }, shadowOpacity: isDark ? 0.18 : 0.07, shadowRadius: 8 },
            android: { elevation: 2 },
          }),
        }}>
          <Text style={{ fontSize: 20, fontWeight: '600', color: colors.textPrimary, lineHeight: 28 }}>
            {chore.title}
          </Text>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <ShieldCheck size={20} color={colors.danger} strokeWidth={1.8} style={{ marginTop: 2 }} />
            <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.textPrimary, lineHeight: 25 }}>
              {approver?.name?.split(' ')[0] ?? 'A parent'} approved this for {assignee?.name?.split(' ')[0] ?? 'the kid'}, and {requester?.name?.split(' ')[0] ?? 'another parent'} is now asking to reverse it{chore.disputeReason ? ` — "${chore.disputeReason}"` : ''}.
            </Text>
          </View>
        </View>

        {/* ── Safety rail — explains the co-sign rule + what happens ── */}
        <View style={{ backgroundColor: cardPeachBg, borderRadius: 16, padding: 16, gap: 12 }}>
          <Text style={{ fontSize: 20, fontWeight: '600', color: colors.textPrimary, lineHeight: 28 }}>
            Only {approver?.name?.split(' ')[0] ?? 'the original approver'} can co-sign
          </Text>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <ShieldCheck size={20} color={colors.danger} strokeWidth={1.8} style={{ marginTop: 2 }} />
            <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.textPrimary, lineHeight: 25 }}>
              {canCoSign
                ? `Co-signing reverses the approval: ${assignee?.name?.split(' ')[0] ?? 'the kid'}'s wallet loses ${coinsAtStake} coins and the chore goes back to declined. This can't be undone from here.`
                : `You requested this reversal, so you can't co-sign it yourself. Completion and the wallet stay unchanged until ${approver?.name?.split(' ')[0] ?? 'the original approver'} reviews it.`}
            </Text>
          </View>
          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textPrimary, lineHeight: 18 }}>
            Nothing has changed yet — approval, completion, and the coin balance all stay exactly as they are until this is co-signed.
          </Text>
        </View>

        <Pressable
          disabled={!canCoSign || busy}
          onPress={handleCoSign}
          style={({ pressed }) => ({
            flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
            height: 48, backgroundColor: colors.primary,
            borderRadius: 14, opacity: (!canCoSign || pressed) ? 0.5 : 1,
          })}
        >
          {busy
            ? <ActivityIndicator color="#fff" />
            : <Text style={{ fontSize: 15, fontWeight: '600', color: '#FFFFFF' }}>Co-sign & reverse →</Text>}
        </Pressable>

        <Pressable onPress={onClose} style={({ pressed }) => ({
          flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
          height: 48, backgroundColor: cardWhiteBg,
          borderWidth: 1, borderColor: isDark ? colors.border : '#DFE5EF',
          borderRadius: 14, opacity: pressed ? 0.75 : 1,
        })}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: linkBlue }}>Not yet — leave it pending</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
