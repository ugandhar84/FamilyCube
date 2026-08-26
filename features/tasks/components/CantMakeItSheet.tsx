/**
 * CantMakeItSheet — one "reason, then what happens next" flow for a kid or
 * teen declining a chore assigned to them, used identically by both the
 * unified Tasks tab (QuestsScreen via QuestCard's onCantMakeIt) and Hub's
 * per-role views (KidView/TeenView) so the same action surface appears in
 * both places instead of two drifting decline vocabularies (this replaced
 * the old, chore-only DeclineQuestSheet). Dispatch lives in
 * features/tasks/lib/cantMakeIt.ts, delegating to choreStore's
 * declineChoreAssignment rather than re-deriving its 3-way logic.
 *
 * Accepts an event target too (CantMakeItItem is a chore|event union), but
 * nothing currently passes one — see cantMakeIt.ts's header comment for why
 * events route through hubComponents.tsx's EventDetailSheet instead, which
 * already implements a more complete staged flow.
 *
 * Two-Bounce adult delegation (PushbackSheet) is a different, separate
 * flow — not replaced here.
 */
import { useState } from 'react';
import { View, Text, Pressable, TextInput, Modal, KeyboardAvoidingView, ScrollView, Platform, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS, SPACING } from '@/constants/theme';
import type { FamilyMember } from '@/store/familyStore';
import { resolveCantMakeIt, type CantMakeItItem, type CantMakeItOutcome } from '../lib/cantMakeIt';
import { showToast } from '@/components/AppToast';

const REASONS = ['Something came up', 'Not feeling well', 'No ride', 'Need more time', 'Too hard, need help'];

export function CantMakeItSheet({
  target, byMemberId, members, onClose,
}: {
  target: CantMakeItItem | null;
  byMemberId: string;
  members: FamilyMember[];
  onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [reassignTo, setReassignTo] = useState<string | null>(null);

  const close = () => {
    setReason(''); setCustomReason(''); setStep(1); setReassignTo(null);
    onClose();
  };
  const dismiss = () => { Keyboard.dismiss(); close(); };

  const finalReason = (reason || customReason).trim();
  const title = target?.item.title ?? '';

  const submit = (outcome: CantMakeItOutcome) => {
    if (!target || !finalReason) return;
    const reassignMember = reassignTo ? members.find(m => m.id === reassignTo) : undefined;
    resolveCantMakeIt(target, outcome, finalReason, byMemberId, {
      reassignToMemberId: reassignMember?.id,
      reassignToMemberName: reassignMember?.name,
    });
    showToast(
      outcome === 'pool' ? "Marked — you're off this one ✓"
      : outcome === 'reassign' ? `Sent to ${reassignMember?.name?.split(' ')[0] ?? 'them'} ✓`
      : outcome === 'later' ? 'Sent back to re-time ✓'
      : 'Cancelled ✓'
    );
    close();
  };

  // Kids should never be able to hand a "can't do it" chore to a
  // grandparent (or a parent) — a kid picking a reassign target only ever
  // gets to pick another kid/teen, same restriction already established
  // for KidChoreProposalModal's recipient picker. A parent/teen using this
  // same sheet keeps the full family list — this restriction is specific
  // to a kid acting on their own chore.
  const actingMember = members.find(m => m.id === byMemberId);
  const otherMembers = members.filter(m =>
    m.id !== byMemberId &&
    (actingMember?.role !== 'kid' || m.role === 'kid' || m.role === 'teen')
  );

  return (
    <Modal visible={!!target} transparent animationType="slide" onRequestClose={dismiss}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <Pressable style={{ flex: 1 }} onPress={dismiss} />
          <View style={{ borderTopLeftRadius: RADIUS.xxl, borderTopRightRadius: RADIUS.xxl, paddingTop: 12, maxHeight: '90%', backgroundColor: colors.card,
            borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border,
            shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: -6 }, elevation: 8 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }} />

            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.heading, fontWeight: '900', letterSpacing: -0.3, color: colors.textPrimary }}>Can't make it?</Text>
                {!!title && <Text style={{ fontSize: TYPO.caption, fontWeight: '700', marginTop: 2, color: colors.danger }}>{title}</Text>}
              </View>
              <Pressable onPress={dismiss} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? colors.surface : '#F1F5F9' }}>
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="always" contentContainerStyle={{ padding: 20, paddingBottom: 24, gap: 14 }} showsVerticalScrollIndicator={false}>
              {step === 1 ? (
                <>
                  <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>First — what came up?</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {REASONS.map(preset => (
                      <Pressable key={preset} onPress={() => setReason(preset)}
                        style={{ borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 8,
                          backgroundColor: reason === preset ? colors.danger : (isDark ? colors.surface : '#FEF2F2'),
                          borderWidth: 1.5, borderColor: reason === preset ? colors.danger : colors.danger + '30' }}>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: reason === preset ? '#fff' : colors.danger }}>{preset}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={{ borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: isDark ? colors.surface : '#FAFAFA', paddingHorizontal: 12, paddingVertical: 10 }}>
                    <TextInput
                      value={customReason} onChangeText={t => { setCustomReason(t); if (t) setReason(''); }}
                      placeholder="Or add your own reason…" placeholderTextColor={colors.textTertiary}
                      style={{ fontSize: TYPO.body, color: colors.textPrimary, minHeight: 44 }} multiline
                    />
                  </View>
                  <Pressable
                    disabled={!finalReason}
                    onPress={() => setStep(2)}
                    style={{ borderRadius: RADIUS.md, paddingVertical: 14, alignItems: 'center',
                      backgroundColor: finalReason ? colors.primary : colors.border, opacity: finalReason ? 1 : 0.5 }}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '900', color: '#fff' }}>Next</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>Now — what should happen to it?</Text>

                  <Pressable onPress={() => submit('pool')}
                    style={{ borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.border, backgroundColor: isDark ? colors.surface : '#F8FAFC', padding: SPACING.md }}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>Put it back for anyone</Text>
                    <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>Reopens right away</Text>
                  </Pressable>

                  <View style={{ borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.border, backgroundColor: isDark ? colors.surface : '#F8FAFC', padding: SPACING.md, gap: 8 }}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>Hand it to someone specific</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {otherMembers.map(m => {
                        const sel = reassignTo === m.id;
                        return (
                          <Pressable key={m.id} onPress={() => setReassignTo(sel ? null : m.id)}
                            style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.full, borderWidth: 1.5,
                              backgroundColor: sel ? colors.primary + '18' : (isDark ? colors.card : '#fff'),
                              borderColor: sel ? colors.primary : colors.border }}>
                            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: sel ? colors.primary : colors.textSecondary }}>
                              {m.name.split(' ')[0]}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Pressable
                      disabled={!reassignTo}
                      onPress={() => submit('reassign')}
                      style={{ borderRadius: RADIUS.sm, paddingVertical: 10, alignItems: 'center',
                        backgroundColor: reassignTo ? colors.amber : colors.border, opacity: reassignTo ? 1 : 0.5, marginTop: 2 }}>
                      <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>Send it over</Text>
                    </Pressable>
                  </View>

                  <Pressable onPress={() => submit('later')}
                    style={{ borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.border, backgroundColor: isDark ? colors.surface : '#F8FAFC', padding: SPACING.md }}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>Ask for a later time</Text>
                    <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>Goes back to a parent to re-time</Text>
                  </Pressable>

                  <Pressable onPress={() => submit('cancel')}
                    style={{ borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.danger + '60', backgroundColor: isDark ? colors.surface : '#FEF2F2', padding: SPACING.md }}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.danger }}>It's not needed anymore</Text>
                    <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>Cancels it, tells everyone</Text>
                  </Pressable>

                  <Pressable onPress={() => setStep(1)} style={{ alignItems: 'center', paddingVertical: 6 }}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>← Back</Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
