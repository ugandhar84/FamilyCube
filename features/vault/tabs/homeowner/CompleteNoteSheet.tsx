/**
 * CompleteNoteSheet — confirmation + optional comment before marking a
 * maintenance reminder complete [live-requested: "while clicking on
 * complete we should ask for the confirmation swith comments text"].
 * A plain Modal + TextInput (not Alert.prompt, which is iOS-only) so this
 * works identically on both platforms, same pattern as the Add/Edit
 * sheets' own free-text fields.
 */
import { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import type { HomeownerNote } from '@/store/homeownerNotesStore';

export function CompleteNoteSheet({ visible, note, colors, onClose, onConfirm }: {
  visible: boolean; note: HomeownerNote | null; colors: any;
  onClose: () => void;
  onConfirm: (comment: string) => void;
}) {
  const [comment, setComment] = useState('');

  const close = () => { setComment(''); onClose(); };
  const confirm = () => { onConfirm(comment); setComment(''); };

  if (!note) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ padding: 20, gap: 14 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: colors.textPrimary }}>Mark as complete?</Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary }}>{note.title}</Text>

          <View>
            <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textTertiary, marginBottom: 4, letterSpacing: 0.4 }}>
              NOTES (OPTIONAL)
            </Text>
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="e.g. Used ABC HVAC, cost $180"
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={3}
              autoFocus
              style={{
                borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
                paddingHorizontal: 14, paddingVertical: 11, color: colors.textPrimary, fontSize: 15,
                backgroundColor: colors.card, minHeight: 80, textAlignVertical: 'top',
              }}
            />
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <TouchableOpacity
              onPress={close}
              style={{ flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, padding: 13, alignItems: 'center' }}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={confirm}
              style={{ flex: 1, borderRadius: 12, backgroundColor: colors.teal, padding: 13, alignItems: 'center' }}
            >
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>Complete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
