import { useEffect, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, TouchableWithoutFeedback,
  StyleSheet, Platform, Keyboard,
} from 'react-native';
import PickerOverlay from './PickerOverlay';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardAwareMaxHeight } from '@/lib/useKeyboardAwareMaxHeight';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** iOS only — fires after the dismiss animation fully completes */
  onDismiss?: () => void;
  title?: string;
  /** small node rendered left of title (e.g. a 28px EmojiAvatar) */
  titleIcon?: React.ReactNode;
  /** one-line context shown below the title in muted text */
  subtitle?: string;
  /** accent color for the icon badge background */
  accent?: string;
  children: React.ReactNode;
  /** extra bottom padding (e.g. for safe area on older devices) */
  extraBottom?: number;
  /** override / extend the sheet container style */
  style?: any;
}

/**
 * Standard bottom sheet used everywhere in the app.
 * - No dark backdrop — sheet slides up over content with a shadow
 * - X close button always present
 * - KAV owns full height so sheet stays glued to the keyboard
 * - Tap outside to dismiss
 */
export default function BottomSheet({ visible, onClose, onDismiss, title, titleIcon, subtitle, accent, children, extraBottom, style }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const dismiss = () => { Keyboard.dismiss(); onClose(); };

  // ss.sheet's maxHeight was 92% of the FULL screen — live-requested:
  // "apply same fixes in all bottomsheets - don't forget 75% is max but
  // fit to the content." Bumped topSafeMargin to 90, matching every other
  // sheet's fix this session.
  const keyboardAwareMaxHeight = useKeyboardAwareMaxHeight(75, 90);

  // Was: KeyboardAvoidingView 'padding' wrapping the whole sheet, relying
  // on it alone to both shrink the sheet's available space AND reposition
  // it above the keyboard. Every other sheet in the app that used this
  // combination (AppBottomSheet.tsx, EventFormModal.tsx, TaskFormShell.tsx)
  // turned out to double-count the keyboard height between KAV's own
  // padding and the height clamp above, producing either a form hidden
  // behind the keyboard or the sheet pushed too far up past the status bar
  // (both live-reported this session). Same fix: reserve the keyboard's
  // space via paddingBottom on the backdrop instead, and drop KAV entirely
  // — the maxHeight clamp above already limits how tall the sheet grows.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) => setKeyboardHeight(e.endCoordinates?.height ?? 0));
    const hide = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss} onDismiss={onDismiss}>
        <View pointerEvents={visible ? 'auto' : 'none'}
          style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: keyboardHeight }}>
        {/* Backdrop — only the flex area ABOVE the sheet, so it never sits on top of the sheet content */}
        <TouchableWithoutFeedback onPress={dismiss}>
          <View style={{ flex: 1 }} />
        </TouchableWithoutFeedback>
          <View style={[ss.sheet, {
            backgroundColor: colors.card,
            paddingBottom: Math.max(insets.bottom, extraBottom ?? 0) + 8,
            ...(keyboardAwareMaxHeight !== undefined ? { maxHeight: keyboardAwareMaxHeight } : {}),
          }, style]}>
            {/* Drag handle */}
            <View style={ss.handle}>
              <View style={[ss.handleBar, { backgroundColor: colors.border }]} />
            </View>

            {/* Header */}
            {(title || titleIcon) && (
              <View style={[ss.header, { borderBottomColor: colors.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  {titleIcon && (
                    <View style={ss.avatarWrap}>
                      {titleIcon}
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    {title && (
                      <Text style={[ss.title, { color: colors.textPrimary }]} numberOfLines={1}>{title}</Text>
                    )}
                    {subtitle && (
                      <Text style={[ss.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>{subtitle}</Text>
                    )}
                  </View>
                </View>
                <TouchableOpacity onPress={dismiss} style={[ss.closeBtn, { backgroundColor: isDark ? colors.surface : colors.background }]}>
                  <Ionicons name="close" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            )}

            {visible ? children : null}
          </View>
          {/* Filler pinned to the backdrop's bottom edge, UNDER the sheet,
              same color as the sheet — closes the small gap from
              keyboardWillShow's reported height not landing pixel-perfect
              against where the keyboard actually settles. */}
          {keyboardHeight > 0 && (
            <View pointerEvents="none"
              style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: keyboardHeight, backgroundColor: colors.card }} />
          )}
        </View>
      <PickerOverlay />
    </Modal>
  );
}

const ss = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 0,
    maxHeight: '75%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: -2 },
    shadowRadius: 8,
    elevation: 20,
  },
  handle:     { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  handleBar:  { width: 36, height: 4, borderRadius: 2 },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  avatarWrap: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  title:      { fontSize: 17, fontWeight: '800' },
  subtitle:   { fontSize: 14, fontWeight: '500', marginTop: 1 },
  closeBtn:   { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
