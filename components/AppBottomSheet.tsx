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
import React, { useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, StyleSheet, Platform, Keyboard, Dimensions,
  type LayoutChangeEvent,
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
  const maxPx = toPx(maxHeight);

  const [chromeHeight, setChromeHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const sheetHeight = Math.min(Math.max(chromeHeight + contentHeight + footerHeight, minPx), maxPx);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.backdrop}>

          {/* Tap outside to close */}
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismiss} />

          {/* Sheet panel */}
          <View style={[s.sheet, { backgroundColor: colors.card, height: sheetHeight, maxHeight: maxPx }]}>

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
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
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
