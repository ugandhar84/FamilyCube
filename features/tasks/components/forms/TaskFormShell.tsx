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
import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Modal, Keyboard, Platform,
  TouchableWithoutFeedback, StyleSheet,
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
  const keyboardAwareMaxHeight = useKeyboardAwareMaxHeight(75, 90);

  // Live-reported: "form is hiding behind the keyboard litrally" — capping
  // the sheet's own maxHeight (above) only stops its TOP from going past
  // the top of the screen; it does nothing to move the sheet's BOTTOM off
  // the physical screen edge, which is exactly where s.backdrop's
  // justifyContent:'flex-end' anchors it. With the keyboard covering that
  // same physical bottom edge, the sheet kept rendering underneath it —
  // shrinking its max height just meant less of the (still-hidden) sheet
  // existed, not that any more of it became visible. The previous comment
  // here reasoned the height clamp alone was sufficient; live testing
  // showed the whole scrollable body invisible behind the keyboard, header
  // and progress bar the only visible remnant. A real vertical shift
  // (marginBottom = keyboard height) is what actually lifts the sheet
  // above it — this is NOT the same thing as wrapping the whole Modal in
  // KeyboardAvoidingView (already tried and reverted, see below): that
  // slid the sheet AND kept it at its full un-clamped height, pushing the
  // footer arbitrarily high. This only shifts position; the height clamp
  // above still does the shrinking.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) => setKeyboardHeight(e.endCoordinates?.height ?? 0));
    const hide = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const currentStepId = stepIds[Math.min(step, stepIds.length - 1)];
  const isReview = currentStepId === reviewStepId;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Live-reported: KeyboardAvoidingView previously wrapped the WHOLE
          sheet — 'padding' behavior slid the entire card (including the
          fixed Next button) up 1:1 with the keyboard, so the button kept
          chasing the keyboard instead of staying anchored near the
          screen's bottom edge. Removed entirely — the sheet is
          bottom-anchored (s.backdrop's justifyContent:'flex-end') and now
          explicitly shifted up by the real keyboard height (marginBottom
          below), independent of and in addition to its own maxHeight
          clamp. The ScrollView's flexShrink:1 lets the body shrink to fit
          inside that clamped height while the header/progress row all
          stay fixed in place; the Next/submit button now lives INSIDE the
          ScrollView (see below) so it's never a separate fixed element
          that could end up mispositioned on its own. */}
        <View style={[s.backdrop, { paddingBottom: keyboardHeight }]}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
          <View style={[s.sheet, { backgroundColor: colors.card,
            borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border,
            shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: -6 }, elevation: 8,
            ...(keyboardAwareMaxHeight !== undefined ? { maxHeight: keyboardAwareMaxHeight } : {}) }]}>
            {/* Drag handle */}
            <View style={[s.handle, { backgroundColor: colors.border }]} />

            {/* ── Fixed header — the title/subtitle text block is wrapped
                to dismiss the keyboard on tap (live-requested: tapping
                outside a text input should close it); the close button
                stays a sibling Touchable, untouched, so it keeps working
                in one tap rather than risking TouchableWithoutFeedback
                swallowing it. ── */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={[s.title, { color: colors.textPrimary }]}>{headerTitle}</Text>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', marginTop: 2, color: accentColor }}>
                    {headerSubtitle}
                  </Text>
                </View>
              </TouchableWithoutFeedback>
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
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: accentColor, marginBottom: 10, marginTop: -6 }}>
                {stepTitles[currentStepId]}
              </Text>
            </TouchableWithoutFeedback>

            {/* ── Scrollable step body. flexShrink:1 here + on the sheet is
                the footer-clipping fix, applied once for both modals. ── */}
            {/* No automaticallyAdjustKeyboardInsets — see AppBottomSheet.tsx's
                own comment on this same fix: it double-compensates alongside
                the KeyboardAvoidingView wrapping this whole sheet, producing
                a blank gap above the real content. */}
            <ScrollView
              style={{ flexShrink: 1 }}
              // 'handled' (not 'always'): a tap on any real button/input
              // still registers in one tap same as before, but a tap on
              // blank space now falls through and dismisses the keyboard
              // (live-requested — tapping outside a text input should
              // close the keyboard) instead of being swallowed silently.
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: Math.max(16, insets.bottom + 8) }}
            >
              <StepTransition stepKey={currentStepId}>
                {children}
              </StepTransition>

              {/* Live-requested: "add buttons also in the scroll view" — Next
                  used to live in a fixed footer BELOW the ScrollView, a
                  separate element the keyboard-shift/height-clamp above had
                  to keep correctly positioned on its own. Moving it inside
                  the scroll means it's just more content: it scrolls into
                  view along with everything else and can never end up
                  clipped or mispositioned independently of the fields above
                  it. review's own submit button still renders as part of
                  `children` (unchanged). */}
              {!isReview && (
                <View style={{ paddingTop: 10 }}>
                  <TouchableOpacity
                    style={[s.footerBtn, { backgroundColor: accentColor }]}
                    onPress={() => setStep(p => Math.min(p + 1, stepIds.length - 1))}
                  >
                    <Text style={{ color: colors.textInverse, fontWeight: '900', fontSize: TYPO.body }}>Next</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
          {/* Filler pinned to the very bottom of the backdrop, UNDER the
              sheet, same color as the sheet — live-requested: "tuck in to
              the keyboard some part of form so that it will not expose
              transparent, or close the transparent with the color filled."
              paddingBottom on the backdrop (above) reserves room for the
              keyboard so the sheet's flex-end position naturally lands
              above it, but keyboardWillShow's reported height doesn't
              always land pixel-perfect against where the keyboard actually
              settles (predictive-text bar, slide-animation timing) — this
              absolutely-positioned filler covers that reserved region
              regardless of the exact px, so any measurement slop reads as
              "the sheet's own color extends down to the keyboard" instead
              of the backdrop's semi-transparent scrim showing through.
              Positioned absolute (not a normal flex sibling) so it sits
              BEHIND the sheet's bottom edge instead of competing with it
              for the backdrop's flex-end space. pointerEvents:'none' since
              the keyboard itself already physically occupies this area. */}
          {keyboardHeight > 0 && (
            <View pointerEvents="none"
              style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: keyboardHeight, backgroundColor: colors.card }} />
          )}
        </View>
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
