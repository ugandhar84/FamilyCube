/**
 * TaskFormShell — the ONE stepper frame shared by AddEventModal and
 * AddQuestModal.
 *
 * Both modals independently hand-built the same wizard chrome: a bottom
 * sheet with a drag handle, a title/subtitle header + close button, a
 * progress row (back-chevron once past step 0, N segment bars, an "X/N"
 * counter, the current step's title), a scrolling body, and a footer "Next"
 * button on every step except the last. Two copies of the same thing drift:
 * a footer-clipping fix landed in EventFormModal's copy this session and
 * would have had to be re-applied by hand to AddQuestModal's copy. It lives
 * here once instead — `sheet` gets flexShrink:1 and the body ScrollView gets
 * style={{ flexShrink: 1 }}, so a tall step shrinks the scroll area rather
 * than pushing the footer button off-screen.
 *
 * What deliberately stays with each caller: the review step's own submit
 * button (wording differs — "Send Request to Parent" vs "Add Chore to
 * Board") and its validation copy. Those render as part of `children` on the
 * review step, inside the scroll, so a disabled-reason stays attached to the
 * summary it refers to.
 */
import React from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Modal,
  KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO } from '@/constants/theme';
import StepProgressBar from '@/components/StepProgressBar';
import StepTransition from '@/components/StepTransition';
import { useKeyboardAwareMaxHeight } from '@/lib/useKeyboardAwareMaxHeight';

export function TaskFormShell({
  visible, onClose, stepIds, stepTitles, step, setStep,
  accentColor, headerTitle, headerSubtitle, reviewStepId = 'review',
  children,
}: {
  visible: boolean;
  onClose: () => void;
  // The step list is the caller's — AddQuestModal's is conditional (the
  // grocery step only exists for Errand/Shopping), AddEventModal's is fixed.
  stepIds: readonly string[];
  stepTitles: Record<string, string>;
  step: number;
  setStep: React.Dispatch<React.SetStateAction<number>>;
  // Event category color, or quest purple — the one theming knob.
  accentColor: string;
  headerTitle: string;
  headerSubtitle: string;
  // Which step id renders its own submit button instead of the footer Next.
  reviewStepId?: string;
  children: React.ReactNode;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  // s.sheet's maxHeight: '75%' is static against the full screen — clamp
  // it once the keyboard opens so it can't get pushed past the top of the
  // screen (same class of bug fixed in AppBottomSheet.tsx). Falls through
  // to the sheet's own 75% when the keyboard is closed.
  const keyboardAwareMaxHeight = useKeyboardAwareMaxHeight(75);

  const currentStepId = stepIds[Math.min(step, stepIds.length - 1)];
  const isReview = currentStepId === reviewStepId;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.backdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
          <View style={[s.sheet, { backgroundColor: colors.card,
            borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border,
            shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: -6 }, elevation: 8,
            ...(keyboardAwareMaxHeight !== undefined ? { maxHeight: keyboardAwareMaxHeight } : {}) }]}>
            {/* Drag handle */}
            <View style={[s.handle, { backgroundColor: colors.border }]} />

            {/* ── Fixed header ── */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[s.title, { color: colors.textPrimary }]}>{headerTitle}</Text>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', marginTop: 2, color: accentColor }}>
                  {headerSubtitle}
                </Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ padding: 8, borderRadius: 20, backgroundColor: isDark ? colors.surface : '#F1F5F9' }}
              >
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* ── Step progress — one segment per ACTUAL step for this flow
                (4 or 5 for chores depending on the grocery step), plus a
                Back chevron once past step 0. ── */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              {step > 0 && (
                <TouchableOpacity onPress={() => setStep(p => p - 1)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
              <StepProgressBar stepCount={stepIds.length} activeIndex={step} accentColor={accentColor}
                trackColor={isDark ? colors.border : '#E2E8F0'} />
              <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.textTertiary }}>
                {step + 1}/{stepIds.length}
              </Text>
            </View>
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: accentColor, marginBottom: 10, marginTop: -6 }}>
              {stepTitles[currentStepId]}
            </Text>

            {/* ── Scrollable step body. flexShrink:1 here + on the sheet is
                the footer-clipping fix, applied once for both modals. ── */}
            {/* No automaticallyAdjustKeyboardInsets — see AppBottomSheet.tsx's
                own comment on this same fix: it double-compensates alongside
                the KeyboardAvoidingView wrapping this whole sheet, producing
                a blank gap above the real content. */}
            <ScrollView
              style={{ flexShrink: 1 }}
              keyboardShouldPersistTaps="always"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: isReview ? Math.max(48, insets.bottom + 32) : 48 }}
            >
              <StepTransition stepKey={currentStepId}>
                {children}
              </StepTransition>
            </ScrollView>

            {/* ── Footer nav — Next on every step but review, which renders
                its own submit button inside the scroll above instead. ── */}
            {!isReview && (
              <View style={{ paddingTop: 10, paddingBottom: Math.max(16, insets.bottom + 8) }}>
                <TouchableOpacity
                  style={[s.footerBtn, { backgroundColor: accentColor }]}
                  onPress={() => setStep(p => Math.min(p + 1, stepIds.length - 1))}
                >
                  <Text style={{ color: colors.textInverse, fontWeight: '900', fontSize: TYPO.body }}>Next</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}


const s = StyleSheet.create({
  backdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  // flexShrink:1 — without it a tall step grows the sheet past maxHeight and
  // the footer Next button clips off the bottom of the screen.
  sheet:     { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12, maxHeight: '75%', flexShrink: 1 },
  handle:    { width: 44, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  title:     { fontSize: TYPO.heading, fontWeight: '900' },
  footerBtn: { borderRadius: 16, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
});
