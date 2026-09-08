/**
 * KioskTaskFormShell — kiosk-only replacement for TaskFormShell.tsx (the
 * ONE shared wizard chrome AddQuestModal.tsx and AddEventModal.tsx both
 * use), same right-side drawer shape as KioskFormDrawer/KioskDateTimePicker
 * [live-reported: "im asking the move that to right side narrow form
 * similar to add medication" / "smart tasker also right side form"].
 *
 * Built as a kiosk-only fork of TaskFormShell's real prop contract (same
 * stepIds/stepTitles/step/setStep/accentColor/headerTitle/headerSubtitle/
 * reviewStepId/children shape, copied exactly) rather than modifying
 * TaskFormShell.tsx itself — that file is shared by real mobile screens and
 * the user was explicit about not touching any mobile file. KioskAddChoreForm.tsx
 * and KioskAddEventForm.tsx (kiosk-owned forks of AddQuestModal.tsx/
 * AddEventModal.tsx) import THIS shell instead of TaskFormShell — same
 * step content and field logic, different chrome only.
 *
 * Visual shape: KioskFormDrawer's own panelBase/panelDrawer dimensions
 * (width 520, full height, right-anchored, sliding in), the same values
 * KioskScanReviewForm.tsx already copies for the same reason — not a
 * bottom sheet.
 */
import { useEffect, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, Modal, KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { X, ChevronLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import StepProgressBar from '@/components/StepProgressBar';
import StepTransition from '@/components/StepTransition';
import { useKeyboardAwareMaxHeight } from '@/lib/useKeyboardAwareMaxHeight';
import { KioskModalHost } from '../KioskActivityContext';
import { useKioskColors } from '../kioskPalette';
import { KIOSK_SPACE, KIOSK_RADIUS, KIOSK_TYPO, KIOSK_HIT } from '../kioskTheme';

export function KioskTaskFormShell({
  visible, onClose, stepIds, stepTitles, step, setStep,
  accentColor, headerTitle, headerSubtitle, reviewStepId = 'review',
  children,
}: {
  visible: boolean;
  onClose: () => void;
  stepIds: readonly string[];
  stepTitles: Record<string, string>;
  step: number;
  setStep: React.Dispatch<React.SetStateAction<number>>;
  accentColor: string;
  headerTitle: string;
  headerSubtitle: string;
  reviewStepId?: string;
  children: React.ReactNode;
}) {
  const { k } = useKioskColors();
  const insets = useSafeAreaInsets();
  const keyboardAwareMaxHeight = useKeyboardAwareMaxHeight(92);

  const currentStepId = stepIds[Math.min(step, stepIds.length - 1)];
  const isReview = currentStepId === reviewStepId;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KioskModalHost style={s.host}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: k.scrim }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={`Close ${headerTitle}`}
        />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.right} pointerEvents="box-none">
          <View
            style={[s.panel, { backgroundColor: k.card, borderLeftColor: k.cardBorder }, keyboardAwareMaxHeight != null && { maxHeight: keyboardAwareMaxHeight }]}
            accessibilityViewIsModal
            accessibilityLabel={headerTitle}
          >
            {/* ── Head ── */}
            <View style={[s.head, { borderBottomColor: k.cardBorder }]}>
              {step > 0 && (
                <Pressable onPress={() => setStep(p => p - 1)} hitSlop={12} style={{ marginRight: 2 }} accessibilityRole="button" accessibilityLabel="Back">
                  <ChevronLeft size={22} color={k.textMuted} />
                </Pressable>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.title, { color: k.text }]} numberOfLines={1}>{headerTitle}</Text>
                <Text style={[s.sub, { color: accentColor }]} numberOfLines={1}>{headerSubtitle}</Text>
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                style={[s.closeBtn, { backgroundColor: k.well, borderColor: k.cardBorder }]}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={20} color={k.textMuted} />
              </Pressable>
            </View>

            {/* ── Step progress ── */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm, paddingHorizontal: KIOSK_SPACE.lg, paddingTop: KIOSK_SPACE.sm }}>
              <StepProgressBar stepCount={stepIds.length} activeIndex={step} accentColor={accentColor} trackColor={k.cardBorder} />
              <Text style={{ fontSize: KIOSK_TYPO.micro, fontWeight: '800', color: k.textFaint }}>{step + 1}/{stepIds.length}</Text>
            </View>
            <Text style={{ fontSize: KIOSK_TYPO.label, fontWeight: '800', color: accentColor, paddingHorizontal: KIOSK_SPACE.lg, marginTop: KIOSK_SPACE.xs, marginBottom: KIOSK_SPACE.xs }}>
              {stepTitles[currentStepId]}
            </Text>

            {/* ── Body ── */}
            <ScrollView
              style={s.body}
              contentContainerStyle={s.bodyContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <StepTransition stepKey={currentStepId}>
                {children}
              </StepTransition>

              {!isReview && (
                <View style={{ paddingTop: KIOSK_SPACE.sm }}>
                  <Pressable
                    style={({ pressed }) => [s.footerBtn, { backgroundColor: accentColor }, pressed && { opacity: 0.85 }]}
                    onPress={() => setStep(p => Math.min(p + 1, stepIds.length - 1))}
                    accessibilityRole="button"
                    accessibilityLabel="Next"
                  >
                    <Text style={{ color: k.onAccent, fontWeight: '900', fontSize: KIOSK_TYPO.body }}>Next</Text>
                  </Pressable>
                </View>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </KioskModalHost>
    </Modal>
  );
}

const s = StyleSheet.create({
  host: { flex: 1 },
  right: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' },
  panel: { width: 520, maxWidth: '100%', height: '100%', borderLeftWidth: 1, overflow: 'hidden' },
  head: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.md,
    padding: KIOSK_SPACE.lg, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: KIOSK_TYPO.heading, fontWeight: '800' },
  sub: { fontSize: KIOSK_TYPO.caption, fontWeight: '700', marginTop: 2 },
  closeBtn: { width: 40, height: 40, borderRadius: KIOSK_RADIUS.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  bodyContent: { padding: KIOSK_SPACE.lg, paddingBottom: KIOSK_SPACE.xxl },
  footerBtn: {
    minHeight: KIOSK_HIT.primary, borderRadius: KIOSK_RADIUS.md,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: KIOSK_SPACE.md,
  },
});
