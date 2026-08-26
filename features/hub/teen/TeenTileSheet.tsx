import {
  Modal, View, Text, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, StyleSheet, Platform, Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TYPO } from '@/constants/theme';

// A static-height bottom sheet for the Teen Hub's tile grid — AppBottomSheet
// measures actual content height (onLayout/onContentSizeChange) and grows
// the sheet to fit, which blows past a sane cap once the keyboard opens or
// content is long (the same bug AddQuestModal hit and fixed by dropping
// dynamic measurement entirely). This mirrors that fix: a plain
// Modal+KeyboardAvoidingView clipped by a fixed maxHeight, no content-driven
// resize.
export function TeenTileSheet({ visible, onClose, title, accentColor, colors, isDark, children }: {
  visible: boolean; onClose: () => void; title: string; accentColor: string;
  colors: any; isDark: boolean; children: React.ReactNode;
}) {
  const dismiss = () => { Keyboard.dismiss(); onClose(); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.backdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => { dismiss(); }} />
          <View style={[s.sheet, { backgroundColor: colors.card }]}>
            <View style={[s.handle, { backgroundColor: colors.border }]} />

            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Text style={[s.title, { color: colors.textPrimary, flex: 1 }]}>{title}</Text>
              <TouchableOpacity
                onPress={() => { dismiss(); }}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ padding: 8, borderRadius: 20, backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }}>
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="always"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 48 }}>
              {children}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12, maxHeight: '75%' },
  handle: { width: 44, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  title: { fontSize: TYPO.heading, fontWeight: '900' },
});
