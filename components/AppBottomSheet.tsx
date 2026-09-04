/**
 * AppBottomSheet — canonical bottom sheet for FamilyCubeApp.
 *
 * Structure:
 *   Modal (slide, transparent)
 *     KeyboardAvoidingView
 *       backdrop (dark overlay, flex:1)
 *         TouchableOpacity tap-area  ← dismisses keyboard + closes sheet
 *         sheet panel
 *           drag handle
 *           fixed header (title + subtitle + close X)  ← not scrolled
 *           ScrollView body                            ← keyboard-aware
 *           [optional sticky footer]
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, StyleSheet, Platform, Keyboard, Dimensions,
  useWindowDimensions, type LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';

interface AppBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Sheet title — shown in fixed header */
  title: string;
  /** Muted one-liner below the title */
  subtitle?: string;
  /** Accent color for subtitle text (default: theme purple) */
  accentColor?: string;
  /** Body content — rendered inside the ScrollView */
  children: React.ReactNode;
  /** Sticky content pinned below the ScrollView (e.g. Save/Cancel buttons) */
  footer?: React.ReactNode;
  /** Minimum sheet height as a percentage string, e.g. '60%' (default '50%') */
  minHeight?: string;
  /** Maximum sheet height as a percentage string (default '92%') */
  maxHeight?: string;
  /** Extra padding at the bottom of the scroll body (default 40) */
  bodyPaddingBottom?: number;
}

export default function AppBottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  accentColor,
  children,
  footer,
  minHeight = '50%',
  maxHeight = '75%',
  bodyPaddingBottom = 40,
}: AppBottomSheetProps) {
  const { colors, isDark } = useTheme();
  const accent = accentColor ?? (isDark ? '#A78BFA' : '#7C3AED');

  // Edge-to-edge full-width worked fine on a phone-portrait sheet, but the
  // same unbounded width on a wide/landscape screen (tablet, kiosk) stretches
  // form rows across a foot of screen with the mic/input controls pinned way
  // out at the edges — live-reported: "this is wider form instead we can use
  // the centered form with nice layout.. and same for the landscape mode it
  // is worse." Cap the panel at a comfortable reading width and center it
  // once the window is wider than a phone in portrait; narrower viewports
  // (the common case) are completely unaffected.
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= 560;
  const sheetWidth = isWide ? Math.min(560, windowWidth - 48) : undefined;

  const dismiss = () => { Keyboard.dismiss(); onClose(); };

  // Percentage minHeight/maxHeight can't coexist with a flex:1 ScrollView the
  // way CSS min/max-height would — Yoga has no content-driven size to lean on,
  // so it always collapses to minHeight. Instead we measure the actual chrome
  // (handle+header), footer, and scroll content heights and pick an explicit
  // pixel height between the min/max bounds — that's what lets the sheet grow
  // with its content while still pinning the optional footer to the bottom.
  const screenHeight = Dimensions.get('window').height;
  const toPx = (pct: string) => (parseFloat(pct) / 100) * screenHeight;
  const minPx = toPx(minHeight);
  const rawMaxPx = toPx(maxHeight);

  // maxPx alone was computed against the FULL, keyboard-agnostic screen
  // height — but KeyboardAvoidingView's 'padding' behavior (below) eats
  // into that same space once the keyboard opens, shrinking the actual
  // room available above it without this sheet's own height budget ever
  // shrinking to match. A sheet already near its percentage max (e.g. the
  // invite sheet's 92%) could end up needing more vertical room than was
  // genuinely left once the keyboard was accounted for, pushing content up
  // past the top of the screen or behind the status bar — live-reported as
  // "the invite sheet gets pushed way up with the keyboard open, no max
  // height." Track the real keyboard height and clamp maxPx to whatever's
  // actually left below it, with a little breathing room reserved above.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) => setKeyboardHeight(e.endCoordinates?.height ?? 0));
    const hide = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const TOP_SAFE_MARGIN = 60;
  const maxPx = keyboardHeight > 0
    ? Math.min(rawMaxPx, screenHeight - keyboardHeight - TOP_SAFE_MARGIN)
    : rawMaxPx;

  const [chromeHeight, setChromeHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  // maxPx must win outright if the keyboard has shrunk it below minPx —
  // Math.max(..., minPx) would otherwise override a keyboard-driven clamp
  // that's tighter than the sheet's own configured minimum, re-introducing
  // the exact overflow this was meant to prevent.
  const sheetHeight = Math.min(Math.max(chromeHeight + contentHeight + footerHeight, minPx), maxPx);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      {/* Live-reported ("form is hiding behind the keyboard litrally" /
          "weird grey gap instead of blending to the keyboard") on the
          hand-rolled sheets in EventFormModal.tsx/TaskFormShell.tsx traced
          to the same underlying issue this component's own KeyboardAvoidingView
          'padding' wrapper doesn't fully avoid either: `sheetHeight`/`maxPx`
          are computed once against the full, keyboard-agnostic screenHeight,
          then KeyboardAvoidingView ALSO eats into that same space with its
          own padding once the keyboard opens — the sheet's explicit
          `height: sheetHeight` doesn't reactively shrink to match, so the
          KeyboardAvoidingView's padding can push a fixed-height sheet's
          content down past where the keyboard-aware maxPx clamp assumed it
          would end up. Applying the SAME fix that actually worked there:
          reserve room for the keyboard via paddingBottom on the backdrop
          (not by fighting over it with KeyboardAvoidingView) and drop
          KeyboardAvoidingView entirely — the maxPx clamp already limits how
          tall the sheet can grow, and the backdrop's flex:1 spacer above
          the sheet naturally shrinks to close the same gap once padding
          reserves the keyboard's space. */}
        <View style={[s.backdrop, { paddingBottom: keyboardHeight }]}>

          {/* Tap outside to close */}
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismiss} />

          {/* Sheet panel */}
          <View style={[s.sheet, { backgroundColor: colors.card, height: sheetHeight, maxHeight: maxPx },
            isWide ? { width: sheetWidth, maxWidth: sheetWidth, alignSelf: 'center', borderBottomLeftRadius: 24, borderBottomRightRadius: 24, marginBottom: 24 } : null]}>

            <View onLayout={(e: LayoutChangeEvent) => setChromeHeight(e.nativeEvent.layout.height)}>
              {/* Drag handle */}
              <View style={[s.handle, { backgroundColor: colors.border }]} />

              {/* Fixed header */}
              <View style={[s.header, { borderBottomColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.title, { color: colors.textPrimary }]}>{title}</Text>
                  {subtitle ? (
                    <Text style={[s.subtitle, { color: accent }]}>{subtitle}</Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={dismiss}
                  hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                  style={[s.closeBtn, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                  <Ionicons name="close" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Scrollable body */}
            {/* No automaticallyAdjustKeyboardInsets here — EventFormModal.tsx's
                own sheet (the proven-working "old event form" pattern) never
                used it either, relying only on KeyboardAvoidingView +
                useKeyboardAwareMaxHeight to shrink the sheet's own bound
                around the keyboard. This component already does the
                equivalent via sheetHeight/maxPx (see the keyboardHeight
                effect above). automaticallyAdjustKeyboardInsets was added
                later specifically to also auto-scroll a newly-focused LOWER
                field into view, but it double-compensates for the same
                keyboard event that KeyboardAvoidingView's own padding
                already handles — live-reported (screenshot):
                SmartTaskComposer's sheet content shoved down behind a large
                blank gap. Net effect of removing it: a field far down a
                long form (AddMealSheet's Ingredients/Steps) may need a
                manual scroll to bring fully into view again, same as
                EventFormModal's own fields always have — a real but much
                smaller regression than a sheet whose content is
                unreachable without scrolling past a mystery gap. */}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              onScrollBeginDrag={Keyboard.dismiss}
              onContentSizeChange={(_w, h) => setContentHeight(h)}
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 20, paddingBottom: bodyPaddingBottom }}
              showsVerticalScrollIndicator={false}>
              {children}
            </ScrollView>

            {/* Optional sticky footer */}
            {footer ? (
              <View onLayout={(e: LayoutChangeEvent) => setFooterHeight(e.nativeEvent.layout.height)}
                style={[s.footer, { borderTopColor: colors.border }]}>
                {footer}
              </View>
            ) : null}

          </View>
          {/* Filler pinned to the very bottom of the backdrop, UNDER the
              sheet, same color as the sheet — closes the small gap from
              keyboardWillShow's reported height not landing pixel-perfect
              against where the keyboard actually settles, same fix as
              TaskFormShell.tsx/EventFormModal.tsx's own filler. Positioned
              absolute so it sits BEHIND the sheet's bottom edge instead of
              competing with it for the backdrop's flex-end space. */}
          {keyboardHeight > 0 && (
            <View pointerEvents="none"
              style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: keyboardHeight, backgroundColor: colors.card }} />
          )}
        </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 24,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    padding: 16,
    paddingBottom: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
