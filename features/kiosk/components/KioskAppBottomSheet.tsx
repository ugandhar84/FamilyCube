/**
 * KioskAppBottomSheet — kiosk-only replacement for components/AppBottomSheet.tsx
 * (the shared bottom-sheet primitive, 37 real call sites app-wide — far too
 * broad to fork/edit itself), same right-side drawer shape as
 * KioskFormDrawer/KioskTaskFormShell/KioskDateTimePicker [live-reported:
 * "smart tasker also right side form" / "the what do you need also should
 * be side form"].
 *
 * Built as a kiosk-only fork of AppBottomSheet's real prop contract (same
 * visible/onClose/title/subtitle/accentColor/children/footer/minHeight/
 * maxHeight/bodyPaddingBottom shape) rather than modifying AppBottomSheet.tsx
 * itself. SmartTaskComposer.tsx's kiosk fork imports THIS instead of
 * AppBottomSheet — same field content and logic, different chrome only.
 * AppBottomSheet.tsx itself is untouched.
 *
 * minHeight/maxHeight/bodyPaddingBottom are accepted for prop-contract
 * parity but don't drive anything here — a fixed right-anchored drawer has
 * no bottom-sheet-style variable height to clamp, unlike the original's own
 * measured-chrome+content+footer/keyboard-aware sizing math (which only
 * exists to solve problems specific to an actual bottom sheet).
 *
 * Visual shape: KioskFormDrawer's own panelBase/panelDrawer dimensions
 * (width 520, full height, right-anchored, sliding in), same values
 * KioskTaskFormShell.tsx/KioskScanReviewForm.tsx already copy for the same
 * reason — not a bottom sheet.
 */
import { View, Text, Pressable, ScrollView, Modal, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { X } from 'lucide-react-native';
import { KioskModalHost } from '../KioskActivityContext';
import { useKioskColors } from '../kioskPalette';
import { KIOSK_SPACE, KIOSK_RADIUS, KIOSK_TYPO } from '../kioskTheme';

export function KioskAppBottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  accentColor,
  children,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  accentColor?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  minHeight?: string;
  maxHeight?: string;
  bodyPaddingBottom?: number;
}) {
  const { k } = useKioskColors();
  const accent = accentColor ?? k.primary;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KioskModalHost style={s.host}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: k.scrim }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={`Close ${title}`}
        />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.right} pointerEvents="box-none">
          <View
            style={[s.panel, { backgroundColor: k.card, borderLeftColor: k.cardBorder }]}
            accessibilityViewIsModal
            accessibilityLabel={title}
          >
            {/* ── Head ── */}
            <View style={[s.head, { borderBottomColor: k.cardBorder }]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.title, { color: k.text }]} numberOfLines={1}>{title}</Text>
                {!!subtitle && (
                  <Text style={[s.sub, { color: accent }]} numberOfLines={1}>{subtitle}</Text>
                )}
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

            {/* ── Body ── */}
            <ScrollView
              style={s.body}
              contentContainerStyle={s.bodyContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>

            {/* ── Optional sticky footer ── */}
            {!!footer && (
              <View style={[s.footer, { borderTopColor: k.cardBorder }]}>
                {footer}
              </View>
            )}
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
  footer: { padding: KIOSK_SPACE.lg, borderTopWidth: StyleSheet.hairlineWidth },
});
