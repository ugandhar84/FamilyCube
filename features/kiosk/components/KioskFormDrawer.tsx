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
 */
import type { ReactNode } from 'react';
import {
  Modal, View, Text, Pressable, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { X } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { KioskModalHost } from '../KioskActivityContext';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import type { KioskColors } from '../kioskPalette';

export function KioskFormDrawer({
  visible, title, subtitle, accent, Icon, k, onClose, children,
  submitLabel, onSubmit, canSubmit, submitting = false, error,
  footerNote, headerRight,
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
}) {
  const enabled = !!canSubmit && !submitting;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KioskModalHost style={s.host}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: k.scrim }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={`Close ${title}`}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={s.right}
          pointerEvents="box-none"
        >
          <View
            style={[s.panel, { backgroundColor: k.card, borderLeftColor: k.cardBorder }]}
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
            <ScrollView
              style={s.body}
              contentContainerStyle={s.bodyContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="always"
            >
              {children}
            </ScrollView>

            {/* ── Sticky footer ── */}
            {!!onSubmit && (
              <View style={[s.foot, { borderTopColor: k.cardBorder, backgroundColor: k.card }]}>
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
  // Same 520 KioskSheet uses — these forms carry more per row (name + qty +
  // remove) than KioskAskFamDrawer's 480 chat column comfortably fits.
  panel: { width: 520, maxWidth: '100%', height: '100%', borderLeftWidth: 1, overflow: 'hidden' },
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
  bodyContent: { padding: KIOSK_SPACE.lg, gap: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.xl },
  foot: {
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: KIOSK_SPACE.lg, gap: KIOSK_SPACE.sm,
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
