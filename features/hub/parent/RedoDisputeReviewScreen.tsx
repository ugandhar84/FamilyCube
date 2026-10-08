/**
 * RedoDisputeReviewScreen — "a kid disputed a redo, goes to a SECOND
 * parent" decision screen.
 *
 * Live-reported gap: status 'kid_disputed_redo' (QA punch list #5 — the
 * kid's own "I did do it — ask [a parent]" path, store/choreStore.ts's
 * disputeRedo) had NO entry point anywhere on the Hub. getParentReviewDeck()
 * only filters status === 'pending_approval', so a dispute never appeared
 * in the unified Review inbox's "Chores & Quests" category at all — a real
 * "needs a decision" state that was invisible until a parent happened to
 * reopen the exact chore from elsewhere. "we should land the disputed
 * cases like this" — pasted Figma spec: workflow-status pill ("Disputed"),
 * an attention row with a rotate-ccw icon (the redo being disputed), the
 * kid's original submission text in a bordered field, then a primary
 * "Approve & pay" destination and a secondary "Side with the redo"
 * destination, with a mint explainer card beneath.
 *
 * resolve_redo_dispute's RPC blocks a parent from resolving their OWN
 * redo call (reviewedById) — this screen surfaces that as a disabled
 * state with an explanation instead of a generic failed-save toast if the
 * acting parent is the one who requested the redo in the first place.
 */
import React, { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TouchableOpacity, ActivityIndicator, Platform, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, RotateCcw } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useChoreStore } from '@/store/choreStore';
import { useFamilyStore } from '@/store/familyStore';

export function RedoDisputeReviewScreen({ choreId, onClose }: {
  choreId: string;
  onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const chore = useChoreStore(s => s.chores.find(c => c.id === choreId));
  const resolveRedoDispute = useChoreStore(s => s.resolveRedoDispute);
  const { members, activeMemberId } = useFamilyStore();
  const [busy, setBusy] = useState<'pay' | 'redo' | null>(null);

  const canvas = isDark ? '#0E0C13' : '#FFFFFF';
  const cardWhiteBg = isDark ? colors.card : '#FFFFFF';
  const cardMintBg  = isDark ? '#0D1F18' : '#DDF5EC';
  const mintText    = isDark ? colors.teal : '#16705F';
  const statusBg    = isDark ? colors.danger + '22' : '#FFE8E3';
  const statusText  = colors.danger;
  const linkBlue    = colors.teal;

  if (!chore) {
    return (
      <View style={{ flex: 1, backgroundColor: canvas, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textSecondary }}>This dispute is no longer available.</Text>
      </View>
    );
  }

  const assignee = members.find(m => m.id === chore.assignedToId);
  // The parent who requested the redo being disputed — resolve_redo_
  // dispute's own RPC blocks them from resolving their own call, so this
  // screen disables both actions with an explanation for that specific
  // parent instead of letting them tap through to a generic failed-save
  // toast (same class of bug this session already fixed for a different
  // "a generic couldn't-update toast isn't an acceptable terminal state"
  // case — see CLAUDE.md rule 6).
  const isOwnRedoCall = !!chore.reviewedById && chore.reviewedById === activeMemberId;

  async function act(pay: boolean) {
    if (!activeMemberId || isOwnRedoCall) return;
    setBusy(pay ? 'pay' : 'redo');
    await resolveRedoDispute(choreId, activeMemberId, pay);
    setBusy(null);
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
            <Text style={{ fontSize: 13, fontWeight: '500', color: linkBlue, lineHeight: 18 }}>← Review inbox</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
            <Text style={{ flex: 1, fontSize: 29, fontWeight: '700', lineHeight: 41, letterSpacing: -0.5, color: colors.textPrimary }}>
              Second opinion
            </Text>
            <Pressable
              onPress={onClose}
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}
            >
              <X size={16} color={colors.textSecondary} strokeWidth={2.5} />
            </Pressable>
          </View>
          <View style={{ alignSelf: 'flex-start', backgroundColor: statusBg, borderRadius: 100, paddingVertical: 5, paddingHorizontal: 10 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: statusText }}>Disputed — second parent needed</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Detail card: what happened ── */}
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
          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textPrimary, lineHeight: 18 }}>
            {assignee?.name?.split(' ')[0] ?? 'Someone'} says the redo wasn't fair — they're asking a second parent to take a look before it goes back to them.
          </Text>
          {isOwnRedoCall && (
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.danger, lineHeight: 18 }}>
              You requested this redo — a different parent needs to weigh in, not you.
            </Text>
          )}
        </View>

        {/* ── Detail card: the original submission being disputed ── */}
        <View style={{
          backgroundColor: cardWhiteBg, borderRadius: 16, padding: 16, gap: 12,
          ...Platform.select({
            ios: { shadowColor: colors.navy, shadowOffset: { width: 0, height: 2 }, shadowOpacity: isDark ? 0.18 : 0.07, shadowRadius: 8 },
            android: { elevation: 2 },
          }),
        }}>
          <Text style={{ fontSize: 20, fontWeight: '600', color: colors.textPrimary, lineHeight: 28 }}>
            What they submitted
          </Text>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <RotateCcw size={20} color={colors.danger} strokeWidth={1.8} style={{ marginTop: 2 }} />
            <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.textPrimary, lineHeight: 25 }}>
              {chore.rejectionReason ? `Redo requested: "${chore.rejectionReason}"` : 'A redo was requested on this submission.'}
            </Text>
          </View>
          <View style={{
            borderWidth: 1, borderColor: isDark ? colors.border : '#DFE5EF', borderRadius: 14,
            padding: 14, minHeight: 88,
          }}>
            <Text style={{ fontSize: 14, color: colors.textPrimary, lineHeight: 24 }}>
              {chore.submissionNote || 'No note was left with the submission.'}
            </Text>
          </View>
        </View>

        {/* ── Decision ── */}
        <View style={{
          backgroundColor: cardMintBg, borderRadius: 16, padding: 16, gap: 12,
        }}>
          <Text style={{ fontSize: 20, fontWeight: '600', color: colors.textPrimary, lineHeight: 28 }}>
            Make the call
          </Text>
          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textPrimary, lineHeight: 18 }}>
            Approve & pay settles it in {assignee?.name?.split(' ')[0] ?? 'their'} favor — coins land immediately, same as any approval.
          </Text>
          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textPrimary, lineHeight: 18 }}>
            Side with the redo sends it back to the queue — {assignee?.name?.split(' ')[0] ?? 'they'} will need to resubmit.
          </Text>

          <Pressable
            disabled={isOwnRedoCall || busy !== null}
            onPress={() => act(true)}
            style={({ pressed }) => ({
              flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
              height: 48, backgroundColor: colors.primary,
              borderRadius: 14, opacity: (isOwnRedoCall || pressed) ? 0.6 : 1,
            })}
          >
            {busy === 'pay'
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ fontSize: 15, fontWeight: '600', color: '#FFFFFF' }}>Approve & pay →</Text>}
          </Pressable>

          <Pressable
            disabled={isOwnRedoCall || busy !== null}
            onPress={() => act(false)}
            style={({ pressed }) => ({
              flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
              height: 48, backgroundColor: cardWhiteBg,
              borderWidth: 1, borderColor: isDark ? colors.border : '#DFE5EF',
              borderRadius: 14, opacity: (isOwnRedoCall || pressed) ? 0.6 : 1,
            })}
          >
            {busy === 'redo'
              ? <ActivityIndicator color={linkBlue} />
              : <Text style={{ fontSize: 15, fontWeight: '600', color: linkBlue }}>Side with the redo</Text>}
          </Pressable>

          <Text style={{ fontSize: 13, fontWeight: '500', color: mintText, lineHeight: 18 }}>
            This decision is final — the kid won't be asked again for this submission.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
