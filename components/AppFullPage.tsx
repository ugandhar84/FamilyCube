/**
 * AppFullPage — a full-page overlay form with the same props as AppBottomSheet (visible, onClose, title, subtitle, children,
 * footer), for flows that should be a page instead of a bottom sheet (the grandparent Hub now matches every other role).
 *
 * Built on FullPageOverlay/OverlayPage, so it slides in from the right, swipe-back closes it, the real tab bar is hidden while it is open,
 * and it paints its own backdrop (no white flash). The title is a PageHeading; tapping it, the close button or swiping back all close.
 */
import React, { useEffect } from 'react';
import { View, ScrollView, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OverlayPage, OverlayHeading, useOverlayClose } from '@/components/OverlayPage';
import { useTheme } from '@/lib/ThemeContext';
import { RHYTHM } from '@/constants/theme';
import { hideTabBar, showTabBar } from '@/lib/tabBarVisibility';
import { useUIStore } from '@/store/uiStore';
import type { PageAccent } from '@/components/PageHeading';

interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  eyebrow?: string;
  accent?: PageAccent;
  children: React.ReactNode;
  /** Pinned below the scrolling body (Save / Cancel buttons). */
  footer?: React.ReactNode;
  /** Extra space under the last item of the scrolling body. */
  bodyPaddingBottom?: number;
  zIndex?: number;
  // Accepted so a bottom-sheet call site can switch over without edits; a page has no height to size.
  minHeight?: string; maxHeight?: string; accentColor?: string;
}

function CloseButton({ onClose }: { onClose: () => void }) {
  const { colors } = useTheme();
  const animatedClose = useOverlayClose();
  return (
    <Pressable onPress={() => (animatedClose ? animatedClose() : onClose())} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}
      style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }}>
      <X size={20} color={colors.textSecondary} />
    </Pressable>
  );
}

export default function AppFullPage({
  visible, onClose, title, subtitle, eyebrow = 'FAMILY CUBE', accent = 'teal', children, footer, bodyPaddingBottom = 24, zIndex = 80,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  // Cover the tab bar while the page is open, like every other full-page overlay.
  useEffect(() => {
    if (!visible) return;
    hideTabBar();
    useUIStore.getState().setFullBleedScreenActive(true);
    return () => { showTabBar(); useUIStore.getState().setFullBleedScreenActive(false); };
  }, [visible]);

  return (
    <OverlayPage visible={visible} onDismiss={onClose} zIndex={zIndex} backgroundColor={colors.background}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
          <OverlayHeading eyebrow={eyebrow} title={title} subtitle={subtitle} accent={accent} topInset={0} right={<CloseButton onClose={onClose} />} />
          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: RHYTHM.page, paddingTop: 4, gap: RHYTHM.item, paddingBottom: bodyPaddingBottom + (footer ? 0 : insets.bottom) }}>
            {children}
          </ScrollView>
          {footer ? (
            <View style={{ paddingHorizontal: RHYTHM.page, paddingTop: RHYTHM.item, paddingBottom: Math.max(insets.bottom, RHYTHM.page) }}>{footer}</View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </OverlayPage>
  );
}
