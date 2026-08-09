import {
  Modal, View, Text, TouchableOpacity, TouchableWithoutFeedback,
  KeyboardAvoidingView, StyleSheet, Platform, Keyboard,
} from 'react-native';
import PickerOverlay from './PickerOverlay';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss} onDismiss={onDismiss}>
      {/* Transparent backdrop — tapping it dismisses the sheet without darkening the screen */}
      {/* pointerEvents="none" when hidden so the dismissal animation doesn't swallow taps behind it */}
      <TouchableWithoutFeedback onPress={dismiss}>
        <View style={StyleSheet.absoluteFillObject} pointerEvents={visible ? 'auto' : 'none'} />
      </TouchableWithoutFeedback>

      {/* KAV owns full height so the sheet stays pinned to the keyboard */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        pointerEvents={visible ? 'auto' : 'none'}
        style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={[ss.sheet, {
            backgroundColor: colors.card,
            paddingBottom: Math.max(insets.bottom, extraBottom ?? 0) + 8,
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
      </KeyboardAvoidingView>
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
    maxHeight: '92%',
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
