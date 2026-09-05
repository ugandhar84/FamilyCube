/**
 * KioskFormDrawer — the shared narrow-drawer shell every kiosk-native
 * "ask a parent" form renders inside.
 *
 * ── Why this exists ─────────────────────────────────────────────────────
 * The kid's eight Ask-Parent destinations used to mount SIX shared PHONE
 * modal components directly (GroceryModal/SuppliesModal/AskModal/
 * QuestProposalModal from features/hub/KidModals.tsx, KidChoreProposalModal,
 * and features/calendar/KidRequestModal). Each of those is a phone bottom
 * sheet — `Modal > KeyboardAvoidingView > backdrop(justifyContent:'flex-end')
 * > sheet` with no width of its own — so on a wide kiosk canvas it stretches
 * edge to edge, which reads wrong beside the narrow right-anchored drawers
 * the rest of kiosk uses (KioskAskFamDrawer at 480, KioskSheet at 520).
 *
 * That could NOT be fixed from the kiosk side: React Native sizes a Modal's
 * backdrop from the native modal WINDOW, not from anything above <Modal> in
 * the React tree, so no kiosk-side wrapper can narrow them — and the shared
 * phone files are explicitly off-limits to kiosk work, additively included.
 * So the answer is real kiosk-native replacements, and this is the frame
 * they share.
 *
 * ── Why not reuse KioskSheet ────────────────────────────────────────────
 * KioskKidQuickActions.tsx's KioskSheet is the right SHAPE but is (a) local
 * to that file, not exported, and (b) children-only: its whole body is one
 * ScrollView, with nowhere to pin a submit button. A form drawer needs its
 * primary action always reachable without scrolling to the bottom of a
 * long item list, so this adds a sticky footer (and an optional inline
 * error line above it) on top of the same host/right/panel trio, the same
 * scrim, the same KeyboardAvoidingView and the same KioskModalHost
 * idle-lock participation. Everything else is deliberately identical to
 * KioskSheet so the two read as one family.
 *
 * KioskModalHost is what keeps the idle lock suspended while a form is
 * open: touches inside a native Modal window never reach KioskScreen's root
 * onTouchStart, so without it a kid filling in a grocery list reads to the
 * idle timer as total inactivity and the lock throws the draft away.
 *
 * ── Two variants: 'drawer' and 'dialog' ─────────────────────────────────
 * Shipping all six forms as full-height right-anchored drawers was wrong
 * for the short ones. Live on a tablet, "Medication Alert" was one label,
 * one textarea and one button — roughly 300px of content — inside a panel
 * spanning the entire screen height, which is what prompted "so we really
 * need this much bottom sheet?".
 *
 * So the shell now has two shapes off the same chrome:
 *
 *   'dialog' (default) — CENTERED card, width capped the same 520, but
 *     HEIGHT DRIVEN BY CONTENT up to maxHeight 85%. Radius and border on
 *     all four sides. This is right for any form whose content is a fixed,
 *     known, short set of fields.
 *
 *   'drawer' — the original right-anchored panel, height:'100%'. Reserved
 *     for content that can genuinely run long or is inherently a "panel"
 *     experience: growable item lists, multi-step wizards, a day's meal
 *     plan.
 *
 * Everything else — scrim, KioskModalHost, KeyboardAvoidingView, the head,
 * the sticky footer — is shared verbatim between the two, so a variant flip
 * is purely a layout decision and can never change behaviour.
 *
 * Keyboard: a drawer is full-height, so KeyboardAvoidingView 'padding'
 * shrinks it from the bottom and the sticky footer rides up. A centered
 * dialog is NOT full-height, so bottom padding alone would push it up only
 * if it were bottom-anchored — with justifyContent:'center' the padding
 * reduces the available box and re-centers the card in what's left, which
 * lifts it above the keyboard correctly. The maxHeight is a PERCENTAGE of
 * that same shrinking box, so a tall dialog also gets shorter (and its body
 * scrolls) rather than being clipped. Both cases are handled by the one
 * KeyboardAvoidingView below; no per-variant keyboard branch is needed.
 */
import type { ReactNode } from 'react';
import {
  Modal, View, Text, Pressable,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { X } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { KioskModalHost } from '../KioskActivityContext';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import type { KioskColors } from '../kioskPalette';

export function KioskFormDrawer({
  visible, title, subtitle, accent, Icon, k, onClose, children,
  submitLabel, onSubmit, canSubmit, submitting = false, error,
  footerNote, headerRight, variant = 'dialog',
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  accent: string;
  Icon: LucideIcon;
  k: KioskColors;
  onClose: () => void;
  children: ReactNode;
  /** Sticky footer primary action. Omit onSubmit to render no footer. */
  submitLabel?: string;
  onSubmit?: () => void;
  canSubmit?: boolean;
  submitting?: boolean;
  /** Inline validation/failure text, shown just above the footer button. */
  error?: string | null;
  /** Quiet line under the submit button — e.g. "Parent approves each one". */
  footerNote?: string;
  /** Optional control beside the close button (progress dots, a mic, …). */
  headerRight?: ReactNode;
  /**
   * 'dialog' (default) — centered card, height driven by its content up to
   * 85% of the screen. Right for short, fixed-length forms.
   * 'drawer' — full-height right-anchored panel. Right for growable lists,
   * wizards, and long display content. See this file's header.
   */
  variant?: 'drawer' | 'dialog';
}) {
  const enabled = !!canSubmit && !submitting;
  const isDialog = variant === 'dialog';

  return (
    <Modal
      visible={visible}
      transparent
      // A drawer slides in from the edge it's anchored to; a centered card
      // has no edge to slide from, so it fades like a dialog should.
      animationType={isDialog ? 'fade' : 'slide'}
      onRequestClose={onClose}
    >
      <KioskModalHost style={s.host}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: k.scrim }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={`Close ${title}`}
        />
        {/* Live-reported on Android: with behavior=undefined (the previous
            value here), KeyboardAvoidingView does NOTHING on that platform
            — the keyboard simply overlapped the input and the sticky
            footer sat wherever the keyboard's top edge happened to land,
            rather than lifting above it. 'height' is RN's own documented
            Android equivalent of iOS's 'padding' for this exact shell
            shape (a Modal that already renders above everything else, so
            resizing the KeyboardAvoidingView's box — not the whole window
            — is what's needed on both platforms). */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={isDialog ? s.center : s.right}
          pointerEvents="box-none"
        >
          <View
            style={[
              s.panelBase,
              isDialog
                ? [s.panelDialog, { borderColor: k.cardBorder }]
                : [s.panelDrawer, { borderLeftColor: k.cardBorder }],
              { backgroundColor: k.card },
            ]}
            accessibilityViewIsModal
            accessibilityLabel={title}
          >
            {/* ── Head ── */}
            <View style={[s.head, { borderBottomColor: k.cardBorder }]}>
              <View style={[s.headIcon, { backgroundColor: accent + '1A', borderColor: accent + '3D' }]}>
                <Icon size={22} color={accent} />
              </View>
              <View
                style={{ flex: 1, minWidth: 0 }}
                accessible
                accessibilityRole="header"
                accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
              >
                <Text style={[s.title, { color: k.text }]} numberOfLines={1}>{title}</Text>
                {!!subtitle && (
                  <Text style={[s.sub, { color: k.textMuted }]} numberOfLines={2}>{subtitle}</Text>
                )}
              </View>
              {headerRight}
              <Pressable
                onPress={onClose}
                hitSlop={12}
                style={[s.closeBtn, { backgroundColor: k.well, borderColor: k.cardBorder }]}
                accessibilityRole="button"
                accessibilityLabel="Close"
                accessibilityHint={`Closes ${title} without sending`}
              >
                <X size={20} color={k.textMuted} />
              </Pressable>
            </View>

            {/* ── Body ── */}
            {/*
              The submit button used to be a separate sticky footer View
              OUTSIDE this ScrollView, fixed to the bottom of the panel.
              Live-reported: with the keyboard open, that fixed button
              ended up floating at whatever height the keyboard's top edge
              left available — sometimes overlapping the very field it was
              meant to submit, instead of sitting naturally right after the
              form's last field. Moved inside the ScrollView as the last
              item in its content instead: it now scrolls WITH the form and
              always appears immediately below wherever the fields end, and
              the keyboard simply pushes the whole scrollable column up
              rather than fighting a fixed element for space.

              In a drawer the body still takes all the leftover height
              (flex:1) so a short form's button sits high with room below;
              in a dialog it shrink-wraps — flexGrow:0 + flexShrink:1 — so
              a two-field form produces a short card, and only once the
              content (fields + button) exceeds maxHeight does the body cap
              out and start scrolling.

              KeyboardAwareScrollView (not a plain ScrollView) on top of the
              outer KeyboardAvoidingView above: the two solve DIFFERENT
              problems and are not redundant. The outer view shrinks/re-
              centers the whole panel so the keyboard doesn't cover it. This
              inner one then auto-scrolls whichever field is actually
              focused up above the keyboard within that already-shrunk
              space — without it, a field lower in a long form (e.g. the
              third item row in the grocery/supplies drawers) could still
              end up hidden behind the keyboard even though the panel
              itself fit, requiring a kid to manually scroll to see what
              they were typing.
            */}
            <KeyboardAwareScrollView
              style={isDialog ? s.bodyDialog : s.body}
              contentContainerStyle={s.bodyContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="always"
              enableOnAndroid
              enableAutomaticScroll
              extraScrollHeight={KIOSK_SPACE.lg}
              keyboardOpeningTime={0}
            >
              {children}

              {!!onSubmit && (
                <View style={s.foot}>
                  {!!error && (
                    <Text style={[s.error, { color: k.danger }]} numberOfLines={3}>{error}</Text>
                  )}
                  <Pressable
                    onPress={onSubmit}
                    disabled={!enabled}
                    style={({ pressed }) => [
                      s.submit,
                      { backgroundColor: enabled ? accent : k.well, borderColor: enabled ? accent : k.cardBorder },
                      pressed && enabled && { opacity: 0.85 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={submitLabel ?? 'Send to parent'}
                    accessibilityState={{ disabled: !enabled, busy: submitting }}
                    accessibilityHint="Sends this request to a parent for approval"
                  >
                    {submitting ? (
                      <ActivityIndicator size="small" color={k.onAccent} />
                    ) : (
                      <Text
                        style={[s.submitText, { color: enabled ? k.onAccent : k.textFaint }]}
                        numberOfLines={1}
                      >
                        {submitLabel ?? 'Send to Parent'}
                      </Text>
                    )}
                  </Pressable>
                  {!!footerNote && (
                    <Text style={[s.footNote, { color: k.textFaint }]} numberOfLines={2}>{footerNote}</Text>
                  )}
                </View>
              )}
            </KeyboardAwareScrollView>
          </View>
        </KeyboardAvoidingView>
      </KioskModalHost>
    </Modal>
  );
}

// ── Small shared form primitives ────────────────────────────────────────
// Every one of the six forms needs the same three things: a field label, a
// text input, and a selectable pill. Factoring them here keeps the six from
// each re-deriving kiosk-scale padding/type/hit numbers.

export function KioskFieldLabel({ children, k }: { children: ReactNode; k: KioskColors }) {
  return <Text style={[s.fieldLabel, { color: k.textMuted }]}>{children}</Text>;
}

export function kioskInputStyle(k: KioskColors) {
  return {
    minHeight: KIOSK_HIT.control,
    borderRadius: KIOSK_RADIUS.md,
    borderWidth: 1,
    borderColor: k.cardBorder,
    backgroundColor: k.well,
    color: k.text,
    paddingHorizontal: KIOSK_SPACE.md,
    paddingVertical: KIOSK_SPACE.sm,
    fontSize: KIOSK_TYPO.body,
    fontWeight: '600' as const,
  };
}

export function KioskPill({
  label, selected, onPress, accent, k, hint,
}: {
  label: string; selected: boolean; onPress: () => void;
  accent: string; k: KioskColors; hint?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.pill,
        {
          backgroundColor: selected ? accent + '1F' : (pressed ? k.cardHover : k.well),
          borderColor: selected ? accent : k.cardBorder,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      accessibilityHint={hint}
    >
      <Text
        style={[s.pillText, { color: selected ? accent : k.textMuted }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  host: { flex: 1 },
  right: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' },
  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: KIOSK_SPACE.xl,
  },
  // Same 520 KioskSheet uses — these forms carry more per row (name + qty +
  // remove) than KioskAskFamDrawer's 480 chat column comfortably fits.
  panelBase: { width: 520, maxWidth: '100%', overflow: 'hidden' },
  panelDrawer: { height: '100%', borderLeftWidth: 1 },
  // No fixed height: the card is as tall as head + body + footer, and only
  // stops growing at maxHeight, after which the body scrolls. maxHeight is
  // a percentage of the KeyboardAvoidingView's box, so it shrinks with the
  // keyboard too.
  panelDialog: {
    maxHeight: '85%', borderWidth: 1, borderRadius: KIOSK_RADIUS.lg,
  },
  head: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.md,
    padding: KIOSK_SPACE.lg, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headIcon: {
    width: 48, height: 48, borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: KIOSK_TYPO.heading, fontWeight: '800', letterSpacing: -0.3 },
  sub: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 2 },
  closeBtn: {
    width: KIOSK_HIT.min, height: KIOSK_HIT.min, borderRadius: KIOSK_RADIUS.full,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  body: { flex: 1 },
  bodyDialog: { flexGrow: 0, flexShrink: 1 },
  bodyContent: { padding: KIOSK_SPACE.lg, gap: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.xl },
  // No longer a bordered/backgrounded sticky bar — it's the last item in
  // the scrolling body now, so a plain top margin (matching the body's own
  // `gap`) is all it needs to read as the next section, not a fixed panel.
  foot: {
    marginTop: KIOSK_SPACE.xs, gap: KIOSK_SPACE.sm,
  },
  error: { fontSize: KIOSK_TYPO.caption, fontWeight: '700' },
  submit: {
    minHeight: KIOSK_HIT.primary, borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: KIOSK_SPACE.md,
  },
  submitText: { fontSize: KIOSK_TYPO.body, fontWeight: '900' },
  footNote: { fontSize: KIOSK_TYPO.micro, fontWeight: '600', textAlign: 'center' },
  fieldLabel: { fontSize: KIOSK_TYPO.label, fontWeight: '800', letterSpacing: 0.4 },
  pill: {
    borderRadius: KIOSK_RADIUS.full, borderWidth: 1,
    paddingHorizontal: KIOSK_SPACE.md, minHeight: KIOSK_HIT.min,
    justifyContent: 'center',
  },
  pillText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
});
