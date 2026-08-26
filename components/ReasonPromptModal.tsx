/**
 * ReasonPromptModal — cross-platform replacement for Alert.prompt, which
 * only exists on iOS (React Native never implemented it for Android — a
 * call to it there either throws or silently no-ops). Every call site that
 * used it had a ternary/no-branch fallback that skipped straight to the
 * destructive action with NO confirmation and NO reason field on Android,
 * while iOS got a real prompt — a real cross-platform correctness gap, not
 * just a style difference. This gives both platforms the identical flow.
 */
import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { RADIUS, TYPO } from '@/constants/theme';

const REASON_MAX_LENGTH = 300;

export function ReasonPromptModal({
  visible, title, message, confirmLabel, destructive, colors, onCancel, onConfirm,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  colors: any;
  onCancel: () => void;
  onConfirm: (reason: string | undefined) => void;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (visible) setReason(''); }, [visible]);

  const confirmColor = destructive ? colors.danger : colors.primary;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={onCancel} />
        <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.xl, padding: 18, gap: 12 }}>
          <Text style={{ fontSize: TYPO.subheading, fontWeight: '800', color: colors.textPrimary }}>{title}</Text>
          <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, lineHeight: 19 }}>{message}</Text>
          <TextInput
            value={reason}
            onChangeText={t => setReason(t.slice(0, REASON_MAX_LENGTH))}
            placeholder="Add a reason (optional)"
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={REASON_MAX_LENGTH}
            style={{
              minHeight: 72, borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.border,
              backgroundColor: colors.surface, color: colors.textPrimary,
              paddingHorizontal: 12, paddingVertical: 10, fontSize: TYPO.body, textAlignVertical: 'top',
            }}
          />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <Pressable onPress={onCancel}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: RADIUS.md,
                borderWidth: 1.5, borderColor: colors.border }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textSecondary }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={() => onConfirm(reason.trim() || undefined)}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: RADIUS.md,
                backgroundColor: confirmColor }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
